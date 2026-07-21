// Utah DHHS EVV export — date-range picker → pre-export review → confirm.
// Persists a numbered batch + one record per emitted row so the same timesheet
// is never double-submitted, and so an approved post-export correction can be
// re-emitted with Orig_receipt_id linked to the original record_id.

import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, AlertTriangle, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { isEvvLockedCode, padMemberId, evvServiceLabel } from "@/lib/evv-codes";
import {
  buildUtahCsv, downloadCsv, defaultPreviousWeek, isValidIso, parseUsAddress, type UtahExportLine,
} from "@/lib/utah-evv-export";
import { isBillableForReview } from "@/lib/billing-units";

type Coord = { latitude: number; longitude: number } | null;
interface TsRow {
  id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  rounded_clock_in: string | null;
  rounded_clock_out: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  review_status: string | null;
  reviewed_at: string | null;
  status: string;
  outside_geofence_reason: string | null;
  reconciliation_status: string | null;
  gps_in_coordinates: Coord;
  gps_out_coordinates: Coord;
  staff_id: string;
  matched_approved_location_id: string | null;
  clients: { first_name: string; last_name: string; physical_address: string | null; medicaid_id: string | null } | null;
}
interface ExportRecordRow {
  id: string;
  timesheet_id: string;
  batch_id: string;
  record_id: number;
  is_correction: boolean;
  orig_record: string | null;
  created_at: string;
}
interface BatchRow {
  id: string;
  batch_number: number;
  range_start: string;
  range_end: string;
  row_count: number;
  created_by: string | null;
  created_at: string;
}

function effIn(r: TsRow) {
  if (r.review_status === "approved" && r.corrected_clock_in) return r.corrected_clock_in;
  return r.rounded_clock_in ?? r.clock_in_timestamp;
}
function effOut(r: TsRow) {
  if (r.review_status === "approved" && r.corrected_clock_out) return r.corrected_clock_out;
  return r.rounded_clock_out ?? r.clock_out_timestamp;
}

interface CategorizedRow {
  row: TsRow;
  address: string;
  memberId: string;
  excludeReason: null | "missing_member_id" | "missing_location" | "out_of_bounds" | "already_exported" | "no_clock_out" | "not_reviewed";
  addressBlank: boolean;
  gpsAbsent: boolean;
}

