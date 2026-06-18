import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { RequireRole } from "@/components/rbac-guard";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { onboardingLSKey } from "@/hooks/use-onboarding-progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/nectar-company-profile")({
  head: () => ({ meta: [{ title: "NECTAR Company Profile — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
    step: typeof s.step === "string" || typeof s.step === "number" ? s.step : undefined,
  }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <NectarCompanyProfilePage />
    </RequireRole>
  ),
});

const SERVICE_OPTIONS = ["HHS", "SLN", "SLH", "SEI", "DSI", "RHS"] as const;
type Service = (typeof SERVICE_OPTIONS)[number];

type ProfileDraft = {
  services: Service[];
  clientCount: string;
  staffCount: string;
  serviceArea: string;
  specializations: string;
};

const EMPTY: ProfileDraft = {
  services: [],
  clientCount: "",
  staffCount: "",
  serviceArea: "",
  specializations: "",
};

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function NectarCompanyProfilePage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setDraft(readLS<ProfileDraft>(onboardingLSKey(orgId, "profile"), EMPTY));
    setSaved(readLS<boolean>(onboardingLSKey(orgId, "profile_saved"), false));
  }, [orgId]);

  const toggleService = (s: Service) => {
    setDraft((d) => ({
      ...d,
      services: d.services.includes(s) ? d.services.filter((x) => x !== s) : [...d.services, s],
    }));
  };

  const save = () => {
    if (!orgId) return;
    try {
      window.localStorage.setItem(onboardingLSKey(orgId, "profile"), JSON.stringify(draft));
      window.localStorage.setItem(onboardingLSKey(orgId, "profile_saved"), JSON.stringify(true));
      setSaved(true);
      toast.success("Got it — I've calibrated to your agency.");
    } catch {
      toast.error("Couldn't save profile.");
    }
  };

  return (
    <div className="space-y-4">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={2} />

      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--amber-500,#f4a93a)]/15 text-[color:var(--amber-600,#d97706)]">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            NECTAR — Company profile
          </h1>
          <p className="text-sm text-muted-foreground">
            A few details so NECTAR can calibrate its guidance to your agency.
          </p>
        </div>
      </header>

      <Card className="space-y-4 p-5">
        <div>
          <Label className="text-xs">Services you provide</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((s) => {
              const active = draft.services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleService(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-[color:var(--amber-500,#f4a93a)] bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733]"
                      : "border-border bg-background hover:border-[color:var(--amber-500,#f4a93a)]/40",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
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
            onClick={() => {
              save();
              navigate({ to: "/dashboard", search: { welcome: true } });
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
