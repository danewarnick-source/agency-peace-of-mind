import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ObligationPackGrid } from "@/components/company-obligations/obligation-pack-grid";
import { ActionRequiredPanel } from "@/components/company-obligations/action-required-panel";
import { useActionRequiredQueue } from "@/hooks/use-action-required-queue";
import { isLockedPackKey } from "@/lib/obligation-packs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyObligationsSearch = {
  tab?: string;
  new?: boolean;
  obligation?: string;
};

function parseCompanyObligationsSearch(s: Record<string, unknown>): CompanyObligationsSearch {
  const openNew = s.new === "1" || s.new === 1 || s.new === true || s.new === "true";
  const obligation =
    typeof s.obligation === "string" && UUID_RE.test(s.obligation) ? s.obligation : undefined;
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : undefined;
  const legacy =
    tabRaw === "obligations" ||
    tabRaw === "utah-pack" ||
    tabRaw === "policy-library" ||
    tabRaw === "overview"
      ? undefined
      : tabRaw;
  return {
    ...(legacy ? { tab: legacy } : {}),
    ...(openNew ? { new: true as const } : {}),
    ...(obligation ? { obligation } : {}),
  };
}

export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Obligations — HIVE" }] }),
  validateSearch: parseCompanyObligationsSearch,
  component: CompanyObligationsPage,
});

function CompanyObligationsPage() {
  const navigate = useNavigate({ from: "/dashboard/company-obligations" });
  const { data: org, isLoading } = useCurrentOrg();
  const { tab } = Route.useSearch();
  const canAccess =
    org?.role === "admin" || org?.role === "program_manager" || org?.role === "manager";
  const { totalCount: actionCount, isLoading: actionQueueLoading } = useActionRequiredQueue(
    canAccess ? org?.organization_id : null,
  );

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!org || !canAccess) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view obligations.
      </div>
    );
  }

  const showAction = tab === "action-required";
  const packKey =
    tab && tab !== "action-required"
      ? tab
      : isLockedPackKey(tab ?? "")
        ? (tab as string)
        : "onboarding";

  return (
    <div className="space-y-4">
      <Tabs
        value={showAction ? "action-required" : "grid"}
        onValueChange={(v) => {
          navigate({
            search: (prev) => ({
              ...prev,
              tab: v === "action-required" ? "action-required" : undefined,
            }),
          });
        }}
      >
        <TabsList className="h-auto">
          <TabsTrigger value="grid">Packs</TabsTrigger>
          <TabsTrigger value="action-required" className="gap-1.5">
            Action Required
            {!actionQueueLoading && actionCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 border-transparent bg-destructive text-destructive-foreground"
              >
                {actionCount}
              </Badge>
            ) : (
              <span
                aria-label="No urgent items"
                className="inline-block h-2 w-2 rounded-full bg-success"
              />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="grid" className="mt-4">
          <ObligationPackGrid
            orgId={org.organization_id}
            packKey={showAction ? "onboarding" : packKey}
            onPackKeyChange={(key) =>
              navigate({
                search: (prev) => ({
                  ...prev,
                  tab: key === "onboarding" ? undefined : key,
                }),
              })
            }
          />
        </TabsContent>
        <TabsContent value="action-required" className="mt-4">
          <ActionRequiredPanel orgId={org.organization_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
