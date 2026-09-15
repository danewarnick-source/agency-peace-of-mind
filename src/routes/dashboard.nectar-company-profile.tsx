import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Building2 } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { agencySetupQueryKey } from "@/hooks/use-agency-setup";
import { persistAgencySetupFacts } from "@/lib/agency-setup-gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { RequireRole } from "@/components/rbac-guard";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { cn } from "@/lib/utils";
import { awardableServiceCodeChoices } from "@/lib/service-code-registry";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/nectar-company-profile")({
  head: () => ({ meta: [{ title: "NECTAR Company Profile — Provider Interface" }] }),
  validateSearch: (s: Record<string, unknown>): { from?: string; step?: string | number } => {
    const out: { from?: string; step?: string | number } = {};
    if (typeof s.from === "string") out.from = s.from;
    if (typeof s.step === "string" || typeof s.step === "number") out.step = s.step;
    return out;
  },
  component: () => (
    <RequireRole roles={["admin", "program_manager", "manager"]}>
      <NectarCompanyProfilePage />
    </RequireRole>
  ),
});

const SERVICE_OPTIONS = awardableServiceCodeChoices();

type ProfileDraft = {
  providerEmail: string;
  services: string[];
  clientCount: string;
  staffCount: string;
  serviceArea: string;
  specializations: string;
};

const EMPTY: ProfileDraft = {
  providerEmail: "",
  services: [],
  clientCount: "",
  staffCount: "",
  serviceArea: "",
  specializations: "",
};

function NectarCompanyProfilePage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const persistCompliance = useServerFn(persistAgencySetupFacts);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY);

  const { data: orgRow } = useQuery({
    queryKey: ["nectar-company-profile-org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select(
          "services_offered, approx_client_count, service_area, specializations, nectar_profile_saved_at",
        )
        .eq("id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!orgRow) return;
    const offered = Array.isArray(orgRow.services_offered) ? orgRow.services_offered : [];
    // Preserve every already-saved code, including one this registry doesn't
    // recognize yet — never silently drop an existing selection.
    setDraft({
      providerEmail: "",
      services: offered.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      clientCount: orgRow.approx_client_count == null ? "" : String(orgRow.approx_client_count),
      staffCount: "",
      serviceArea: orgRow.service_area ?? "",
      specializations: orgRow.specializations ?? "",
    });
  }, [orgRow]);

  const saved = !!orgRow?.nectar_profile_saved_at;

  const toggleService = (s: string) => {
    setDraft((d) => ({
      ...d,
      services: d.services.includes(s) ? d.services.filter((x) => x !== s) : [...d.services, s],
    }));
  };

  // Compliance-relevant fields (services / count / area) go through the
  // shared agency-setup persist path so obligation_applicability stays in
  // sync — this page must not compute setup completion itself, but it also
  // must not let those fields drift out of sync with it. NECTAR-only fields
  // (specializations, provider_approver_email, nectar_profile_saved_at)
  // update directly since they are outside the compliance registry.
  const save = async (): Promise<boolean> => {
    if (!orgId) return false;
    try {
      await persistCompliance({
        data: {
          organizationId: orgId,
          servicesOffered: draft.services ?? [],
          approxClientCount: Number(draft.clientCount) || null,
          serviceArea: draft.serviceArea?.trim() || null,
        },
      });

      const { error } = await supabase
        .from("organizations")
        .update({
          specializations: draft.specializations?.trim() || null,
          nectar_profile_saved_at: new Date().toISOString(),
          // Live-only column used by 520 billing; not a setup-completion fact.
          provider_approver_email: draft.providerEmail?.trim() || null,
        } as never)
        .eq("id", orgId);
      if (error) throw error;

      // Mirror awarded codes into provider_interest_outline.codes_held for
      // NECTAR routing. Best-effort; RLS errors are non-fatal.
      try {
        const codes = (draft.services ?? []).map((c) => String(c).toUpperCase());
        const { data: existing } = await supabase
          .from("provider_interest_outline")
          .select("id")
          .eq("organization_id", orgId)
          .eq("name", "Default")
          .maybeSingle();
        if (existing?.id) {
          await supabase
            .from("provider_interest_outline")
            .update({ codes_held: codes })
            .eq("id", existing.id);
        } else {
          await supabase.from("provider_interest_outline").insert({
            organization_id: orgId,
            name: "Default",
            location_mode: "anywhere",
            location_values: [],
            codes_held: codes,
            need_levels_served: [],
            disability_types_served: [],
            disability_levels_served: [],
          });
        }
      } catch (err) {
        console.warn("[nectar-profile] provider_interest_outline sync skipped", err);
      }

      await qc.invalidateQueries({ queryKey: ["nectar-company-profile-org", orgId] });
      await qc.invalidateQueries({ queryKey: agencySetupQueryKey(orgId) });
      toast.success("Got it — I've calibrated to your agency.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save profile.");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={1} />

      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--amber-500,var(--hive-gold))]/15 text-[color:var(--amber-600,#d97706)]">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            NECTAR — Company profile
          </h1>
          <p className="text-sm text-muted-foreground">
            A few details so NECTAR can calibrate its guidance. Saving this page does not unlock
            hire or add-client — that is the six operating facts on Home / compliance setup.
          </p>
        </div>
      </header>

      <Card className="space-y-4 p-5">
        <div>
          <Label className="text-xs">Services you provide</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(new Set([...SERVICE_OPTIONS, ...draft.services])).map((s) => {
              const active = draft.services.includes(s);
              const recognized = (SERVICE_OPTIONS as readonly string[]).includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleService(s)}
                  title={
                    recognized ? undefined : "Not in the current code registry — verify this code"
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-[color:var(--amber-500,var(--hive-gold))] bg-[color:var(--amber-500,var(--hive-gold))] text-[#0b1733]"
                      : "border-border bg-background hover:border-[color:var(--amber-500,var(--hive-gold))]/40",
                    !recognized && "border-dashed",
                  )}
                >
                  {s}
                  {!recognized ? " ⚠" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label className="text-xs">Provider approver email (for 520 billing)</Label>
          <Input
            type="email"
            value={draft.providerEmail}
            onChange={(e) => setDraft({ ...draft, providerEmail: e.target.value })}
            placeholder="email that signs off 520 billing"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Approx. clients served</Label>
            <Input
              inputMode="numeric"
              value={draft.clientCount}
              onChange={(e) => setDraft({ ...draft, clientCount: e.target.value })}
              placeholder="e.g. 24"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Approx. active staff</Label>
            <Input
              inputMode="numeric"
              value={draft.staffCount}
              onChange={(e) => setDraft({ ...draft, staffCount: e.target.value })}
              placeholder="e.g. 35"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Service area or counties</Label>
          <Input
            value={draft.serviceArea}
            onChange={(e) => setDraft({ ...draft, serviceArea: e.target.value })}
            placeholder="e.g. Salt Lake, Davis, Weber"
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs">Specializations (optional)</Label>
          <Textarea
            rows={2}
            value={draft.specializations}
            onChange={(e) => setDraft({ ...draft, specializations: e.target.value })}
            placeholder="Behavioral support, medically complex, dual-diagnosis…"
            className="mt-1"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            onClick={async () => {
              const ok = await save();
              if (ok) navigate({ to: "/dashboard", search: { welcome: true } });
            }}
          >
            {saved ? "Update profile" : "Save & return to setup"}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
