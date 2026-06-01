import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutGrid, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  getOverviewPrefs, saveOverviewPrefs, OVERVIEW_CARDS,
} from "@/components/company-overview";

type CardKey = (typeof OVERVIEW_CARDS)[number]["key"];

export function CompanyOverviewSettings() {
  const [visible, setVisible] = useState<Record<CardKey, boolean>>(
    Object.fromEntries(OVERVIEW_CARDS.map((c) => [c.key, true])) as Record<CardKey, boolean>,
  );
  const [order, setOrder] = useState<CardKey[]>(OVERVIEW_CARDS.map((c) => c.key));

  useEffect(() => {
    const p = getOverviewPrefs();
    setVisible(p.visible);
    setOrder(p.order);
  }, []);

  const move = (key: CardKey, dir: -1 | 1) => {
    setOrder((cur) => {
      const idx = cur.indexOf(key);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= cur.length) return cur;
      const out = [...cur];
      [out[idx], out[next]] = [out[next], out[idx]];
      return out;
    });
  };

  const save = () => {
    saveOverviewPrefs({ visible, order });
    toast.success("Company Overview layout saved");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Company Overview layout</h2>
          <p className="text-sm text-muted-foreground">
            Choose which cards appear on your admin landing page and the order NECTAR shows them in.
          </p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {order.map((key, i) => {
          const meta = OVERVIEW_CARDS.find((c) => c.key === key)!;
          return (
            <li key={key} className="flex items-center gap-3 p-3">
              <Checkbox
                id={`ov-${key}`}
                checked={visible[key]}
                onCheckedChange={(v) =>
                  setVisible((cur) => ({ ...cur, [key]: v === true }))
                }
              />
              <label htmlFor={`ov-${key}`} className="flex-1 min-w-0 cursor-pointer">
                <p className="text-sm font-medium">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </label>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button" size="icon" variant="ghost"
                  aria-label="Move up" disabled={i === 0}
                  onClick={() => move(key, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button" size="icon" variant="ghost"
                  aria-label="Move down" disabled={i === order.length - 1}
                  onClick={() => move(key, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <Button onClick={save}>Save layout</Button>
      </div>
    </section>
  );
}
