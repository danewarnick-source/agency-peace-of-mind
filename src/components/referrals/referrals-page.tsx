import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Plus, UserPlus } from "lucide-react";
import {
  createReferral,
  createSupportCoordinator,
  findPossibleDuplicateReferral,
  getReferralPipelineStats,
  listReferrals,
  listSupportCoordinators,
  type ReferralStage,
} from "@/lib/referrals.functions";
import {
  PipelineStatsBar,
  ReferralDetailDialog,
  ReferralStageBadge,
  StageAdvancer,
} from "./referral-pipeline";
import { ProviderInterestOutlineButton } from "./provider-interest-outline";

type Category = "direct_support" | "rhs" | "hhs";
const CATEGORIES: { key: Category; label: string }[] = [
  { key: "direct_support", label: "Direct Support" },
  { key: "rhs", label: "RHS" },
  { key: "hhs", label: "HHS" },
];

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ReferralsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const listFn = useServerFn(listReferrals);
  const scListFn = useServerFn(listSupportCoordinators);
  const statsFn = useServerFn(getReferralPipelineStats);

  const [detailId, setDetailId] = useState<string | null>(null);

  const referrals = useQuery({
    enabled: !!orgId,
    queryKey: ["referrals", orgId],
    queryFn: () => listFn({ data: { organization_id: orgId! } }),
  });
  const scs = useQuery({
    enabled: !!orgId,
    queryKey: ["support-coordinators", orgId],
    queryFn: () => scListFn({ data: { organization_id: orgId! } }),
  });
  const stats = useQuery({
    enabled: !!orgId,
    queryKey: ["referral-pipeline-stats", orgId],
    queryFn: () => statsFn({ data: { organization_id: orgId! } }),
  });

  const scById = useMemo(() => {
    const m = new Map<string, { name: string; agency: string | null }>();
    (scs.data ?? []).forEach((s) => m.set(s.id, { name: s.name, agency: s.agency }));
    return m;
  }, [scs.data]);

  const grouped = useMemo(() => {
    const out: Record<Category, NonNullable<typeof referrals.data>> = {
      direct_support: [],
      rhs: [],
      hhs: [],
    };
    (referrals.data ?? []).forEach((r) => {
      const c = r.category as Category;
      if (out[c]) out[c].push(r);
    });
    return out;
  }, [referrals.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Referrals</h2>
          <p className="text-sm text-muted-foreground">
            Prospective-client intake inquiries. Move through the pipeline; log
            every contact, meeting, and note. Matching and follow-up email land
            in later increments.
          </p>
        </div>
        {orgId && (
          <div className="flex flex-wrap gap-2">
            <ProviderInterestOutlineButton organizationId={orgId} />
            <NewReferralDialog organizationId={orgId} />
          </div>
        )}
      </div>

      <PipelineStatsBar stats={stats.data} />


      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const rows = grouped[cat.key] ?? [];
          return (
            <section
              key={cat.key}
              className="min-w-0 rounded-md border border-border bg-card p-3"
            >
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{cat.label}</h3>
                <Badge variant="secondary">{rows.length}</Badge>
              </header>
              {referrals.isLoading ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No referrals yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((r) => {
                    const sc = r.support_coordinator_id
                      ? scById.get(r.support_coordinator_id)
                      : null;
                    const loc = [r.location_city, r.location_county]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <li
                        key={r.id}
                        className="rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setDetailId(r.id)}
                          >
                            <div className="truncate font-medium">
                              {r.first_name}
                              {r.age != null && (
                                <span className="ml-1 text-muted-foreground">
                                  · age {r.age}
                                </span>
                              )}
                            </div>
                            {loc && (
                              <div className="truncate text-xs text-muted-foreground">
                                {loc}
                              </div>
                            )}
                          </button>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <ReferralStageBadge
                              stage={(r.stage ?? "new") as ReferralStage}
                            />
                            {r.due_date && (
                              <Badge variant="outline" className="text-[10px]">
                                Due {r.due_date}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {sc && (
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            SC: {sc.name}
                            {sc.agency ? ` · ${sc.agency}` : ""}
                          </div>
                        )}
                        {r.requested_codes && r.requested_codes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.requested_codes.slice(0, 6).map((c) => (
                              <Badge key={c} variant="secondary" className="text-[10px]">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {orgId && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <StageAdvancer
                              organizationId={orgId}
                              referralId={r.id}
                              currentStage={(r.stage ?? "new") as ReferralStage}
                            />
                            <button
                              type="button"
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => setDetailId(r.id)}
                            >
                              Activity →
                            </button>
                          </div>
                        )}
                        {r.stage === "decision" && r.decision_outcome && (
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            Outcome:{" "}
                            <span className="font-medium">
                              {r.decision_outcome}
                            </span>
                            {r.decision_reason ? ` — ${r.decision_reason}` : ""}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {orgId && (
        <ReferralDetailDialog
          organizationId={orgId}
          referralId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
        />
      )}
    </div>
  );
}

// ─── New Referral dialog ───────────────────────────────────────

function NewReferralDialog({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const scListFn = useServerFn(listSupportCoordinators);
  const createScFn = useServerFn(createSupportCoordinator);
  const createRefFn = useServerFn(createReferral);
  const dupCheckFn = useServerFn(findPossibleDuplicateReferral);

  const scs = useQuery({
    queryKey: ["support-coordinators", organizationId],
    queryFn: () => scListFn({ data: { organization_id: organizationId } }),
    enabled: open,
  });

  // form state
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [category, setCategory] = useState<Category>("direct_support");
  const [needLevel, setNeedLevel] = useState("");
  const [disabilityTypes, setDisabilityTypes] = useState("");
  const [disabilityLevel, setDisabilityLevel] = useState("");
  const [requestedCodes, setRequestedCodes] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [scId, setScId] = useState<string>("");
  const [duplicates, setDuplicates] = useState<
    Awaited<ReturnType<typeof dupCheckFn>> | null
  >(null);

  // inline SC create
  const [showScForm, setShowScForm] = useState(false);
  const [scName, setScName] = useState("");
  const [scAgency, setScAgency] = useState("");
  const [scEmail, setScEmail] = useState("");
  const [scPhone, setScPhone] = useState("");
  const [scRegion, setScRegion] = useState("");

  const reset = () => {
    setFirstName("");
    setAge("");
    setGender("");
    setCity("");
    setCounty("");
    setCategory("direct_support");
    setNeedLevel("");
    setDisabilityTypes("");
    setDisabilityLevel("");
    setRequestedCodes("");
    setBudgetNote("");
    setDescription("");
    setDueDate("");
    setScId("");
    setDuplicates(null);
    setShowScForm(false);
    setScName("");
    setScAgency("");
    setScEmail("");
    setScPhone("");
    setScRegion("");
  };

  const createSc = useMutation({
    mutationFn: () =>
      createScFn({
        data: {
          organization_id: organizationId,
          name: scName.trim(),
          agency: scAgency || null,
          email: scEmail || null,
          phone: scPhone || null,
          region: scRegion || null,
        },
      }),
    onSuccess: (row) => {
      toast.success("Support Coordinator added");
      qc.invalidateQueries({ queryKey: ["support-coordinators", organizationId] });
      if (row?.id) setScId(row.id);
      setShowScForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runDupCheck = async () => {
    if (!firstName.trim()) return;
    try {
      const rows = await dupCheckFn({
        data: {
          organization_id: organizationId,
          first_name: firstName.trim(),
          age: age ? Number(age) : null,
          support_coordinator_id: scId || null,
        },
      });
      setDuplicates(rows);
    } catch {
      setDuplicates(null);
    }
  };

  const create = useMutation({
    mutationFn: () =>
      createRefFn({
        data: {
          organization_id: organizationId,
          first_name: firstName.trim(),
          age: age ? Number(age) : null,
          gender: gender || null,
          date_of_birth: null,
          location_city: city || null,
          location_county: county || null,
          disability_types: splitList(disabilityTypes),
          disability_level: disabilityLevel || null,
          requested_codes: splitList(requestedCodes).map((s) => s.toUpperCase()),
          budget_note: budgetNote || null,
          need_level: needLevel || null,
          description: description || null,
          category,
          source: "manual_upload",
          support_coordinator_id: scId || null,
          due_date: dueDate || null,
        },
      }),
    onSuccess: () => {
      toast.success("Referral created");
      qc.invalidateQueries({ queryKey: ["referrals", organizationId] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New referral
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New referral</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-1">
            <Label htmlFor="ref-first">First name *</Label>
            <Input
              id="ref-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={runDupCheck}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-1">
            <div>
              <Label htmlFor="ref-age">Age</Label>
              <Input
                id="ref-age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                onBlur={runDupCheck}
              />
            </div>
            <div>
              <Label htmlFor="ref-gender">Gender</Label>
              <Input
                id="ref-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ref-due">Due date</Label>
            <Input
              id="ref-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ref-city">City</Label>
            <Input
              id="ref-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ref-county">County</Label>
            <Input
              id="ref-county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ref-need">Need level</Label>
            <Input
              id="ref-need"
              value={needLevel}
              onChange={(e) => setNeedLevel(e.target.value)}
              placeholder="e.g. T2, high supervision"
            />
          </div>
          <div>
            <Label htmlFor="ref-dlevel">Disability level</Label>
            <Input
              id="ref-dlevel"
              value={disabilityLevel}
              onChange={(e) => setDisabilityLevel(e.target.value)}
              placeholder="e.g. mild / moderate / severe"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-dtypes">Disability types</Label>
            <Input
              id="ref-dtypes"
              value={disabilityTypes}
              onChange={(e) => setDisabilityTypes(e.target.value)}
              placeholder="Comma-separated (e.g. ID, autism, physical)"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-codes">Requested codes</Label>
            <Input
              id="ref-codes"
              value={requestedCodes}
              onChange={(e) => setRequestedCodes(e.target.value)}
              placeholder="Comma-separated (e.g. RHS, DSG, PBA)"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-budget">Budget / funding note</Label>
            <Input
              id="ref-budget"
              value={budgetNote}
              onChange={(e) => setBudgetNote(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Support Coordinator</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex-1">
                <Select
                  value={scId}
                  onValueChange={(v) => {
                    setScId(v);
                    setTimeout(runDupCheck, 0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Support Coordinator…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(scs.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.agency ? ` — ${s.agency}` : ""}
                      </SelectItem>
                    ))}
                    {(scs.data ?? []).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No coordinators yet — add one →
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowScForm((v) => !v)}
                className="gap-1"
              >
                <UserPlus className="h-4 w-4" />
                {showScForm ? "Cancel" : "Add new"}
              </Button>
            </div>

            {showScForm && (
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/40 p-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="sc-name">Name *</Label>
                  <Input
                    id="sc-name"
                    value={scName}
                    onChange={(e) => setScName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-agency">Agency</Label>
                  <Input
                    id="sc-agency"
                    value={scAgency}
                    onChange={(e) => setScAgency(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-region">Region</Label>
                  <Input
                    id="sc-region"
                    value={scRegion}
                    onChange={(e) => setScRegion(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-email">Email</Label>
                  <Input
                    id="sc-email"
                    type="email"
                    value={scEmail}
                    onChange={(e) => setScEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-phone">Phone</Label>
                  <Input
                    id="sc-phone"
                    value={scPhone}
                    onChange={(e) => setScPhone(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => createSc.mutate()}
                    disabled={!scName.trim() || createSc.isPending}
                  >
                    Save coordinator
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-desc">Description</Label>
            <Textarea
              id="ref-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {duplicates && duplicates.length > 0 && (
            <div className="md:col-span-2">
              <Alert variant="default" className="border-amber-400 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Possible duplicate</AlertTitle>
                <AlertDescription>
                  {duplicates.length} similar referral
                  {duplicates.length > 1 ? "s" : ""} created in the last 90
                  days. You can proceed anyway.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!firstName.trim() || create.isPending}
          >
            Create referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
