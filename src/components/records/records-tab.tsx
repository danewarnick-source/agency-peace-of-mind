// Records — unified work-records surface.
// Reuses, does not rewrite:
//   • src/lib/evv-codes.ts                — EVV_SERVICE_CODES, isEvvLockedCode
//   • src/lib/utah-evv-export.ts          — downloadCsv (Master Ledger export)
//   • src/lib/records-review-rules.ts     — exception engine
//   • src/components/evv/utah-export-dialog.tsx — DHHS EVV CSV export dialog
//   • src/components/residential/residential-daily-tab.tsx — HHS daily logs
//   • src/components/nectar/nectar-search-bar.tsx — semantic search above table
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Download, MapPin, AlertTriangle, Clock, Clock3, ShieldAlert,
  FileWarning, AlertCircle, ListChecks, CalendarRange, SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EVV_SERVICE_CODES, isEvvLockedCode, padMemberId } from "@/lib/evv-codes";
import { buildUtahCsv, downloadCsv, isValidIso, type UtahExportLine } from "@/lib/utah-evv-export";
import { reviewExceptions, type ReviewException } from "@/lib/records-review-rules";
import { ResidentialDailyTab } from "@/components/residential/residential-daily-tab";
import { TimeCorrectionReviewSection } from "@/components/records/time-correction-review-section";

import { UtahExportDialog } from "@/components/evv/utah-export-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 100;
const FETCH_CAP = 2000;

type Mode = "attention" | "all";
type RecordType = "all" | "evv" | "non_evv" | "hhs_daily" | "non_billable";

type GeneralRow = {
  id: string;
  staff_id: string;
  staff_name: string;
  category: string;
  note: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  duration_min: number;
};

type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  rounded_clock_in: string | null;
  rounded_clock_out: string | null;
  is_edited_by_admin: boolean;
  is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  review_status: string | null;
  status: string | null;
  incident_flag: boolean | null;
  denial_reason: string | null;
  utah_medicaid_member_id: string | null;
  import_source: string | null;
  clients: { first_name: string; last_name: string; team_id: string | null } | null;
};

type Derived = Row & {
  staff_name: string;
  client_name: string;
  team_name: string | null;
  duration_min: number;
  exceptions: ReviewException[];
  is_evv_locked: boolean;
  awaiting_staff_confirmation: boolean;
};

