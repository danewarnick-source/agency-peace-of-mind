import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ShieldCheck, Shield, Search, UserCog, ScrollText, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listAllMembers,
  updateMember,
  listHiveExecutives,
  setHiveExecutiveByEmail,
  listAuditLog,
  type MemberRow,
} from "@/lib/hive-exec-admin.functions";

export const Route = createFileRoute("/dashboard/hive-exec/permissions")({
  head: () => ({ meta: [{ title: "Permissions & Roles — HIVE Executive" }] }),
  component: PermissionsPage,
});

const ROLE_OPTIONS = ["employee", "manager", "admin", "super_admin"] as const;

function PermissionsPage() {
  return (
    <div className="space-y-6">
      <HiveExecsSection />
      <MembersSection />
      <AuditSection />
    </div>
  );
}

// ───── HIVE Executive grants ────────────────────────────────────────────────

function HiveExecsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listHiveExecutives);
  const setFn = useServerFn(setHiveExecutiveByEmail);
  const q = useQuery({ queryKey: ["hive-execs"], queryFn: () => listFn() });
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const grant = useMutation({
    mutationFn: (vars: { email: string; grant: boolean; notes: string | null }) =>
      setFn({ data: vars }),
    onSuccess: () => {
      toast.success("HIVE Executive role updated.");
      setEmail("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["hive-execs"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-audit"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="rounded-xl border border-[#fed7aa] bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[#d97a1c]" />
        <h2 className="font-display text-lg font-semibold">HIVE Executive Role</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        HIVE Executives can access this platform-owner portal across every customer company.
        Only existing HIVE Executives can grant or revoke this role.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          grant.mutate({ email: email.trim(), grant: true, notes: notes || null });
        }}
        className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-[#fff7ed]/40 p-3 md:flex-row md:items-end"
      >
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Account email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="newexec@hive.example"
            className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
            required
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason / context"
            className="min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={grant.isPending || !email.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-[#d97a1c] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#b8631a] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Grant
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Granted</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : (q.data ?? []).length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No HIVE Executives.</td></tr>
            ) : (q.data ?? []).map((r) => (
              <tr key={r.user_id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium text-[#0f1b3d]">{r.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.email ?? r.user_id}</div>
                </td>
                <td className="px-3 py-2">
                  {r.active ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Revoked</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(r.granted_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {r.active && r.email ? (
                    <button
                      onClick={() => {
                        if (confirm(`Revoke HIVE Executive role for ${r.email}?`)) {
                          grant.mutate({ email: r.email!, grant: false, notes: null });
                        }
                      }}
                      className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
                    >
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───── Cross-company members ─────────────────────────────────────────────────

function MembersSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllMembers);
  const updFn = useServerFn(updateMember);
  const q = useQuery({ queryKey: ["hive-exec-members"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");

  const upd = useMutation({
    mutationFn: (vars: { membershipId: string; patch: Partial<Pick<MemberRow, "role" | "active" | "is_company_executive">> }) =>
      updFn({ data: vars }),
    onSuccess: () => {
      toast.success("Membership updated.");
      qc.invalidateQueries({ queryKey: ["hive-exec-members"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-audit"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const orgs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of q.data ?? []) seen.set(m.organization_id, m.organization_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [q.data]);

  const rows = useMemo(() => {
    return (q.data ?? []).filter((m) => {
      if (orgFilter !== "all" && m.organization_id !== orgFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !(m.full_name ?? "").toLowerCase().includes(s) &&
          !(m.email ?? "").toLowerCase().includes(s) &&
          !m.organization_name.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [q.data, search, orgFilter]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-[#0f1b3d]" />
          <h2 className="font-display text-lg font-semibold">Cross-Company Memberships</h2>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user or company…"
              className="min-h-[44px] w-full rounded-md border border-border bg-background pl-7 pr-3 text-sm md:w-64"
            />
          </div>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">All companies</option>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Co. Exec</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No matches.</td></tr>
            ) : rows.map((m) => (
              <tr key={m.membership_id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium text-[#0f1b3d]">{m.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{m.email ?? m.user_id}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{m.organization_name}</td>
                <td className="px-3 py-2">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      upd.mutate({ membershipId: m.membership_id, patch: { role: e.target.value as typeof ROLE_OPTIONS[number] } })
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={m.is_company_executive}
                    onChange={(e) =>
                      upd.mutate({ membershipId: m.membership_id, patch: { is_company_executive: e.target.checked } })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => upd.mutate({ membershipId: m.membership_id, patch: { active: !m.active } })}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      m.active
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    }`}
                  >
                    {m.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───── Audit log ─────────────────────────────────────────────────────────────

function AuditSection() {
  const listFn = useServerFn(listAuditLog);
  const q = useQuery({ queryKey: ["hive-exec-audit"], queryFn: () => listFn() });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-[#0f1b3d]" />
        <h2 className="font-display text-lg font-semibold">HIVE Executive Audit Trail</h2>
        <Shield className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Summary</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : (q.data ?? []).length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No audit entries yet.</td></tr>
            ) : (q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs">{r.actor_name ?? r.actor_user_id.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-[#fff7ed] px-2 py-0.5 text-xs font-medium text-[#9a3412]">
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.target_org_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.summary ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
