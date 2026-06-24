import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Hexagon, MapPin, Users, Contact2, ArrowRight } from "lucide-react";
import { searchOrgEntities } from "@/lib/nectar-search.functions";
import { useCurrentOrg } from "@/hooks/use-org";

export interface SearchNavItem {
  to: string;
  label: string;
}

type ResultKind = "page" | "client" | "staff" | "ask";

interface Result {
  kind: ResultKind;
  id: string;
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

interface Props {
  nav: SearchNavItem[];
  isAdminCapable: boolean;
  variant?: "desktop" | "mobile";
  /** Where to send "Ask NECTAR" requests. */
  askRoute?: "/dashboard/help" | "/dashboard/ask-nectar";
}

function fuzzyMatch(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function NectarSearchBar({
  nav,
  isAdminCapable,
  variant = "desktop",
  askRoute = "/dashboard/help",
}: Props) {
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce query for entity search.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Cmd/Ctrl+K global focus (desktop only).
  useEffect(() => {
    if (variant !== "desktop") return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const searchFn = useServerFn(searchOrgEntities);
  const entitiesQ = useQuery({
    queryKey: ["nectar-search-entities", org?.organization_id ?? null, debounced],
    queryFn: () => searchFn({ data: { organizationId: org!.organization_id, query: debounced } }),
    enabled: !!org?.organization_id && isAdminCapable && debounced.length >= 2,
    staleTime: 30_000,
  });

  const goAsk = (q: string) => {
    setOpen(false);
    setQuery("");
    navigate({ to: askRoute, search: { q } as never });
  };

  const results: Result[] = useMemo(() => {
    const q = debounced;
    const out: Result[] = [];
    if (q.length >= 1) {
      const pages = nav.filter((n) => fuzzyMatch(n.label, q)).slice(0, 5);
      for (const p of pages) {
        out.push({
          kind: "page",
          id: `page:${p.to}`,
          label: p.label,
          sublabel: p.to,
          onSelect: () => {
            setOpen(false);
            setQuery("");
            navigate({ to: p.to as never });
          },
        });
      }
    }
    if (isAdminCapable && entitiesQ.data) {
      for (const c of entitiesQ.data.clients) {
        out.push({
          kind: "client",
          id: `client:${c.id}`,
          label: c.name,
          sublabel: "Client",
          onSelect: () => {
            setOpen(false);
            setQuery("");
            navigate({ to: "/dashboard/workspace/$clientId", params: { clientId: c.id } });
          },
        });
      }
      for (const s of entitiesQ.data.staff) {
        out.push({
          kind: "staff",
          id: `staff:${s.id}`,
          label: s.name,
          sublabel: s.subtitle ? `Staff · ${s.subtitle}` : "Staff",
          onSelect: () => {
            setOpen(false);
            setQuery("");
            navigate({ to: "/dashboard/employees/$staffId", params: { staffId: s.id } });
          },
        });
      }
    }
    if (q.length >= 2) {
      out.push({
        kind: "ask",
        id: "ask",
        label: `Ask NECTAR: "${q}"`,
        sublabel: "Get an answer from NECTAR",
        onSelect: () => goAsk(q),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, nav, isAdminCapable, entitiesQ.data]);

  // Reset active when results change.
  useEffect(() => { setActive(0); }, [debounced, results.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      if (results[active]) results[active].onSelect();
      else if (q.length >= 2) goAsk(q);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const isDesktop = variant === "desktop";
  const wrapCls = isDesktop
    ? "relative hidden md:block w-full max-w-[440px]"
    : "relative w-full";

  return (
    <div ref={wrapRef} className={wrapCls}>
      <div className="relative">
        <Hexagon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#f4a93a]" fill="currentColor" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={isDesktop ? "Ask NECTAR or search… (⌘K)" : "Ask NECTAR or search…"}
          aria-label="NECTAR search"
          aria-expanded={open}
          aria-controls="nectar-search-results"
          role="combobox"
          aria-autocomplete="list"
          className={
            isDesktop
              ? "h-9 w-full rounded-md border border-white/15 bg-[#0B1126] pl-8 pr-9 text-sm text-white placeholder:text-white/55 shadow-sm focus:bg-[#0d1430] focus:outline-none focus:ring-2 focus:ring-[#f4a93a]/40"
              : "h-11 w-full rounded-md border border-white/20 bg-white/[0.08] pl-8 pr-9 text-sm text-white placeholder:text-white/60 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#f4a93a]/40"
          }
        />
        <Search className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isDesktop ? "text-white/55" : "text-white/60"}`} />
      </div>

      {open && (query.trim().length >= 1 || results.length > 0) && (
        <div
          id="nectar-search-results"
          role="listbox"
          className={
            isDesktop
              ? "absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg"
              : "absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg"
          }
        >
          {results.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {debounced.length < 2
                ? "Keep typing… results appear after 2 characters."
                : entitiesQ.isFetching
                  ? "Searching…"
                  : "No matches. Press Enter to ask NECTAR."}
            </div>
          )}
          <SectionGroup results={results} active={active} setActive={setActive} />
        </div>
      )}
    </div>
  );
}

function SectionGroup({
  results,
  active,
  setActive,
}: {
  results: Result[];
  active: number;
  setActive: (n: number) => void;
}) {
  const groups: Array<{ key: ResultKind; title: string; items: Array<{ r: Result; idx: number }> }> = [];
  const push = (key: ResultKind, title: string) => {
    const items = results
      .map((r, idx) => ({ r, idx }))
      .filter((x) => x.r.kind === key);
    if (items.length) groups.push({ key, title, items });
  };
  push("page", "Pages");
  push("client", "Clients");
  push("staff", "Staff");
  push("ask", "");

  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="py-1">
          {g.title && (
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {g.title}
            </div>
          )}
          <ul>
            {g.items.map(({ r, idx }) => {
              const isActive = idx === active;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={r.onSelect}
                    className={`flex w-full min-h-[40px] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      isActive ? "bg-[#fff7ed] text-[#0f1b3d]" : "text-[#0f1b3d] hover:bg-muted/60"
                    }`}
                    role="option"
                    aria-selected={isActive}
                  >
                    <KindIcon kind={r.kind} />
                    <span className="flex-1 truncate">{r.label}</span>
                    {r.sublabel && (
                      <span className="ml-2 truncate text-[11px] text-muted-foreground">
                        {r.sublabel}
                      </span>
                    )}
                    {r.kind === "ask" && <ArrowRight className="h-3.5 w-3.5 text-[#d97a1c]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function KindIcon({ kind }: { kind: ResultKind }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (kind === "page") return <MapPin className={`${cls} text-muted-foreground`} />;
  if (kind === "client") return <Contact2 className={`${cls} text-[#0f1b3d]`} />;
  if (kind === "staff") return <Users className={`${cls} text-[#0f1b3d]`} />;
  return <Hexagon className={`${cls} text-[#d97a1c]`} fill="currentColor" />;
}
