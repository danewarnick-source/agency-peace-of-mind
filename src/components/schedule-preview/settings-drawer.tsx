import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SCHED, font, type Settings, type ViewMode, type Density, type ColorBy } from "./sched-ui";

/**
 * Schedule display settings — ports the demo's "View & display" panel.
 * Presentation only: every value maps to the existing per-device Settings
 * object (no new persistence, no schema). The demo's shift-type editor and
 * staffing toggles are intentionally omitted because they have no backing
 * data in HIVE today.
 */
export function SettingsDrawer({
  open, onOpenChange, settings, onChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
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
            options={[["shift_type", "Shift type"], ["staff", "Staff member"]]}
            onChange={(v) => onChange({ colorBy: v })}
          />

          <div style={{ marginTop: 8 }}>
            <Toggle label="Show shift times on cards" on={settings.showTimes} onClick={() => onChange({ showTimes: !settings.showTimes })} />
            <Toggle label="Show resident count per home" on={settings.showResidentCount} onClick={() => onChange({ showResidentCount: !settings.showResidentCount })} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

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

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid #f0f1f6` }}>
      <b style={{ fontWeight: 700, fontSize: 13 }}>{label}</b>
      <button
        onClick={onClick}
        aria-pressed={on}
        style={{
          flex: "none", width: 42, height: 24, borderRadius: 99, background: on ? SCHED.teal : "#d7d9e4",
          position: "relative", border: "none", cursor: "pointer", transition: "background .15s",
        }}
      >
        <span style={{ content: "''", position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

const sectH4: React.CSSProperties = { margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: SCHED.navy };
const fieldLabel: React.CSSProperties = { fontWeight: 700, fontSize: 12.5, margin: "12px 0 6px" };
