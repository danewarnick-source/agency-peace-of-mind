import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { personNeedsSupportStrategies } from "@/lib/audit-evidence";
import {
  buildClientFileCards,
  isHousemateObligationTitle,
  tallyClientFileCards,
  type ClientFileCard,
  type ClientFileDoc,
  type ClientFileFacts,
  type ClientFileSummary,
} from "@/lib/client-file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const UUID_CHUNK = 80;

function chunkIds(ids: string[]): string[][] {
  if (!ids.length) return [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += UUID_CHUNK) {
    out.push(ids.slice(i, i + UUID_CHUNK));
  }
  return out;
}

export type ClientFileMatrixRow = {
  client_id: string;
  full_name: string;
  service_codes: string[];
  active: boolean;
  missing: number;
  due_soon: number;
  on_file: number;
  missing_items: Array<{ title: string; due_at: string | null }>;
};

export type ClientFilePackItem = {
  client_id: string;
  client_name: string;
  title: string;
  filename: string;
  path: string;
  bucket: "client-documents" | "client-photos";
};

export type ClientFileIndex = {
  clients: ClientFileMatrixRow[];
  cardsByClient: Map<string, ClientFileCard[]>;
  pack: ClientFilePackItem[];
};

type ClientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  account_status: string | null;
  is_own_guardian: boolean | null;
  grievance_acknowledged: boolean | null;
  grievance_signed_date: string | null;
  pcsp_expiration_date: string | null;
  client_photo_url: string | null;
  profile_photo_url: string | null;
};

function displayName(c: { first_name: string | null; last_name: string | null }): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || "Name not set";
}

async function maybe<T>(fn: () => Promise<{ data: T | null; error: { message: string } | null }>, fallback: T): Promise<T> {
  const { data, error } = await fn();
  if (error) {
    console.warn("[client-file]", error.message);
    return fallback;
  }
  return (data ?? fallback) as T;
}

/**
 * Org-wide Client file index from existing client artifacts.
 * No new tables. Same three statuses as the per-client tab.
 */
