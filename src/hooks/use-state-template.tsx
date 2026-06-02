import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStateTemplate } from "@/lib/state-templates.functions";
import { FALLBACK_TEMPLATE, type StateTemplate } from "@/lib/state-templates";

/**
 * Resolves the current org's state code → published state template.
 *
 * State is a configuration layer, not hardcoded logic. Consumers should read
 * terminology / EVV / training / billing values from this hook instead of
 * embedding state-specific assumptions in code.
 *
 * Returns a sane fallback (Utah-shaped) so components never have to gate on
 * `template == null`.
 */
export function useStateTemplate() {
  const fn = useServerFn(getMyStateTemplate);
  const q = useQuery({
    queryKey: ["my-state-template"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });

  const data = q.data as { state_code: string | null; template: StateTemplate | null } | undefined;
  const stateCode = data?.state_code ?? null;
  const tpl = (data?.template ?? FALLBACK_TEMPLATE) as Pick<
    StateTemplate,
    "terminology" | "training" | "billing_codes" | "evv" | "required_documents" | "department_structure"
  >;

  return {
    stateCode,
    template: tpl,
    isLoading: q.isLoading,
    error: q.error as Error | null,
  };
}
