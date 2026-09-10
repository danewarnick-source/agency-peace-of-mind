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
 * Legacy company-obligations / Compliance / Obligations register.
 * Agency documents is the company surface. Staff pack dues live on Personnel file.
 */
export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Agency documents — Provider Interface" }] }),
  validateSearch: parseLegacySearch,
  beforeLoad: ({ search }) => {
    const tab = typeof search.tab === "string" ? search.tab : "";
    if (tab === "action-required" || tab === "onboarding" || tab === "credentials" || tab === "client") {
      throw redirect({
        to: "/dashboard/personnel-file",
        replace: true,
      });
    }
    throw redirect({
      to: "/dashboard/agency-documents",
      search: tab === "policy-library" || tab === "policies" ? { tab: "company-policies" } : {},
      replace: true,
    });
  },
});
