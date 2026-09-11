import { createFileRoute, redirect } from "@tanstack/react-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LegacySearch = {
  tab?: string;
  new?: boolean;
  obligation?: string;
};

function parseLegacySearch(s: Record<string, unknown>): LegacySearch {
  const openNew = s.new === "1" || s.new === 1 || s.new === true || s.new === "true";
  const obligation =
    typeof s.obligation === "string" && UUID_RE.test(s.obligation) ? s.obligation : undefined;
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : undefined;
  return {
    ...(tabRaw ? { tab: tabRaw } : {}),
    ...(openNew ? { new: true as const } : {}),
    ...(obligation ? { obligation } : {}),
  };
}

/**
 * Legacy company-obligations / Obligations register.
 * Agency file is the company surface. Staff pack dues live on Staff file.
 */
export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Agency file — Provider Interface" }] }),
  validateSearch: parseLegacySearch,
  beforeLoad: ({ search }) => {
    const tab = typeof search.tab === "string" ? search.tab : "";
    if (tab === "action-required" || tab === "onboarding" || tab === "credentials" || tab === "client") {
      throw redirect({
        to: "/dashboard/compliance",
        search: { tab: "staff" },
        replace: true,
      });
    }
    throw redirect({
      to: "/dashboard/compliance",
      search:
        tab === "policy-library" || tab === "policies"
          ? { tab: "company-policies" }
          : { tab: "agency" },
      replace: true,
    });
  },
});