export async function loadOrgClientFileIndex(
  supabase: AnySupabase,
  organizationId: string,
  clientFilter?: string[] | null,
): Promise<ClientFileIndex> {
  const today = new Date().toISOString().slice(0, 10);
  const last365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const clientRows = await maybe(
    () =>
      supabase
        .from("clients")
        .select(
          "id, first_name, last_name, account_status, is_own_guardian, grievance_acknowledged, grievance_signed_date, pcsp_expiration_date, client_photo_url, profile_photo_url",
        )
        .eq("organization_id", organizationId),
    [] as ClientRow[],
  );

  const filterSet = clientFilter?.length ? new Set(clientFilter) : null;
  const scoped = clientRows.filter((c) => !filterSet || filterSet.has(c.id));
  if (!scoped.length) return { clients: [], cardsByClient: new Map(), pack: [] };

  const clientIds = scoped.map((c) => c.id);

  const codeRows: Array<{
    client_id: string;
    service_code: string | null;
    service_end_date: string | null;
    authorization_pending: boolean | null;
  }> = [];
  const docRows: Array<{
    client_id: string;
    document_type: string | null;
    file_name: string | null;
    storage_path: string | null;
    uploaded_at: string | null;
  }> = [];
  const belongRows: Array<{ client_id: string; inventoried_on: string | null }> = [];
  const summaryRows: Array<ClientFileSummary & { client_id: string }> = [];
  const pbaRows: Array<{ client_id: string }> = [];
  const ssRows: Array<{ client_id: string; status: string | null }> = [];

  for (const ids of chunkIds(clientIds)) {
    const [codes, docs, belongs, summaries, pbas, strategies] = await Promise.all([
      maybe(
        () =>
          supabase
            .from("client_billing_codes")
            .select("client_id, service_code, service_end_date, authorization_pending")
            .eq("organization_id", organizationId)
            .in("client_id", ids),
        [] as typeof codeRows,
      ),
      maybe(
        () =>
          supabase
            .from("client_documents")
            .select("client_id, document_type, file_name, storage_path, uploaded_at")
            .eq("organization_id", organizationId)
            .in("client_id", ids),
        [] as typeof docRows,
      ),
      maybe(
        () =>
          supabase
            .from("client_belongings")
            .select("client_id, inventoried_on")
            .eq("organization_id", organizationId)
            .in("client_id", ids),
        [] as typeof belongRows,
      ),
      maybe(
        () =>
          supabase
            .from("client_progress_summaries")
            .select(
              "client_id, status, due_date, finalized_at, requires_upi_attestation, upi_entered_at, period_label",
            )
            .eq("organization_id", organizationId)
            .in("client_id", ids)
            .order("due_date", { ascending: false }),
        [] as Array<ClientFileSummary & { client_id: string }>,
      ),
      maybe(
        () =>
          supabase
            .from("pba_accounts")
            .select("client_id")
            .eq("organization_id", organizationId)
            .in("client_id", ids),
        [] as Array<{ client_id: string }>,
      ),
      maybe(
        () =>
          supabase
            .from("client_specific_trainings")
            .select("client_id, status")
            .eq("organization_id", organizationId)
            .eq("training_type", "support_strategies")
            .in("client_id", ids),
        [] as Array<{ client_id: string; status: string | null }>,
      ),
    ]);
    codeRows.push(...codes);
    docRows.push(...docs);
    belongRows.push(...belongs);
    summaryRows.push(...summaries);
    pbaRows.push(...pbas);
    ssRows.push(...strategies);
  }

  const codesByClient = new Map<string, Set<string>>();
  for (const r of codeRows) {
    if (!r.service_code) continue;
    if (r.service_end_date && r.service_end_date < today) continue;
    if (r.authorization_pending) continue;
    const set = codesByClient.get(r.client_id) ?? new Set<string>();
    set.add(r.service_code.toUpperCase());
    codesByClient.set(r.client_id, set);
  }

  const docsByClient = new Map<string, ClientFileDoc[]>();
  for (const d of docRows) {
    const list = docsByClient.get(d.client_id) ?? [];
    list.push(d);
    docsByClient.set(d.client_id, list);
  }

  const belongByClient = new Map<string, string>();
  for (const b of belongRows) {
    if (!b.inventoried_on) continue;
    const on = b.inventoried_on.slice(0, 10);
    if (on < last365) continue;
    const prev = belongByClient.get(b.client_id);
    if (!prev || on > prev) belongByClient.set(b.client_id, on);
  }

  const summariesByClient = new Map<string, ClientFileSummary[]>();
  for (const s of summaryRows) {
    const list = summariesByClient.get(s.client_id) ?? [];
    list.push(s);
    summariesByClient.set(s.client_id, list);
  }

  const pbaClients = new Set(pbaRows.map((r) => r.client_id));
  const publishedStrategies = new Set(
    ssRows.filter((r) => r.status === "published" || r.status === "approved").map((r) => r.client_id),
  );

  const strategyObs = await maybe(
    () =>
      supabase
        .from("company_obligations")
        .select("id, title")
        .eq("organization_id", organizationId),
    [] as Array<{ id: string; title: string }>,
  );
  const strategyObIds = strategyObs
    .filter((o) => o.title.trim().toLowerCase().startsWith("support strategies"))
    .map((o) => o.id);
  const housemateObIds = strategyObs.filter((o) => isHousemateObligationTitle(o.title)).map((o) => o.id);

  const strategyStatuses = new Map<string, string[]>();
  const housemateByClient = new Map<string, { onFile: boolean; dueAt: string | null }>();

  const instanceObIds = [...strategyObIds, ...housemateObIds];
  if (instanceObIds.length) {
    for (const ids of chunkIds(clientIds)) {
      const inst = await maybe(
        () =>
          supabase
            .from("company_obligation_instances")
            .select("client_id, obligation_id, status, due_at, upload_path")
            .eq("organization_id", organizationId)
            .in("client_id", ids)
            .in("obligation_id", instanceObIds),
        [] as Array<{
          client_id: string | null;
          obligation_id: string;
          status: string | null;
          due_at: string | null;
          upload_path: string | null;
        }>,
      );
      for (const row of inst) {
        if (!row.client_id) continue;
        if (strategyObIds.includes(row.obligation_id)) {
          const list = strategyStatuses.get(row.client_id) ?? [];
          list.push(row.status ?? "pending");
          strategyStatuses.set(row.client_id, list);
        }
        if (housemateObIds.includes(row.obligation_id)) {
          const done =
            row.status === "completed" || row.status === "waived" || !!row.upload_path;
          const prev = housemateByClient.get(row.client_id);
          housemateByClient.set(row.client_id, {
            onFile: !!(prev?.onFile || done),
            dueAt: prev?.dueAt ?? row.due_at,
          });
        }
      }
    }
  }

  const now = new Date();
  const clients: ClientFileMatrixRow[] = [];
  const cardsByClient = new Map<string, ClientFileCard[]>();
  const pack: ClientFilePackItem[] = [];

  for (const c of scoped) {
    const codes = Array.from(codesByClient.get(c.id) ?? []).sort();
    const docs = docsByClient.get(c.id) ?? [];
    const strategyList = strategyStatuses.get(c.id) ?? [];
    let supportOk = false;
    if (!personNeedsSupportStrategies(codes)) {
      supportOk = false;
    } else if (strategyList.some((s) => s === "completed")) {
      supportOk = true;
    } else if (publishedStrategies.has(c.id)) {
      supportOk = true;
    }

    const facts: ClientFileFacts = {
      codes,
      photoPath: c.client_photo_url || c.profile_photo_url || null,
      isOwnGuardian: c.is_own_guardian === true,
      grievanceOk: !!c.grievance_acknowledged || !!c.grievance_signed_date,
      pcspExpiration: c.pcsp_expiration_date ? c.pcsp_expiration_date.slice(0, 10) : null,
      docs,
      belongingsOn: belongByClient.get(c.id) ?? null,
      supportStrategiesOk: supportOk,
      supportStrategiesDueAt: null,
      housemateOnFile: housemateByClient.get(c.id)?.onFile ?? false,
      housemateDueAt: housemateByClient.get(c.id)?.dueAt ?? null,
      summaries: summariesByClient.get(c.id) ?? [],
      hasPbaAccount: pbaClients.has(c.id),
    };

    const cards = buildClientFileCards(c.id, facts, now);
    cardsByClient.set(c.id, cards);
    const counts = tallyClientFileCards(cards);
    const missingItems = cards
      .filter((card) => card.status === "missing")
      .map((card) => ({ title: card.title, due_at: card.dueAt }));
    const name = displayName(c);
    clients.push({
      client_id: c.id,
      full_name: name,
      service_codes: codes,
      active: (c.account_status ?? "active") === "active",
      missing: counts.missing,
      due_soon: counts.due_soon,
      on_file: counts.on_file,
      missing_items: missingItems,
    });
    for (const card of cards) {
      if (card.status !== "on_file" || !card.evidencePath || !card.evidenceBucket) continue;
      pack.push({
        client_id: c.id,
        client_name: name,
        title: card.title,
        filename: card.evidenceFilename ?? "evidence",
        path: card.evidencePath,
        bucket: card.evidenceBucket,
      });
    }
  }

  clients.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { clients, cardsByClient, pack };
}

export const listOrgClientFileMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ClientFileMatrixRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const index = await loadOrgClientFileIndex(supabase, data.organizationId);
    return index.clients;
  });

export const listClientFileCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid(), clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ClientFileCard[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const index = await loadOrgClientFileIndex(supabase, data.organizationId, [data.clientId]);
    return index.cardsByClient.get(data.clientId) ?? [];
  });

export const listOrgClientFilePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        clientIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ClientFilePackItem[];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const index = await loadOrgClientFileIndex(supabase, data.organizationId, data.clientIds);
    const allowed = new Set(data.clientIds);
    return index.pack.filter((p) => allowed.has(p.client_id));
  });
