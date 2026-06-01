import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, UserPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createCompany } from "@/lib/hive-exec-admin.functions";

export const Route = createFileRoute("/dashboard/hive-exec/new-company")({
  head: () => ({ meta: [{ title: "Add New Company — HIVE Executive" }] }),
  component: NewCompanyPage,
});

function NewCompanyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createCompany);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [plan, setPlan] = useState<"starter" | "pro" | "enterprise" | "custom">("starter");
  const [status, setStatus] = useState<"trial" | "active">("trial");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: () =>
      createFn({
        data: { name, adminEmail, adminFullName, plan, status, notes: notes || null },
      }),
    onSuccess: (res) => {
      toast.success("Company created and admin invited.");
      qc.invalidateQueries({ queryKey: ["hive-exec-companies"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-kpis"] });
      navigate({ to: "/dashboard/hive-exec/$orgId", params: { orgId: res.organization_id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disabled = !name.trim() || !adminEmail.trim() || !adminFullName.trim() || m.isPending;

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff7ed] text-[#9a3412]">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Add New Company</h2>
            <p className="text-xs text-muted-foreground">
              Provision a new customer organization and invite its initial admin. The admin receives
              an email invite and lands in their Admin View on first login.
            </p>
          </div>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) m.mutate();
        }}
        className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-2"
      >
        <Field label="Company name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Care Services"
            className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
            required
          />
        </Field>

        <Field label="Plan">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as typeof plan)}
            className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
            <option value="custom">Custom</option>
          </select>
        </Field>

        <Field label="Initial status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="trial">Trial</option>
            <option value="active">Active</option>
          </select>
        </Field>

        <div className="md:col-span-2">
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" /> Initial Company Admin
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Admin full name" required>
              <input
                value={adminFullName}
                onChange={(e) => setAdminFullName(e.target.value)}
                placeholder="Jane Doe"
                className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
                required
              />
            </Field>
            <Field label="Admin email" required>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="jane@acmecare.com"
                className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
                required
              />
            </Field>
          </div>
        </div>

        <Field label="Internal notes (optional)" className="md:col-span-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Deal notes, special configuration, etc."
            rows={3}
            className="w-full rounded-md border border-border bg-background p-3 text-sm"
          />
        </Field>

        <div className="md:col-span-2 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard/hive-exec" })}
            className="min-h-[44px] rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#d97a1c] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#b8631a] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {m.isPending ? "Creating…" : "Create company & invite admin"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} {required ? <span className="text-[#b91c1c]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
