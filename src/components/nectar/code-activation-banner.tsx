import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  activateCodeRequirements,
  listPendingCodeActivations,
} from "@/lib/nectar-requirement-usage.functions";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Banner listing every held billing code that still has pending requirement
 * activations. One click per code confirms and switches all of that code's
 * requirements from pending → active_by_code, attributed to the current user.
 */
export function CodeActivationBanner({ organizationId }: { organizationId: string }) {
  const listFn = useServerFn(listPendingCodeActivations);
  const activateFn = useServerFn(activateCodeRequirements);
  const qc = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: ["nectar-pending-code-activations", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });

  const activate = useMutation({
    mutationFn: (serviceCode: string) =>
      activateFn({ data: { organizationId, serviceCode } }),
    onSuccess: (res, code) => {
      toast.success(`Activated ${res.activatedCount} requirements for ${code}`);
      qc.invalidateQueries({ queryKey: ["nectar-pending-code-activations"] });
      qc.invalidateQueries({ queryKey: ["nectar-requirements"] });
      // Cache-bust any authoritative-sources list query.
      qc.invalidateQueries({ queryKey: ["authoritative-sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!pending || pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Confirm requirement activation for your authorized codes
          </div>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
            Requirements for these codes are ready but not yet active. One click
            per code activates all of its requirements and records who
            confirmed, when.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.map((p) => (
              <Button
                key={p.service_code}
                size="sm"
                variant="outline"
                disabled={activate.isPending && activate.variables === p.service_code}
                onClick={() => activate.mutate(p.service_code)}
                className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Activate {p.pending_count} for {p.service_code}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
