import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, X, UserPlus, Contact2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Clients — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientsPage />
    </RequirePermission>
  ),
});

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  physical_address: string | null;
  pcsp_goals: string[];
  job_code: string | null;
};

function ClientsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: clients, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone_number, physical_address, pcsp_goals, job_code")
        .eq("organization_id", org!.organization_id)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: {
      first_name: string; last_name: string; phone_number: string;
      physical_address: string; pcsp_goals: string[];
    }) => {
      const { error } = await supabase.from("clients").insert({
        organization_id: org!.organization_id,
        ...input,
        home_latitude: 40.3524,
        home_longitude: -111.9051,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client added");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Client Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage individuals served and their PCSP care goals.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add new client</Button>
          </DialogTrigger>
          <AddClientDialog onSubmit={(v) => addMutation.mutate(v)} pending={addMutation.isPending} />
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !clients?.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Contact2 className="h-8 w-8 text-muted-foreground/60" />
            <p>No clients yet. Add your first client to begin tracking shifts.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Active goals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone_number || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.physical_address || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.pcsp_goals?.length ? (
                        c.pcsp_goals.map((g) => (
                          <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                        ))
                      ) : <span className="text-xs text-muted-foreground">No goals</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AddClientDialog({
  onSubmit, pending,
}: {
  onSubmit: (v: { first_name: string; last_name: string; phone_number: string; physical_address: string; pcsp_goals: string[] }) => void;
  pending: boolean;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  const canSubmit = useMemo(() => first.trim() && last.trim() && addr.trim(), [first, last, addr]);

  const addGoal = () => {
    const v = goalInput.trim();
    if (!v || goals.includes(v)) return;
    setGoals([...goals, v]);
    setGoalInput("");
  };
  const removeGoal = (g: string) => setGoals(goals.filter((x) => x !== g));

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add a new client</DialogTitle></DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            first_name: first.trim(),
            last_name: last.trim(),
            phone_number: phone.trim(),
            physical_address: addr.trim(),
            pcsp_goals: goals,
          });
        }}
        className="grid gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="first">First name</Label>
            <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} required maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last">Last name</Label>
            <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} required maxLength={100} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="addr">Street address</Label>
          <Input id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} required maxLength={255} />
        </div>
        <div className="grid gap-2">
          <Label>PCSP goals</Label>
          <div className="flex gap-2">
            <Input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
              placeholder="e.g. Independent Meal Prep"
              maxLength={120}
            />
            <Button type="button" variant="outline" size="icon" onClick={addGoal}><Plus className="h-4 w-4" /></Button>
          </div>
          {goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {goals.map((g) => (
                <Badge key={g} variant="secondary" className="gap-1 font-normal">
                  {g}
                  <button type="button" onClick={() => removeGoal(g)} className="ml-0.5 rounded-full hover:bg-muted-foreground/20">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={!canSubmit || pending}>
            {pending ? "Saving…" : "Save client"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
