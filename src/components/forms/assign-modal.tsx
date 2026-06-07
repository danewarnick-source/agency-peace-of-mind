import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAssignDirectory } from "@/lib/forms.functions";

export function AssignModal({
  open, onOpenChange, groups, users, onChange,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  groups: string[]; users: string[];
  onChange: (groups: string[], users: string[]) => void;
}) {
  const [g, setG] = useState<string[]>(groups);
  const [u, setU] = useState<string[]>(users);
  const [q, setQ] = useState("");

  const fetchDir = useServerFn(getAssignDirectory);
  const { data } = useQuery({ queryKey: ["assign-dir"], queryFn: () => fetchDir(), enabled: open, staleTime: 60_000 });

  const filtered = useMemo(() => {
    const list = (data?.profiles ?? []).slice().sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((p) => (p.full_name ?? "").toLowerCase().includes(needle) || (p.email ?? "").toLowerCase().includes(needle));
  }, [data, q]);

  function toggleG(key: string) {
    setG((arr) => arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]);
  }
  function toggleU(id: string) {
    setU((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  const types = data?.staffTypes ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Assign form</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <section>
            <p className="text-sm font-semibold mb-1.5">By group / job code</p>
            <div className="flex flex-wrap gap-1.5">
              <Pill checked={g.includes("all_staff")} label="All staff" onClick={() => toggleG("all_staff")} />
              {types.map((t) => (
                <Pill key={t.key} checked={g.includes(t.key)} label={t.label} onClick={() => toggleG(t.key)} />
              ))}
              {types.length === 0 && <p className="text-xs text-muted-foreground">No staff types defined yet — assign individuals below.</p>}
            </div>
          </section>
          <section>
            <p className="text-sm font-semibold mb-1.5">By individual ({u.length} selected)</p>
            <Input placeholder="Search staff…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y">
              {filtered.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 min-h-[44px]">
                  <Checkbox checked={u.includes(p.id)} onCheckedChange={() => toggleU(p.id)} />
                  <span className="flex-1 truncate">{p.full_name ?? p.email}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[140px]">{(p.staff_type_keys ?? []).join(", ")}</span>
                </label>
              ))}
              {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">No staff match.</p>}
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onChange(g, u); onOpenChange(false); }}>Save assignments</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pill({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-medium border transition ${checked ? "bg-[#0B1126] text-white border-[#0B1126]" : "bg-background text-foreground border-border hover:bg-muted"}`}>
      {label}
    </button>
  );
}