// Utah UEVV spec requires, for BOTH the begin and end of service, either a
// usable street address + city OR GPS lat/lng. A row lacking both pairs at
// both ends has nothing the state can key location off of and will be
// rejected — flag it before export rather than silently emitting blanks.
function categorize(rows: TsRow[], exportedIds: Set<string>, addressMap: Map<string, string>): CategorizedRow[] {
  return rows.map((r) => {
    const memberId = padMemberId(r.clients?.medicaid_id ?? "");
    const locAddr = r.matched_approved_location_id ? (addressMap.get(r.matched_approved_location_id) ?? "") : "";
    const address = (locAddr || r.clients?.physical_address || "").trim();
    const parsedAddress = parseUsAddress(address);
    const hasUsableAddress = !!(parsedAddress.street && parsedAddress.city);
    const beginGpsAbsent = !r.gps_in_coordinates?.latitude && !r.gps_in_coordinates?.longitude;
    const endGpsAbsent = !r.gps_out_coordinates?.latitude && !r.gps_out_coordinates?.longitude;
    const missingLocation = !hasUsableAddress && beginGpsAbsent && endGpsAbsent;
    let excludeReason: CategorizedRow["excludeReason"] = null;
    if (!effOut(r)) excludeReason = "no_clock_out";
    else if (exportedIds.has(r.id)) excludeReason = "already_exported";
    else if (!isBillableForReview(r)) excludeReason = "not_reviewed";
    else if (!memberId) excludeReason = "missing_member_id";
    else if (missingLocation) excludeReason = "missing_location";
    else if (
      r.outside_geofence_reason &&
      r.outside_geofence_reason.trim().length > 0 &&
      r.reconciliation_status !== "accepted" &&
      r.reconciliation_status !== "corrected"
    ) excludeReason = "out_of_bounds";
    return { row: r, address, memberId, excludeReason, addressBlank: !address, gpsAbsent: beginGpsAbsent };
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  staffNameMap: Map<string, string>;
}

export function UtahExportDialog({ open, onClose, organizationId, staffNameMap }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const defaults = useMemo(() => defaultPreviousWeek(), []);
  const [from, setFrom] = useState(defaults.start);
  const [to, setTo] = useState(defaults.end);
  const [confirming, setConfirming] = useState(false);

  // Org settings (provider id + vendor)
  const orgQ = useQuery({
    enabled: open,
    queryKey: ["org-evv-settings", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("dhhs_provider_id, evv_vendor_name" as any)
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { dhhs_provider_id: null, evv_vendor_name: "Hive" }) as unknown as { dhhs_provider_id: string | null; evv_vendor_name: string };
    },
  });

  // Approved EVV-locked rows in date range
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;
  const rowsQ = useQuery({
    enabled: open && !!from && !!to,
    queryKey: ["utah-export-rows", organizationId, fromIso, toIso],
    queryFn: async (): Promise<TsRow[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, corrected_clock_in, corrected_clock_out, review_status, reviewed_at, status, outside_geofence_reason, reconciliation_status, gps_in_coordinates, gps_out_coordinates, staff_id, matched_approved_location_id, clients(first_name, last_name, physical_address, medicaid_id)" as any)
        .eq("organization_id", organizationId)
        .gte("clock_in_timestamp", fromIso)
        .lte("clock_in_timestamp", toIso)
        .order("clock_in_timestamp", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as TsRow[]).filter((r) => isEvvLockedCode(r.service_type_code));
    },
  });

  // Export records for these timesheet IDs (to detect already-exported)
  const tsIds = (rowsQ.data ?? []).map((r) => r.id);
  const existingQ = useQuery({
    enabled: open && tsIds.length > 0,
    queryKey: ["utah-export-existing", organizationId, tsIds.join(",")],
    queryFn: async (): Promise<ExportRecordRow[]> => {
      const { data, error } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, timesheet_id, batch_id, record_id, is_correction, orig_record, created_at" as any)
        .eq("organization_id", organizationId)
        .in("timesheet_id", tsIds);
      if (error) throw error;
      return (data ?? []) as unknown as ExportRecordRow[];
    },
  });

  // Approved-location address map
  const locIds = Array.from(new Set((rowsQ.data ?? []).map((r) => r.matched_approved_location_id).filter(Boolean) as string[]));
  const locQ = useQuery({
    enabled: open && locIds.length > 0,
    queryKey: ["utah-export-locs", locIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_approved_locations")
        .select("id, address")
        .in("id", locIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; address: string | null }>) {
        if (r.address) m.set(r.id, r.address);
      }
      return m;
    },
  });

  // Corrections to re-export (ANY exported timesheet whose correction was
  // approved AFTER its non-correction export, with no later correction export).
  const correctionsQ = useQuery({
    enabled: open,
    queryKey: ["utah-export-corrections", organizationId],
    queryFn: async () => {
      const { data: recs, error: e1 } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, timesheet_id, record_id, batch_id, is_correction, created_at" as any)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      if (e1) throw e1;
      const all = (recs ?? []) as unknown as ExportRecordRow[];
      // group by timesheet_id
      const byTs = new Map<string, ExportRecordRow[]>();
      for (const r of all) {
        const arr = byTs.get(r.timesheet_id) ?? [];
        arr.push(r); byTs.set(r.timesheet_id, arr);
      }
      const candidateTsIds: string[] = [];
      const origByTs = new Map<string, ExportRecordRow>();
      for (const [tsId, list] of byTs.entries()) {
        const orig = list.find((x) => !x.is_correction);
        if (!orig) continue;
        const latest = list[list.length - 1];
        origByTs.set(tsId, orig);
        // need to load timesheet to compare reviewed_at > latest.created_at
        candidateTsIds.push(tsId);
        void latest;
      }
      if (candidateTsIds.length === 0) return { rows: [] as TsRow[], origByTs, latestByTs: new Map<string, string>() };
      const { data: tsRows, error: e2 } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, corrected_clock_in, corrected_clock_out, review_status, reviewed_at, status, outside_geofence_reason, reconciliation_status, gps_in_coordinates, gps_out_coordinates, staff_id, matched_approved_location_id, clients(first_name, last_name, physical_address, medicaid_id)" as any)
        .eq("organization_id", organizationId)
        .in("id", candidateTsIds);
      if (e2) throw e2;
      const latestByTs = new Map<string, string>();
      for (const [tsId, list] of byTs.entries()) latestByTs.set(tsId, list[list.length - 1].created_at);
      const filtered = ((tsRows ?? []) as unknown as TsRow[]).filter((r) => {
        if (r.review_status !== "approved" || !r.reviewed_at) return false;
        if (!r.corrected_clock_in && !r.corrected_clock_out) return false;
        const latest = latestByTs.get(r.id);
        if (!latest) return false;
        return new Date(r.reviewed_at).getTime() > new Date(latest).getTime();
      });
      return { rows: filtered, origByTs, latestByTs };
    },
  });

  const exportedIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of existingQ.data ?? []) s.add(r.timesheet_id);
    return s;
  }, [existingQ.data]);

  const addressMap = locQ.data ?? new Map<string, string>();
  const categorized = useMemo(
    () => categorize(rowsQ.data ?? [], exportedIds, addressMap),
    [rowsQ.data, exportedIds, addressMap],
  );

  // Pre-export counts
  const eligible = categorized.filter((c) => c.excludeReason === null);
  const missingMember = categorized.filter((c) => c.excludeReason === "missing_member_id");
  const missingLocation = categorized.filter((c) => c.excludeReason === "missing_location");
  const outOfBounds = categorized.filter((c) => c.excludeReason === "out_of_bounds");
  const noClockOut = categorized.filter((c) => c.excludeReason === "no_clock_out");
  const alreadyExported = categorized.filter((c) => c.excludeReason === "already_exported");
  const notReviewed = categorized.filter((c) => c.excludeReason === "not_reviewed");
  const addressBlankCount = eligible.filter((c) => c.addressBlank).length;
  const gpsAbsentCount = eligible.filter((c) => c.gpsAbsent).length;

  const [selectedCorrections, setSelectedCorrections] = useState<Set<string>>(new Set());
  const toggleCorrection = (id: string) =>
    setSelectedCorrections((prev) => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
    });

  const correctionRows = correctionsQ.data?.rows ?? [];
  const origByTs = correctionsQ.data?.origByTs ?? new Map<string, ExportRecordRow>();

  // Past batches
  const batchesQ = useQuery({
    enabled: open,
    queryKey: ["utah-export-batches", organizationId],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await supabase
        .from("evv_export_batches")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, batch_number, range_start, range_end, row_count, created_by, created_at" as any)
        .eq("organization_id", organizationId)
        .order("batch_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BatchRow[];
    },
  });

  const nextBatchNumber = (batchesQ.data?.[0]?.batch_number ?? 0) + 1;
  const providerId = (orgQ.data?.dhhs_provider_id ?? "").trim();
  const vendor = (orgQ.data?.evv_vendor_name ?? "Hive").trim() || "Hive";
  const providerMissing = !providerId;

  const confirm = useMutation({
    mutationFn: async () => {
      if (providerMissing) throw new Error("Set the DHHS Provider ID in organization settings first.");
      const correctionLines = correctionRows.filter((r) => selectedCorrections.has(r.id));
      if (eligible.length === 0 && correctionLines.length === 0) throw new Error("Nothing to export.");

      // Insert batch
      const { data: batch, error: be } = await supabase
        .from("evv_export_batches")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          organization_id: organizationId,
          batch_number: nextBatchNumber,
          range_start: from,
          range_end: to,
          row_count: eligible.length + correctionLines.length,
          created_by: user?.id ?? null,
        } as any)
        .select("id, batch_number")
        .single();
      if (be) throw be;

      // Build lines + persist records
      const allLines: UtahExportLine[] = [];
      const recordInserts: Array<{ organization_id: string; batch_id: string; timesheet_id: string; record_id: number; is_correction: boolean; orig_record: string | null }> = [];

      let recordCounter = 0;
      let timestampSkipped = 0;
      for (const c of eligible) {
        const r = c.row;
        const beginIso = effIn(r);
        const endIso = effOut(r) ?? beginIso;
        if (!isValidIso(beginIso) || !isValidIso(endIso)) {
          timestampSkipped += 1;
          continue;
        }
        recordCounter += 1;
        allLines.push({
          memberId: c.memberId,
          firstName: r.clients?.first_name ?? "",
          lastName: r.clients?.last_name ?? "",
          serviceCode: r.service_type_code,
          serviceDescription: "",
          providerId,
          employeeName: staffNameMap.get(r.staff_id) ?? "",
          beginIso, endIso,
          beginAddress: c.address,
          beginLat: r.gps_in_coordinates?.latitude ?? null,
          beginLng: r.gps_in_coordinates?.longitude ?? null,
          endAddress: c.address,
          endLat: r.gps_out_coordinates?.latitude ?? null,
          endLng: r.gps_out_coordinates?.longitude ?? null,
          origReceiptId: "",
          vendor,
        });
        recordInserts.push({
          organization_id: organizationId,
          batch_id: batch.id,
          timesheet_id: r.id,
          record_id: recordCounter,
          is_correction: false,
          orig_record: null,
        });
      }
      for (const r of correctionLines) {
        const orig = origByTs.get(r.id);
        if (!orig) continue;
        const memberId = padMemberId(r.clients?.medicaid_id ?? "");
        const locAddr = r.matched_approved_location_id ? (addressMap.get(r.matched_approved_location_id) ?? "") : "";
        const address = (locAddr || r.clients?.physical_address || "").trim();
        const beginIso = effIn(r);
        const endIso = effOut(r) ?? beginIso;
        if (!isValidIso(beginIso) || !isValidIso(endIso)) {
          timestampSkipped += 1;
          continue;
        }
        recordCounter += 1;
        allLines.push({
          memberId,
          firstName: r.clients?.first_name ?? "",
          lastName: r.clients?.last_name ?? "",
          serviceCode: r.service_type_code,
          serviceDescription: "",
          providerId,
          employeeName: staffNameMap.get(r.staff_id) ?? "",
          beginIso, endIso,
          beginAddress: address,
          beginLat: r.gps_in_coordinates?.latitude ?? null,
          beginLng: r.gps_in_coordinates?.longitude ?? null,
          endAddress: address,
          endLat: r.gps_out_coordinates?.latitude ?? null,
          endLng: r.gps_out_coordinates?.longitude ?? null,
          origReceiptId: String(orig.record_id),
          vendor,
        });
        recordInserts.push({
          organization_id: organizationId,
          batch_id: batch.id,
          timesheet_id: r.id,
          record_id: recordCounter,
          is_correction: true,
          orig_record: orig.id,
        });
      }

      if (recordInserts.length > 0) {
        const { error: re } = await supabase
          .from("evv_export_records")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(recordInserts as any);
        if (re) throw re;
      }

      const { csv, skippedCount: buildSkipped } = buildUtahCsv(allLines, batch.batch_number);
      downloadCsv(`utah_dhhs_evv_batch${String(batch.batch_number).padStart(4, "0")}_${from}_to_${to}.csv`, csv);
      return { count: allLines.length, batchNumber: batch.batch_number, skipped: timestampSkipped + buildSkipped };
    },
    onSuccess: (res) => {
      const skipNote = res.skipped > 0 ? ` (${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped — invalid timestamp)` : "";
      toast.success(`Exported batch #${res.batchNumber} (${res.count} row${res.count === 1 ? "" : "s"})${skipNote}.`);
      qc.invalidateQueries({ queryKey: ["utah-export-batches"] });
      qc.invalidateQueries({ queryKey: ["utah-export-existing"] });
      qc.invalidateQueries({ queryKey: ["utah-export-corrections"] });
      qc.invalidateQueries({ queryKey: ["evv-archive-not-exported"] });
      setConfirming(false);
      setSelectedCorrections(new Set());
      onClose();
    },
    onError: (e) => { toast.error((e as Error).message); setConfirming(false); },
  });

  const loading = orgQ.isLoading || rowsQ.isLoading || existingQ.isLoading || locQ.isLoading || correctionsQ.isLoading || batchesQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export Utah DHHS EVV CSV</DialogTitle>
          <DialogDescription>
            Pick a date range, review the pre-export summary, then confirm to generate a numbered batch.
          </DialogDescription>
        </DialogHeader>

        {providerMissing && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> DHHS Provider ID is not set.
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Open <strong>Settings → Organization</strong> and fill in the DHHS Provider ID and EVV Vendor name before exporting.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="evv-from">From</Label>
            <Input id="evv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="evv-to">To</Label>
            <Input id="evv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <section className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pre-export review</div>
          {loading ? (
            <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : (
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li><strong>{eligible.length}</strong> exportable row{eligible.length === 1 ? "" : "s"}</li>
              <li className="text-muted-foreground">{alreadyExported.length} excluded · already exported in a prior batch</li>
              <li className="text-muted-foreground">{missingMember.length} excluded · missing Member ID</li>
              {missingLocation.length > 0 && (
                <li className="text-destructive">{missingLocation.length} excluded · missing location data (no address/city and no GPS at begin or end)</li>
              )}
              <li className="text-muted-foreground">{outOfBounds.length} excluded · out-of-bounds without an accepted reason</li>
              <li className="text-muted-foreground">{noClockOut.length} excluded · no clock-out yet</li>
              {notReviewed.length > 0 && (
                <li className="text-amber-600">{notReviewed.length} excluded · not yet confirmed/reviewed</li>
              )}
              {addressBlankCount > 0 && (
                <li className="text-amber-600">{addressBlankCount} row{addressBlankCount === 1 ? "" : "s"} with blank address — city/state/zip will be empty (state may flag)</li>
              )}
              {gpsAbsentCount > 0 && (
                <li className="text-amber-600">{gpsAbsentCount} row{gpsAbsentCount === 1 ? "" : "s"} with no GPS — lat/lng will be blank (state may flag)</li>
              )}
            </ul>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">
            Next batch number: <span className="font-mono font-semibold">#{nextBatchNumber}</span> · Vendor: <span className="font-mono">{vendor}</span> · Provider ID: <span className="font-mono">{providerId || "—"}</span>
          </div>
        </section>

        {missingMember.length > 0 && (
          <details className="rounded-lg border border-warning/40 bg-warning/5 p-2 text-xs">
            <summary className="cursor-pointer font-semibold text-warning-foreground">Missing Member ID ({missingMember.length})</summary>
            <ul className="mt-2 space-y-0.5">
              {missingMember.slice(0, 30).map((c) => (
                <li key={c.row.id}>
                  {c.row.clients?.first_name} {c.row.clients?.last_name} · {new Date(effIn(c.row)).toLocaleDateString()} · {c.row.service_type_code}
                </li>
              ))}
            </ul>
          </details>
        )}

        {missingLocation.length > 0 && (
          <details className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
            <summary className="cursor-pointer font-semibold text-destructive">Missing location data ({missingLocation.length})</summary>
            <ul className="mt-2 space-y-0.5">
              {missingLocation.slice(0, 30).map((c) => (
                <li key={c.row.id}>
                  {c.row.clients?.first_name} {c.row.clients?.last_name} · {new Date(effIn(c.row)).toLocaleDateString()} · {c.row.service_type_code}
                </li>
              ))}
            </ul>
          </details>
        )}

        {correctionRows.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corrections to re-export</div>
              <Badge variant="outline" className="font-mono text-[10px]">{correctionRows.length} available</Badge>
            </div>
            <ul className="space-y-1.5">
              {correctionRows.map((r) => {
                const orig = origByTs.get(r.id);
                const checked = selectedCorrections.has(r.id);
                return (
                  <li key={r.id} className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleCorrection(r.id)} />
                    <div className="text-xs">
                      <div className="font-medium">
                        {r.clients?.first_name} {r.clients?.last_name} · {r.service_type_code} · {new Date(effIn(r)).toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">
                        Orig record_id: <span className="font-mono">{orig?.record_id ?? "?"}</span> · corrected {new Date(r.reviewed_at!).toLocaleString()}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Past batches
          </div>
          {batchesQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (batchesQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No exports yet.</p>
          ) : (
            <ul className="space-y-1 font-mono text-[11px]">
              {(batchesQ.data ?? []).slice(0, 10).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>#{b.batch_number} · {b.range_start} → {b.range_end} · {b.row_count} row{b.row_count === 1 ? "" : "s"}</span>
                  <span className="text-muted-foreground">{new Date(b.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={providerMissing || loading || (eligible.length === 0 && selectedCorrections.size === 0)}
            >
              <Download className="mr-1 h-4 w-4" />
              Review & confirm
            </Button>
          ) : (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              {confirm.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              Confirm — generate file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper subcomponent for the State EVV Archive's "Not yet exported" + "Past
// batches" sections. Keeps the existing ArchiveTable untouched and just adds
// this strip above it.
export function EvvExportArchiveStrip({
  organizationId,
  approvedRows,
  staffNameMap,
  onOpenExport,
}: {
  organizationId: string;
  approvedRows: Array<{ id: string; service_type_code: string; clock_in_timestamp: string; outside_geofence_reason: string | null; reconciliation_status?: string | null; clients: { first_name: string; last_name: string; medicaid_id?: string | null } | null }>;
  staffNameMap: Map<string, string>;
  onOpenExport: () => void;
}) {
  void staffNameMap;
  const qc = useQueryClient();
  const recordsQ = useQuery({
    queryKey: ["evv-archive-not-exported", organizationId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("timesheet_id" as any)
        .eq("organization_id", organizationId);
      if (error) throw error;
      const s = new Set<string>();
      for (const r of ((data ?? []) as unknown) as Array<{ timesheet_id: string }>) s.add(r.timesheet_id);
      return s;
    },
  });
  const batchesQ = useQuery({
    queryKey: ["utah-export-batches-strip", organizationId],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await supabase
        .from("evv_export_batches")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, batch_number, range_start, range_end, row_count, created_by, created_at" as any)
        .eq("organization_id", organizationId)
        .order("batch_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BatchRow[];
    },
  });

  const exportedIds = recordsQ.data ?? new Set<string>();
  const evvRows = approvedRows.filter((r) => isEvvLockedCode(r.service_type_code));
  const notYet = evvRows
    .filter((r) => !exportedIds.has(r.id))
    .sort((a, b) => new Date(a.clock_in_timestamp).getTime() - new Date(b.clock_in_timestamp).getTime())
    .slice(0, 25);

  const reasonFor = (r: typeof evvRows[number]) => {
    if (!r.clients?.medicaid_id) return "Missing Member ID";
    if (r.outside_geofence_reason && r.reconciliation_status !== "accepted" && r.reconciliation_status !== "corrected") return "Out-of-bounds, awaiting reconciliation";
    return "Ready to export";
  };

  const reDownload = useMutation({
    mutationFn: async (batchId: string) => {
      const { data: recs, error: e1 } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, timesheet_id, record_id, is_correction, orig_record" as any)
        .eq("batch_id", batchId)
        .order("record_id", { ascending: true });
      if (e1) throw e1;
      const records = (recs ?? []) as unknown as Array<{ id: string; timesheet_id: string; record_id: number; is_correction: boolean; orig_record: string | null }>;
      if (records.length === 0) throw new Error("Empty batch.");
      const { data: batch, error: e2 } = await supabase
        .from("evv_export_batches")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("batch_number, range_start, range_end" as any)
        .eq("id", batchId)
        .single();
      if (e2) throw e2;
      const tsIds = records.map((r) => r.timesheet_id);
      const { data: tsRows, error: e3 } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, corrected_clock_in, corrected_clock_out, review_status, reviewed_at, outside_geofence_reason, reconciliation_status, gps_in_coordinates, gps_out_coordinates, staff_id, matched_approved_location_id, clients(first_name, last_name, physical_address, medicaid_id)" as any)
        .in("id", tsIds);
      if (e3) throw e3;
      const tsMap = new Map<string, TsRow>();
      for (const t of (tsRows ?? []) as unknown as TsRow[]) tsMap.set(t.id, t);

      const { data: org, error: e4 } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("dhhs_provider_id, evv_vendor_name" as any)
        .eq("id", organizationId)
        .single();
      if (e4) throw e4;
      const o = org as unknown as { dhhs_provider_id: string | null; evv_vendor_name: string };

      // staff names
      const staffIds = Array.from(new Set(Array.from(tsMap.values()).map((t) => t.staff_id)));
      const { data: staff } = await supabase.from("org_member_directory").select("id, full_name, email").in("id", staffIds);
      const sm = new Map<string, string>();
      for (const s of (staff ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        sm.set(s.id, s.full_name ?? s.email ?? "");
      }
      // locations
      const locIds2 = Array.from(new Set(Array.from(tsMap.values()).map((t) => t.matched_approved_location_id).filter(Boolean) as string[]));
      const addressMap = new Map<string, string>();
      if (locIds2.length > 0) {
        const { data: locs } = await supabase.from("client_approved_locations").select("id, address").in("id", locIds2);
        for (const l of (locs ?? []) as Array<{ id: string; address: string | null }>) {
          if (l.address) addressMap.set(l.id, l.address);
        }
      }
      // orig record_id lookup
      const origIds = records.map((r) => r.orig_record).filter(Boolean) as string[];
      const origMap = new Map<string, number>();
      if (origIds.length > 0) {
        const { data: origs } = await supabase
          .from("evv_export_records")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, record_id" as any)
          .in("id", origIds);
        for (const r of ((origs ?? []) as unknown) as Array<{ id: string; record_id: number }>) origMap.set(r.id, r.record_id);
      }

      const lines: UtahExportLine[] = records.map((rec) => {
        const t = tsMap.get(rec.timesheet_id)!;
        const beginIso = effIn(t);
        const endIso = effOut(t) ?? beginIso;
        const locAddr = t.matched_approved_location_id ? (addressMap.get(t.matched_approved_location_id) ?? "") : "";
        const address = (locAddr || t.clients?.physical_address || "").trim();
        return {
          memberId: padMemberId(t.clients?.medicaid_id ?? ""),
          firstName: t.clients?.first_name ?? "",
          lastName: t.clients?.last_name ?? "",
          serviceCode: t.service_type_code,
          serviceDescription: "",
          providerId: (o.dhhs_provider_id ?? "").trim(),
          employeeName: sm.get(t.staff_id) ?? "",
          beginIso, endIso,
          beginAddress: address,
          beginLat: t.gps_in_coordinates?.latitude ?? null,
          beginLng: t.gps_in_coordinates?.longitude ?? null,
          endAddress: address,
          endLat: t.gps_out_coordinates?.latitude ?? null,
          endLng: t.gps_out_coordinates?.longitude ?? null,
          origReceiptId: rec.is_correction && rec.orig_record ? String(origMap.get(rec.orig_record) ?? "") : "",
          vendor: (o.evv_vendor_name ?? "Hive") || "Hive",
        };
      });
      const b = batch as unknown as { batch_number: number; range_start: string; range_end: string };
      const { csv } = buildUtahCsv(lines, b.batch_number);
      downloadCsv(`utah_dhhs_evv_batch${String(b.batch_number).padStart(4, "0")}_${b.range_start}_to_${b.range_end}.csv`, csv);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  void evvServiceLabel; void qc;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Utah DHHS export ledger</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Approved EVV-locked shifts that have not yet been submitted, and the numbered batches you've already sent to the state.
          </p>
        </div>
        <Button size="sm" onClick={onOpenExport}>
          <Download className="mr-1 h-3.5 w-3.5" /> Open export
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <div className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">Not yet exported · oldest first</div>
          {recordsQ.isLoading ? (
            <p className="p-2 text-xs text-muted-foreground">Loading…</p>
          ) : notYet.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">All approved EVV shifts have been exported.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto text-xs">
              {notYet.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-1 border-b border-border/40 px-1 py-1 last:border-b-0">
                  <span className="font-mono">{new Date(r.clock_in_timestamp).toLocaleDateString()} · {r.service_type_code}</span>
                  <span>{r.clients?.first_name} {r.clients?.last_name}</span>
                  <span className="text-[10px] text-muted-foreground">{reasonFor(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <div className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">Past batches</div>
          {batchesQ.isLoading ? (
            <p className="p-2 text-xs text-muted-foreground">Loading…</p>
          ) : (batchesQ.data ?? []).length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No exports yet.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto text-xs">
              {(batchesQ.data ?? []).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-1 border-b border-border/40 px-1 py-1 last:border-b-0">
                  <span className="font-mono">#{b.batch_number} · {b.range_start} → {b.range_end}</span>
                  <span>{b.row_count} row{b.row_count === 1 ? "" : "s"}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={reDownload.isPending} onClick={() => reDownload.mutate(b.id)}>
                    <Download className="mr-1 h-3 w-3" /> Re-download
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

void Fragment;
