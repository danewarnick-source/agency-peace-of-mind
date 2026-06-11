import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  SCHED, font, type Settings, type ViewMode, type Density, type ColorBy, type ShiftType,
} from "./sched-ui";
import { getRuleSettings, updateRuleSettings } from "@/lib/scheduling/conflicts.functions";
import { POLICY_RULES, type PolicyRuleCode, type RuleMode } from "@/lib/scheduling/conflicts";
import { toast } from "sonner";

/**
 * Schedule display settings — drawer/sidebar.
 * Persisted per-device via the existing localStorage Settings blob.
 * The shift-types editor and staffing toggles match the v6 demo screenshot;
 * staffing toggles are advisory-only for now (no schema/EVV/billing changes).
 */
export function SettingsDrawer({
  open, onOpenChange, settings, onChange, organizationId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  organizationId?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent style={{ ...font, overflowY: "auto" }}>
        <SheetHeader>
          <SheetTitle>Schedule settings</SheetTitle>
          <SheetDescription>How the board looks by default. Saved on this device.</SheetDescription>
        </SheetHeader>

        <div style={{ marginTop: 18 }}>
          <h4 style={sectH4}>View &amp; display</h4>
          <p style={sectSub}>How the board looks by default.</p>

          <div style={fieldLabel}>Default view</div>
          <Choice<ViewMode>
            value={settings.defaultView}
            options={[["staff", "Staff only"], ["client", "Client only"], ["both", "Staff + client"]]}
            onChange={(v) => onChange({ defaultView: v })}
          />

          <div style={fieldLabel}>Opens on</div>
          <Choice<boolean>
            value={settings.startOnAllSites}
            options={[[false, "A single home"], [true, "All homes overview"]]}
            onChange={(v) => onChange({ startOnAllSites: v })}
          />

          <div style={fieldLabel}>Row density</div>
          <Choice<Density>
            value={settings.density}
            options={[["comfortable", "Comfortable"], ["compact", "Compact"]]}
            onChange={(v) => onChange({ density: v })}
          />

          <div style={fieldLabel}>Color shifts by</div>
          <Choice<ColorBy>
            value={settings.colorBy}
            options={[["shift_type", "Service code"], ["staff", "Staff member"]]}
            onChange={(v) => onChange({ colorBy: v })}
          />

          <div style={{ marginTop: 8 }}>
            <Toggle label="Show shift times on cards" on={settings.showTimes} onClick={() => onChange({ showTimes: !settings.showTimes })} />
            <Toggle label="Show resident count per home" on={settings.showResidentCount} onClick={() => onChange({ showResidentCount: !settings.showResidentCount })} />
          </div>
        </div>

        <Divider />

        <ShiftTypesSection
          shiftTypes={settings.shiftTypes}
          onChange={(shiftTypes) => onChange({ shiftTypes })}
        />

        {organizationId && (
          <>
            <Divider />
            <SchedulingRulesSection organizationId={organizationId} />
          </>
        )}

        <Divider />

        <div>
          <h4 style={sectH4}>Staffing</h4>
          <Toggle
            label="Allow multiple staff per shift & overlap"
            on={settings.allowMultipleStaff}
            onClick={() => onChange({ allowMultipleStaff: !settings.allowMultipleStaff })}
          />
          <Toggle
            label="Require matching certification"
            sub="Warn (never block) when a staffer lacks a needed cert."
            on={settings.requireMatchingCert}
            onClick={() => onChange({ requireMatchingCert: !settings.requireMatchingCert })}
          />
          <Toggle
            label="Overtime warning"
            on={settings.overtimeWarning}
            onClick={() => onChange({ overtimeWarning: !settings.overtimeWarning })}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────── Shift types editor ─────────────────────── */

function ShiftTypesSection({
  shiftTypes, onChange,
}: { shiftTypes: ShiftType[]; onChange: (t: ShiftType[]) => void }) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("06:00");
  const [newEnd, setNewEnd] = useState("14:00");
  const [newColor, setNewColor] = useState("#137182");

  const update = (key: string, patch: Partial<ShiftType>) =>
    onChange(shiftTypes.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const remove = (key: string) => {
    onChange(shiftTypes.filter((t) => t.key !== key));
    setEditingKey(null);
  };
  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "type";
    let key = base;
    let n = 2;
    while (shiftTypes.some((t) => t.key === key)) key = `${base}-${n++}`;
    onChange([...shiftTypes, { key, label: name, start: newStart, end: newEnd, color: newColor }]);
    setNewName("");
  };

  return (
    <div>
      <h4 style={sectH4}>Your shift types</h4>
      <p style={sectSub}>
        Fully customizable — rename, change the times, recolor, or add your own. These are what
        you pick from when adding a shift.
      </p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {shiftTypes.map((t) => {
          const isEditing = editingKey === t.key;
          return (
            <div key={t.key} style={{ borderTop: `1px solid ${SCHED.line}`, padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.color, flex: "none" }} />
                <b style={{ flex: 1, fontSize: 13, fontWeight: 700, color: SCHED.ink }}>{t.label}</b>
                <span style={{ fontSize: 12, color: SCHED.muted }}>{prettyRange(t.start, t.end)}</span>
                <button
                  onClick={() => setEditingKey(isEditing ? null : t.key)}
                  style={editBtn}
                >
                  {isEditing ? "Done" : "Edit"}
                </button>
              </div>
              {isEditing && (
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 72px 72px 44px auto", gap: 6, alignItems: "center" }}>
                  <input
                    value={t.label}
                    onChange={(e) => update(t.key, { label: e.target.value })}
                    style={input}
                    aria-label="Shift name"
                  />
                  <input
                    type="time"
                    value={t.start}
                    onChange={(e) => update(t.key, { start: e.target.value })}
                    style={input}
                    aria-label="Start time"
                  />
                  <input
                    type="time"
                    value={t.end}
                    onChange={(e) => update(t.key, { end: e.target.value })}
                    style={input}
                    aria-label="End time"
                  />
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => update(t.key, { color: e.target.value })}
                    style={{ ...input, padding: 2, height: 32 }}
                    aria-label="Color"
                  />
                  <button onClick={() => remove(t.key)} style={{ ...editBtn, color: SCHED.gap, borderColor: SCHED.gap }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 72px 72px 44px", gap: 6 }}>
        <input
          placeholder="New shift name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={input}
        />
        <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} style={input} />
        <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} style={input} />
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ ...input, padding: 2, height: 32 }} />
      </div>
      <button onClick={addNew} style={addBtn}>+ Add shift type</button>
    </div>
  );
}

/* ─────────────────────── Bits ─────────────────────── */

function Choice<T extends string | boolean>({
  value, options, onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 6 }}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            style={{
              border: `1px solid ${on ? "#cfe4e8" : SCHED.line}`, background: on ? SCHED.tealBg : "#fff",
              color: on ? "#0c5562" : SCHED.ink, borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ label, sub, on, onClick }: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid #f0f1f6` }}>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 700, fontSize: 13, color: SCHED.ink }}>{label}</b>
        {sub && <div style={{ marginTop: 2, fontSize: 12, color: SCHED.muted }}>{sub}</div>}
      </div>
      <button
        onClick={onClick}
        aria-pressed={on}
        style={{
          flex: "none", width: 42, height: 24, borderRadius: 99, background: on ? SCHED.teal : "#d7d9e4",
          position: "relative", border: "none", cursor: "pointer", transition: "background .15s",
        }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: SCHED.line, margin: "20px 0" }} />;
}

function prettyRange(start: string, end: string) {
  return `${prettyTime(start)}–${prettyTime(end)}`;
}
function prettyTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "p" : "a";
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${ampm}` : `${hh}${ampm}`;
}

const sectH4: React.CSSProperties = { margin: "0 0 4px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: SCHED.navy };
const sectSub: React.CSSProperties = { margin: "0 0 12px", fontSize: 12.5, color: SCHED.muted };
const fieldLabel: React.CSSProperties = { fontWeight: 700, fontSize: 12.5, margin: "12px 0 6px", color: SCHED.ink };
const input: React.CSSProperties = {
  border: `1px solid ${SCHED.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 12.5,
  fontFamily: "inherit", color: SCHED.ink, background: "#fff", width: "100%", minWidth: 0,
};
const editBtn: React.CSSProperties = {
  border: `1px solid ${SCHED.line}`, background: "#fff", color: SCHED.ink, borderRadius: 8,
  padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const addBtn: React.CSSProperties = {
  marginTop: 10, width: "100%", border: `1px dashed ${SCHED.teal}`, background: "transparent",
  color: SCHED.teal, borderRadius: 9, padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
