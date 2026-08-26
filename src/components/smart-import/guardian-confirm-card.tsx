/**
 * Own-vs-separate guardian confirmation for Smart Import client review.
 * Writes extracted_fields via applyMissingClientFields so review + commit
 * validators both see an explicit is_own_guardian boolean.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyMissingClientFields } from "@/lib/smart-import-review.functions";
import { parseOwnGuardianValue } from "@/lib/import-validation";

type FieldLike = {
  target_field: string;
  value: string | null;
  dismissed_at?: string | null;
};

export function GuardianConfirmCard({
  subjectId,
  fields,
  onChanged,
}: {
  subjectId: string;
  fields: FieldLike[];
  onChanged: () => void;
}) {
  const applyFn = useServerFn(applyMissingClientFields);
  const byTarget = (t: string) =>
    fields.find((f) => f.target_field === t && !f.dismissed_at)?.value ?? "";
  const parsed = parseOwnGuardianValue(byTarget("is_own_guardian"));
  const [isOwn, setIsOwn] = useState<boolean | null>(parsed);
  const [gName, setGName] = useState(byTarget("guardian_name"));
  const [gPhone, setGPhone] = useState(byTarget("guardian_phone"));
  const [gRel, setGRel] = useState(byTarget("guardian_relationship"));
  const [gEmail, setGEmail] = useState(byTarget("guardian_email"));

  useEffect(() => {
    setIsOwn(parseOwnGuardianValue(byTarget("is_own_guardian")));
    setGName(byTarget("guardian_name"));
    setGPhone(byTarget("guardian_phone"));
    setGRel(byTarget("guardian_relationship"));
    setGEmail(byTarget("guardian_email"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const m = useMutation({
    mutationFn: (vars: {
      is_own_guardian: boolean;
      guardian_name?: string;
      guardian_phone?: string;
      guardian_relationship?: string;
      guardian_email?: string;
    }) => applyFn({ data: { subjectId, values: vars } }),
    onSuccess: () => {
      toast.success("Guardian status saved");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsAnswer = isOwn == null;
  const needsContacts = isOwn === false && (!gName.trim() || !gPhone.trim());

  return (
    <div
      className={
        needsAnswer || needsContacts
          ? "rounded-2xl border border-destructive/40 bg-destructive/5 p-4 shadow-[var(--shadow-card)]"
          : "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
      }
    >
      <div className="flex items-start gap-2">
        <UserCheck className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Is this client their own guardian?
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Required before completing Smart Import. Choose one — a freeform clarifying
              answer alone will not clear this gate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isOwn === true ? "default" : "outline"}
              disabled={m.isPending}
              onClick={() => {
                setIsOwn(true);
                m.mutate({ is_own_guardian: true });
              }}
            >
              Their own guardian
            </Button>
            <Button
              size="sm"
              variant={isOwn === false ? "default" : "outline"}
              disabled={m.isPending}
              onClick={() => setIsOwn(false)}
            >
              Has a separate guardian
            </Button>
          </div>
          {isOwn === false && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Guardian name (required)"
                value={gName}
                onChange={(e) => setGName(e.target.value)}
              />
              <Input
                placeholder="Guardian phone (required)"
                value={gPhone}
                onChange={(e) => setGPhone(e.target.value)}
              />
              <Input
                placeholder="Relationship"
                value={gRel}
                onChange={(e) => setGRel(e.target.value)}
              />
              <Input
                placeholder="Guardian email"
                value={gEmail}
                onChange={(e) => setGEmail(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  disabled={m.isPending || !gName.trim() || !gPhone.trim()}
                  onClick={() =>
                    m.mutate({
                      is_own_guardian: false,
                      guardian_name: gName.trim(),
                      guardian_phone: gPhone.trim(),
                      guardian_relationship: gRel.trim() || undefined,
                      guardian_email: gEmail.trim() || undefined,
                    })
                  }
                >
                  {m.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save guardian details
                </Button>
              </div>
            </div>
          )}
          {isOwn === true && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Saved as own guardian — contact fields will be cleared on commit.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