const SELECT_COLS =
  "id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, rounded_clock_in, rounded_clock_out, is_edited_by_admin, is_out_of_bounds, outside_geofence_reason, shift_note_text, goals_completed, review_status, status, incident_flag, denial_reason, utah_medicaid_member_id, import_source, clients:client_id(first_name, last_name, team_id)";

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "h:mm a"); } catch { return "—"; }
}
function fmtDate(iso: string): string {
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return iso; }
}
function fmtShort(iso: string): string {
  try { return format(parseISO(iso), "MMM d"); } catch { return iso; }
}
function durationMin(start: string, end: string | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
function defaultFrom(): string {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function RecordsTab() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const orgId = org?.organization_id;
  const isAdmin = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  const [mode, setMode] = useState<Mode>("attention");
  const [type, setType] = useState<RecordType>("all");
  const [staff, setStaff] = useState<string[]>([]);
  const [client, setClient] = useState<string[]>([]);
  const [code, setCode] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(defaultTo());
  const [utahDialogOpen, setUtahDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<any | null>(null);

  // ── Option sources ──────────────────────────────────────────────────────
  const staffOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-staff", orgId],
    queryFn: async () => {
      // Two-step lookup: organization_members has no FK to profiles, so a
      // nested embed silently returns null. Fetch ids first, then names
      // from the org_member_directory view, and merge in JS.
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      const userIds = Array.from(
        new Set(((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)),
      );
      if (userIds.length === 0) return [];
      const { data: directory } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", userIds);
      const nameMap = new Map(
        ((directory ?? []) as Array<{ id: string; full_name: string | null }>).map(
          (d) => [d.id, (d.full_name ?? "").trim()],
        ),
      );
      return userIds
        .map((uid) => {
          const name = nameMap.get(uid) ?? "";
          return { value: uid, label: name || uid.slice(0, 8) };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });


  const clientOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-clients", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, team_id")
        .eq("organization_id", orgId!)
        .order("last_name");
      return (data ?? []).map((c) => ({
        value: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.id.slice(0, 8),
      }));
    },
  });

  const teamOptionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["records-teams", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("team_name");
      return (data ?? []).map((t) => ({ value: t.id, label: t.team_name }));
    },
  });

  const codeOptions = useMemo(
    () => EVV_SERVICE_CODES.map((c) => ({ value: c.code, label: c.code, sublabel: c.label })),
    [],
  );

  const batchesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["evv-batches", orgId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("evv_export_batches")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, batch_number, range_start, range_end, row_count, created_by, created_at, archived_at, archived_by" as any)
          .eq("organization_id", orgId!)
          .order("batch_number", { ascending: false });
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        // archived_at/archived_by columns may not exist yet
        const { data } = await supabase
          .from("evv_export_batches")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, batch_number, range_start, range_end, row_count, created_by, created_at" as any)
          .eq("organization_id", orgId!)
          .order("batch_number", { ascending: false });
        return (data ?? []) as any[];
      }
    },
  });
  const batches = (batchesQ.data ?? []).filter((b) => showArchived ? true : !b.archived_at);

  // ── Main query ──────────────────────────────────────────────────────────
  const rowsQ = useQuery({
    enabled: !!orgId && isAdmin && type !== "hhs_daily" && type !== "non_billable",
    queryKey: [
      "records", orgId, mode, type, staff, client, code, team, from, to,
    ],
    queryFn: async () => {
      // Resolve team → client_ids
      let clientIds = client.slice();
      if (team.length > 0) {
        const { data } = await supabase
          .from("clients").select("id")
          .eq("organization_id", orgId!).in("team_id", team);
        const t = (data ?? []).map((c) => c.id);
        clientIds = clientIds.length ? clientIds.filter((id) => t.includes(id)) : t;
        if (clientIds.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
      }

      // Resolve service codes per "type"
      let codeFilter = code.slice();
      if (type === "evv") {
        const evvOnly = EVV_SERVICE_CODES.filter((c) => c.evvLock).map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => evvOnly.includes(c)) : evvOnly;
        if (codeFilter.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
      } else if (type === "non_evv") {
        // Every non-EVV-mandated code (RHS, DSI, SEI, etc.). HHS is a daily-log
        // code and lives under its own type — exclude here so the bucket means
        // "clockable, non-EVV".
        const nonEvv = EVV_SERVICE_CODES
          .filter((c) => !c.evvLock && c.code !== "HHS")
          .map((c) => c.code);
        codeFilter = codeFilter.length ? codeFilter.filter((c) => nonEvv.includes(c)) : nonEvv;
        if (codeFilter.length === 0) return { all: [] as Derived[], attention: [] as Derived[] };
      }

      const fromIso = new Date(`${from}T00:00:00`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999`).toISOString();

      let q = supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", orgId!)
        .gte("clock_in_timestamp", fromIso)
        .lte("clock_in_timestamp", toIso)
        .order("clock_in_timestamp", { ascending: false })
        .limit(FETCH_CAP);

      if (staff.length) q = q.in("staff_id", staff);
      if (codeFilter.length) q = q.in("service_type_code", codeFilter);
      if (clientIds.length) q = q.in("client_id", clientIds);

      const { data, error } = await q;
      if (error) throw error;
      const baseRows = (data as unknown as Row[]) ?? [];

      const staffMap = new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]));
      const teamMap = new Map((teamOptionsQ.data ?? []).map((t) => [t.value, t.label]));

      const derivedAll: Derived[] = baseRows.map((r) => {
        const awaiting =
          r.import_source === "historical_import" &&
          r.status === "Pending_Staff_Confirmation";
        // Skip the compliance-rule engine for entries that are simply
        // waiting on the staff member's own sign-off — nothing here is
        // actionable from the admin's side.
        const exc = awaiting ? [] : reviewExceptions(r);
        // Duration reflects the authoritative billing time: approved
        // correction, else the rounded (nearest-quarter-hour) punch, else
        // raw as a last resort — same precedence as reDownloadBatch below.
        // Never derived back into the raw/corrected columns themselves.
        const billIn = (r.review_status === "approved" && r.corrected_clock_in)
          ? r.corrected_clock_in
          : (r.rounded_clock_in ?? r.clock_in_timestamp);
        const billOut = (r.review_status === "approved" && r.corrected_clock_out)
          ? r.corrected_clock_out
          : (r.rounded_clock_out ?? r.clock_out_timestamp);
        return {
          ...r,
          staff_name: staffMap.get(r.staff_id) ?? r.staff_id.slice(0, 8),
          client_name: r.clients
            ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
            : r.client_id.slice(0, 8),
          team_name: r.clients?.team_id ? teamMap.get(r.clients.team_id) ?? null : null,
          duration_min: durationMin(billIn, billOut),
          exceptions: exc,
          is_evv_locked: isEvvLockedCode(r.service_type_code),
          awaiting_staff_confirmation: awaiting,
        };
      });

      const attention = derivedAll.filter((r) => r.exceptions.length > 0);
      return { all: derivedAll, attention };
    },
  });

  const generalQ = useQuery({
    enabled: !!orgId && isAdmin && (type === "non_billable" || type === "all"),
    queryKey: ["general-shifts-records", orgId, staff, from, to],
    queryFn: async () => {
      const fromIso = new Date(`${from}T00:00:00`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999`).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("general_shifts")
        .select("id, user_id, category, note, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", orgId!)
        .gte("clock_in_timestamp", fromIso)
        .lte("clock_in_timestamp", toIso)
        .order("clock_in_timestamp", { ascending: false })
        .limit(FETCH_CAP);
      if (staff.length) q = q.in("user_id", staff);
      const { data, error } = await q;
      if (error) throw error;
      const staffMap = new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((g): GeneralRow => ({
        id: g.id,
        staff_id: g.user_id,
        staff_name: staffMap.get(g.user_id) ?? String(g.user_id).slice(0, 8),
        category: g.category ?? "general",
        note: g.note ?? "",
        clock_in_timestamp: g.clock_in_timestamp,
        clock_out_timestamp: g.clock_out_timestamp,
        duration_min: durationMin(g.clock_in_timestamp, g.clock_out_timestamp),
      }));
    },
  });

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Admins and managers only.
      </div>
    );
  }

  const visibleSet = mode === "attention" ? rowsQ.data?.attention ?? [] : rowsQ.data?.all ?? [];
  const attentionCount = rowsQ.data?.attention.length ?? 0;
  const total = visibleSet.length;
  const rows = visibleSet.slice(0, PAGE_SIZE);

  // DHHS EVV export only when every visible row is EVV-locked.
  const allEvvLocked = rows.length > 0 && rows.every((r) => r.is_evv_locked);
  const canDhhsExport = allEvvLocked;

  const handleMasterCsv = () => {
    if (visibleSet.length === 0) {
      toast.info("Nothing to export — adjust filters first.");
      return;
    }
    const header = [
      "Caregiver", "Client", "Member ID", "Service code", "Date",
      "Clock in", "Clock out", "Duration (min)", "Edited by admin",
      "Geofence", "Exceptions", "Home/Team",
    ];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const body = [header.join(",")].concat(
      visibleSet.map((r) => [
        r.staff_name, r.client_name, r.utah_medicaid_member_id ?? "",
        r.service_type_code, fmtDate(r.clock_in_timestamp),
        fmtTs(r.corrected_clock_in ?? r.clock_in_timestamp),
        fmtTs(r.corrected_clock_out ?? r.clock_out_timestamp),
        String(r.duration_min),
        r.is_edited_by_admin ? "yes" : "no",
        r.is_out_of_bounds ? "out-of-bounds" : "in-bounds",
        r.exceptions.map((e) => e.label).join("; "),
        r.team_name ?? "",
      ].map((v) => esc(String(v))).join(",")),
    ).join("\r\n");
    downloadCsv(`agency-records_${from}_${to}.csv`, body);
  };

  const handleHoursExport = (option: "total" | "billable" | "non_billable") => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const header = ["Caregiver", "Type", "Category/Code", "Date", "Clock in", "Clock out", "Hours"];
    const billableRows = visibleSet.map((r) => [
      r.staff_name, "Billable", r.service_type_code,
      fmtDate(r.clock_in_timestamp),
      fmtTs(r.corrected_clock_in ?? r.clock_in_timestamp),
      fmtTs(r.corrected_clock_out ?? r.clock_out_timestamp),
      (r.duration_min / 60).toFixed(2),
    ]);
    const nonBillableRows = (generalQ.data ?? []).map((g) => [
      g.staff_name, "Non-billable", g.category,
      fmtDate(g.clock_in_timestamp),
      fmtTs(g.clock_in_timestamp),
      fmtTs(g.clock_out_timestamp),
      (g.duration_min / 60).toFixed(2),
    ]);
    const dataRows = option === "billable" ? billableRows
      : option === "non_billable" ? nonBillableRows
      : [...billableRows, ...nonBillableRows];
    if (dataRows.length === 0) { toast.info("Nothing to export — adjust filters first."); return; }
    const body = [header.join(",")].concat(
      dataRows.map((row) => row.map((v) => esc(String(v))).join(","))
    ).join("\r\n");
    downloadCsv(`hours-${option}_${from}_${to}.csv`, body);
  };

  const reDownloadBatch = async (batch: any) => {
    const { data: recs, error: e1 } = await supabase
      .from("evv_export_records")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, timesheet_id, record_id, is_correction, orig_record" as any)
      .eq("batch_id", batch.id)
      .order("record_id", { ascending: true });
    if (e1 || !recs || recs.length === 0) { toast.error("No records found for this batch."); return; }
    const records = recs as unknown as Array<{ id: string; timesheet_id: string; record_id: number; is_correction: boolean; orig_record: string | null }>;

    const tsIds = records.map((r) => r.timesheet_id);
    const { data: tsRows, error: e2 } = await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, service_type_code, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, corrected_clock_in, corrected_clock_out, review_status, gps_in_coordinates, gps_out_coordinates, staff_id, matched_approved_location_id, clients(first_name, last_name, physical_address, medicaid_id)" as any)
      .in("id", tsIds);
    if (e2) { toast.error("Failed to load timesheet data."); return; }
    const tsMap = new Map<string, any>();
    for (const t of ((tsRows ?? []) as any[])) tsMap.set(t.id, t);

    const { data: orgData, error: e3 } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("dhhs_provider_id, evv_vendor_name" as any)
      .eq("id", orgId!)
      .single();
    if (e3) { toast.error("Failed to load org settings."); return; }
    const o = orgData as unknown as { dhhs_provider_id: string | null; evv_vendor_name: string };

    const staffIds = Array.from(new Set(((tsRows ?? []) as any[]).map((t) => t.staff_id)));
    const { data: staffData } = await supabase.from("org_member_directory").select("id, full_name, email").in("id", staffIds as string[]);
    const sm = new Map<string, string>();
    for (const s of ((staffData ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)) {
      sm.set(s.id, s.full_name ?? s.email ?? "");
    }

    const locIds2 = Array.from(new Set(((tsRows ?? []) as any[]).map((t) => t.matched_approved_location_id).filter(Boolean) as string[]));
    const addrMap = new Map<string, string>();
    if (locIds2.length > 0) {
      const { data: locs } = await supabase.from("client_approved_locations").select("id, address").in("id", locIds2);
      for (const l of ((locs ?? []) as Array<{ id: string; address: string | null }>)) {
        if (l.address) addrMap.set(l.id, l.address);
      }
    }

    const origIds = records.map((r) => r.orig_record).filter(Boolean) as string[];
    const origMap = new Map<string, number>();
    if (origIds.length > 0) {
      const { data: origs } = await supabase
        .from("evv_export_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, record_id" as any)
        .in("id", origIds);
      for (const r of ((origs ?? []) as unknown as Array<{ id: string; record_id: number }>)) origMap.set(r.id, r.record_id);
    }

    const providerId = (o.dhhs_provider_id ?? "").trim();
    const vendor = (o.evv_vendor_name ?? "Hive").trim() || "Hive";

    const lines: UtahExportLine[] = records.map((rec) => {
      const t = tsMap.get(rec.timesheet_id);
      if (!t) return null;
      const beginIso = (t.review_status === "approved" && t.corrected_clock_in) ? t.corrected_clock_in : (t.rounded_clock_in ?? t.clock_in_timestamp);
      const endIso = (t.review_status === "approved" && t.corrected_clock_out) ? t.corrected_clock_out : (t.rounded_clock_out ?? t.clock_out_timestamp ?? beginIso);
      if (!isValidIso(beginIso) || !isValidIso(endIso)) return null;
      const locAddr = t.matched_approved_location_id ? (addrMap.get(t.matched_approved_location_id) ?? "") : "";
      const address = (locAddr || t.clients?.physical_address || "").trim();
      return {
        memberId: padMemberId(t.clients?.medicaid_id ?? ""),
        firstName: t.clients?.first_name ?? "",
        lastName: t.clients?.last_name ?? "",
        serviceCode: t.service_type_code,
        serviceDescription: "",
        providerId,
        employeeName: sm.get(t.staff_id) ?? "",
        beginIso, endIso,
        beginAddress: address,
        beginLat: t.gps_in_coordinates?.latitude ?? null,
        beginLng: t.gps_in_coordinates?.longitude ?? null,
        endAddress: address,
        endLat: t.gps_out_coordinates?.latitude ?? null,
        endLng: t.gps_out_coordinates?.longitude ?? null,
        origReceiptId: rec.is_correction && rec.orig_record ? String(origMap.get(rec.orig_record) ?? "") : "",
        vendor,
      };
    }).filter(Boolean) as UtahExportLine[];

    const { csv } = buildUtahCsv(lines, batch.batch_number);
    downloadCsv(`evv-batch-${batch.batch_number}.csv`, csv);
    toast.success(`Re-downloaded Batch #${batch.batch_number}.`);
  };

  const archiveBatch = async (batch: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("evv_export_batches") as any)
      .update({ archived_at: new Date().toISOString(), archived_by: user?.id ?? null })
      .eq("id", batch.id);
    if (error) { toast.error("Failed to archive batch."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("hive_executive_audit_log") as any).insert({
      actor_user_id: user?.id ?? "",
      action: "evv_batch_archive",
      target_org_id: orgId,
      summary: `Archived EVV export batch #${batch.batch_number} (id: ${batch.id})`,
    });
    toast.success(`Batch #${batch.batch_number} archived.`);
    setConfirmArchive(null);
    batchesQ.refetch();
  };

  const unarchiveBatch = async (batch: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("evv_export_batches") as any)
      .update({ archived_at: null, archived_by: null })
      .eq("id", batch.id);
    toast.success(`Batch #${batch.batch_number} unarchived.`);
    batchesQ.refetch();
  };

  const billableMin = visibleSet.reduce((sum, r) => sum + r.duration_min, 0);
  const nonBillableMin = (generalQ.data ?? []).reduce((sum, g) => sum + g.duration_min, 0);
  const totalHoursMin = billableMin + nonBillableMin;

  const dateLabel = `${fmtShort(from)} – ${fmtShort(to)}`;

  const filterControls = (
    <>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={staff} onChange={setStaff}
          options={staffOptionsQ.data ?? []}
          placeholder="All staff" searchPlaceholder="Filter staff…"
        />
      </div>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={client} onChange={setClient}
          options={clientOptionsQ.data ?? []}
          placeholder="All clients" searchPlaceholder="Filter clients…"
        />
      </div>
      <div className="min-w-[140px]">
        <CheckboxMultiSelect
          value={code} onChange={setCode}
          options={codeOptions}
          placeholder="All codes" chipMonospace
        />
      </div>
      <div className="min-w-[150px]">
        <CheckboxMultiSelect
          value={team} onChange={setTeam}
          options={teamOptionsQ.data ?? []}
          placeholder="All homes/teams"
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2 font-normal">
            <CalendarRange className="h-4 w-4" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] space-y-2 p-3">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </PopoverContent>
      </Popover>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0B1126]">Records</h3>
          <p className="text-xs text-muted-foreground">
            Every work record in one place. Default view is the exception queue; switch to All records to search the archive.
          </p>
        </div>
      </div>

      {/* Mode toggle — two-way */}
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => setMode("attention")}
          className={`flex min-h-[36px] items-center gap-2 px-3 py-1.5 text-xs font-medium transition ${
            mode === "attention" ? "bg-[#137182] text-white" : "bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" /> Needs attention
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${mode === "attention" ? "bg-white/20" : "bg-muted text-foreground"}`}>
            {attentionCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`flex min-h-[36px] items-center gap-2 border-l border-border px-3 py-1.5 text-xs font-medium transition ${
            mode === "all" ? "bg-[#137182] text-white" : "bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" /> All records
        </button>
      </div>

      {/* Type control — 5 buttons, fixed order */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {([
          ["all", "All types"],
          ["evv", "EVV timesheets"],
          ["non_evv", "Non-EVV timesheets"],
          ["hhs_daily", "Daily logs (HHS)"],
          ["non_billable", "Non-billable"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium transition ${
              type === k ? "bg-[#0B1126] text-white" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "attention" && orgId && (
        <TimeCorrectionReviewSection organizationId={orgId} />
      )}

      {type === "hhs_daily" ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <ResidentialDailyTab />
        </div>
      ) : (
        <>
          {/* Compact inline filter strip */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {filterControls}
          </div>
          {/* Mobile: collapsed into a Sheet */}
          <div className="flex items-center justify-between md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="space-y-3">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2">{filterControls}</div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Hours summary bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                Billable <span className="tabular-nums text-[#137182]">{(billableMin / 60).toFixed(1)}h</span>
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-foreground">
                Non-billable <span className="tabular-nums text-muted-foreground">{(nonBillableMin / 60).toFixed(1)}h</span>
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-foreground">
                Total <span className="tabular-nums">{(totalHoursMin / 60).toFixed(1)}h</span>
              </span>
            </div>

          {/* Count + exports */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span className="text-xs text-muted-foreground">
              {type === "non_billable"
                ? (generalQ.isLoading ? "Loading…" : `${(generalQ.data ?? []).length.toLocaleString()} record${(generalQ.data ?? []).length === 1 ? "" : "s"} match`)
                : (rowsQ.isLoading ? "Loading…" : `${total.toLocaleString()} record${total === 1 ? "" : "s"} match`)
              }
              {type !== "non_billable" && total > PAGE_SIZE && ` — showing first ${PAGE_SIZE}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {type !== "non_billable" && (canDhhsExport ? (
                <Button
                  type="button" size="sm" variant="default"
                  onClick={() => setUtahDialogOpen(true)}
                  className="gap-2"
                >
                  <ShieldAlert className="h-4 w-4" /> Export Utah DHHS EVV CSV
                </Button>
              ) : (
                <span
                  className="text-[11px] text-muted-foreground"
                  title="DHHS EVV export is available only when every visible row is an EVV-locked code."
                >
                  DHHS EVV export hidden (mixed/non-EVV codes in result)
                </span>
              ))}
              {type !== "non_billable" && (
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={handleMasterCsv}
                  disabled={rowsQ.isLoading || total === 0}
                  title={total === 0 ? "No records in the current view to export" : undefined}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" /> Export Master Agency Ledger CSV
                </Button>
              )}
              {/* Export hours — separate from the DHHS export, payroll-shaped CSV */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Export hours
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[200px] p-1">
                  <button
                    type="button"
                    onClick={() => handleHoursExport("total")}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    Total (billable + non-billable)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHoursExport("billable")}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    Billable only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHoursExport("non_billable")}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    Non-billable only
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Results table — non-billable (general_shifts) */}
          {type === "non_billable" ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Caregiver</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">In → Out</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {generalQ.isLoading && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!generalQ.isLoading && (generalQ.data ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No non-billable records match these filters.</td></tr>
                  )}
                  {(generalQ.data ?? []).map((g) => (
                    <tr key={g.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-3 py-2">{g.staff_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{g.category}</td>
                      <td className="px-3 py-2">{fmtDate(g.clock_in_timestamp)}</td>
                      <td className="px-3 py-2">{fmtTs(g.clock_in_timestamp)} → {fmtTs(g.clock_out_timestamp)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtDur(g.duration_min)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{g.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Results table — client records (evv_timesheets) */
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Caregiver</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">In → Out</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Geofence</th>
                    <th className="px-3 py-2">{mode === "attention" ? "Why flagged" : "Flags"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsQ.isLoading && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!rowsQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      {mode === "attention" ? "No exceptions — everything is clean for these filters." : "No records match these filters."}
                    </td></tr>
                  )}
                  {rows.map((r) => {
                    const inTs = r.corrected_clock_in ?? r.clock_in_timestamp;
                    const outTs = r.corrected_clock_out ?? r.clock_out_timestamp;
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                        <td className="px-3 py-2">{r.staff_name}</td>
                        <td className="px-3 py-2">
                          <Link
                            to="/dashboard/shift/$shiftId"
                            params={{ shiftId: r.id }}
                            target="_blank"
                            className="text-[#137182] hover:underline"
                          >
                            {r.client_name}
                          </Link>
                          {r.team_name && (
                            <span className="ml-1 text-xs text-muted-foreground">· {r.team_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.service_type_code}</td>
                        <td className="px-3 py-2">{fmtDate(r.clock_in_timestamp)}</td>
                        <td className="px-3 py-2">
                          {fmtTs(inTs)} → {fmtTs(outTs)}
                          {r.is_edited_by_admin && (
                            <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-amber-700">edited</span>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmtDur(r.duration_min)}</td>
                        <td className="px-3 py-2">
                          {r.is_out_of_bounds ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" /> in
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.awaiting_staff_confirmation ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                              title={`Imported from a historical spreadsheet — waiting for ${r.staff_name} to review and sign off at My historical timesheets. Nothing to fix here.`}
                            >
                              <Clock3 className="h-3 w-3" /> Awaiting staff confirmation
                            </span>
                          ) : r.exceptions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.exceptions.map((e) => <ReasonBadge key={e.code} ex={e} />)}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <section className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#0B1126]">EVV Export Batches</h3>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        {batches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No EVV batches exported yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">
                    Batch #{b.batch_number}
                    {b.archived_at && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        Archived {format(parseISO(b.archived_at), "MMM d, yyyy")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.range_start} → {b.range_end} · {b.row_count} records · {format(parseISO(b.created_at), "MMM d, yyyy")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => reDownloadBatch(b)}>Re-download</Button>
                  {isAdmin && !b.archived_at && (
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => setConfirmArchive(b)}>Archive</Button>
                  )}
                  {isAdmin && b.archived_at && (
                    <Button variant="outline" size="sm" onClick={() => unarchiveBatch(b)}>Unarchive</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {utahDialogOpen && canDhhsExport && orgId && (
        <UtahExportDialog
          open={utahDialogOpen}
          onClose={() => setUtahDialogOpen(false)}
          organizationId={orgId}
          staffNameMap={new Map((staffOptionsQ.data ?? []).map((s) => [s.value, s.label]))}
        />
      )}

      <AlertDialog open={!!confirmArchive} onOpenChange={(o) => { if (!o) setConfirmArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive EVV batch?</AlertDialogTitle>
            <AlertDialogDescription>
              Government record-keeping rules require retaining EVV records. Archiving hides this batch from the list but does NOT delete the underlying records. This action is logged. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmArchive(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmArchive && archiveBatch(confirmArchive)}
            >
              Archive batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReasonBadge({ ex }: { ex: ReviewException }) {
  if (ex.code === "out_of_geofence") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
        <MapPin className="h-3 w-3" /> {ex.label}
      </Badge>
    );
  }
  if (ex.code === "no_clockout_stale") {
    return (
      <Badge variant="outline" className="gap-1 border-rose-300 text-rose-800">
        <Clock className="h-3 w-3" /> {ex.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-orange-300 text-orange-800">
      <FileWarning className="h-3 w-3" /> {ex.label}
    </Badge>
  );
}
