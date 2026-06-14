/**
 * Host Home Certification checklist — single source of truth for the
 * inspection form and the rendered certificate PDF. Sections mirror the
 * DSPD HHS contract requirements (settings-rule rights, home safety,
 * PCSP fit, operational items). Editing this list edits the form.
 */
export type ChecklistItem = {
  code: string;
  label: string;
};
export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export const SETTINGS_RULE_SECTION: ChecklistSection = {
  id: "settings",
  title: "Settings Rule (Rights & Quality)",
  items: [
    { code: "settings.chose_after_options", label: "Person chose this setting after being offered other residential options" },
    { code: "settings.greater_community", label: "Person has access to the greater community" },
    { code: "settings.schedule_food", label: "Person controls their own schedule, including access to food at any time" },
    { code: "settings.visitors", label: "Person controls access to visitors" },
    { code: "settings.decorate", label: "Person can decorate and personalize their own space" },
    { code: "settings.dignity", label: "Privacy, dignity, and respect are ensured" },
    { code: "settings.free_coercion", label: "Person is free from coercion and restraint" },
    { code: "settings.autonomy", label: "Setting supports the person's autonomy and independence in making life choices" },
  ],
};

export const HOME_SAFETY_SECTION: ChecklistSection = {
  id: "safety",
  title: "Home Safety",
  items: [
    { code: "safety.smoke_detectors", label: "Working smoke detectors" },
    { code: "safety.co_detectors", label: "Working carbon monoxide detectors" },
    { code: "safety.fire_extinguisher", label: "Fire extinguisher present and accessible" },
    { code: "safety.exits", label: "Clear, unobstructed exits" },
    { code: "safety.meds_secure", label: "Medications stored safely and securely" },
    { code: "safety.water_temp", label: "Safe water temperature" },
    { code: "safety.clean_repair", label: "Home is clean, sanitary, and in good repair (appliances, plumbing, electrical, heating/cooling working)" },
    { code: "safety.bathroom_access", label: "Accessible toilet and handwashing sink the person can reach without going through someone else's private room" },
    { code: "safety.utilities_food", label: "Working utilities, heating/cooling, and safe food storage" },
    { code: "safety.emergency_plan", label: "Emergency contact info and emergency plan available" },
    { code: "safety.accessibility", label: "Accessibility appropriate to the person's mobility needs" },
  ],
};

export const OPERATIONAL_SECTION: ChecklistSection = {
  id: "ops",
  title: "HHS Operational",
  items: [
    { code: "ops.drills", label: "Quarterly evacuation drills are being conducted and documented" },
    { code: "ops.inventory", label: "Belongings inventory is maintained and current" },
    { code: "ops.occupancy", label: "Occupancy is compliant (one person per home, or a documented approved exception)" },
    { code: "ops.host_age", label: "Host meets qualifications (host is 21 or older)" },
  ],
};

export const ALL_SECTIONS: ChecklistSection[] = [
  SETTINGS_RULE_SECTION,
  HOME_SAFETY_SECTION,
  OPERATIONAL_SECTION,
];

export const ALL_ITEM_CODES: string[] = ALL_SECTIONS.flatMap((s) => s.items.map((i) => i.code));

export type ChecklistStatus = "meets" | "does_not_meet" | "na";
export type ChecklistAnswer = { status: ChecklistStatus; note?: string };
export type ChecklistAnswers = Record<string, ChecklistAnswer>;

export function statusLabel(s: ChecklistStatus): string {
  return s === "meets" ? "Meets" : s === "does_not_meet" ? "Does Not Meet" : "N/A";
}
