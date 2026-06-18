// Static guidance registry for NECTAR focus banners. Each entry maps a
// focus key (passed via ?focus=… from the admin home) to a short,
// human-written playbook. NECTAR is advisory — this content is curated,
// never fabricated by the model.

export interface FocusContent {
  /** Eyebrow chip — what brought the operator here */
  eyebrow: string;
  /** Headline addressed to the operator */
  title: string;
  /** One-sentence "why this matters" */
  why: string;
  /** 2–4 concrete steps to resolve */
  steps: string[];
}

export const NECTAR_FOCUS_CONTENT: Record<string, FocusContent> = {
  // ── KPI strip ─────────────────────────────────────────────────────────────
  "audit-readiness": {
    eyebrow: "NECTAR · Audit readiness",
    title: "Let's tighten up audit readiness.",
    why: "Audit readiness reflects daily notes, medication logs, and attendance — auditors pull the same three.",
    steps: [
      "Open the Readiness check below and run a fresh self-audit.",
      "For each red row, jump to the client's record and resolve the gap (missing note, missing MAR signature, attendance mismatch).",
      "Re-run the check until the score is green before the next DSPD pull.",
    ],
  },
  "evv-out-of-bounds": {
    eyebrow: "NECTAR · EVV match",
    title: "Out-of-geofence punches need a reason.",
    why: "EVV-mandated codes (SLH, SLN, COM, PAC, HSQ, etc.) must transmit a clean geofence match or a documented reason.",
    steps: [
      "Filter the queue to status = out-of-geofence.",
      "For each shift, add the resolving reason (off-site activity, geofence mis-set, etc.) — the entry will pass UEVV after that.",
      "If you see the same staff/home repeatedly, fix the home's geofence in Locations rather than reasoning each shift.",
    ],
  },
  "doc-gaps": {
    eyebrow: "NECTAR · Documentation",
    title: "Close out today's documentation gaps.",
    why: "Daily logs and eMAR signatures are the evidence layer behind every claim — gaps cost money and stall audits.",
    steps: [
      "Sort the Records tab by oldest gap first.",
      "For returned logs, open the staff note, fix what was flagged, and resubmit.",
      "For unsigned MAR rows, route the addendum to the staff who passed the med.",
    ],
  },
  "creds-expiring": {
    eyebrow: "NECTAR · Credentials",
    title: "Renew certifications before they lapse.",
    why: "An expired First Aid/CPR/Med-Admin cert pulls a staff member off any shift that requires it, mid-rotation.",
    steps: [
      "Filter to expiring within 30 days.",
      "For each row, send the renewal nudge or upload the new certificate.",
      "If renewal isn't possible, mark the staff as off-rotation for any code that requires the cert.",
    ],
  },
  "compliance-overview": {
    eyebrow: "NECTAR · Overall compliance",
    title: "Here's how the overall score is built.",
    why: "Overall compliance blends client-side (daily logs, MAR, attendance) and employee-side (EVV, credentials).",
    steps: [
      "Find your lowest sub-score in the panel below.",
      "Click into it — each sub-score links to the exact failing records.",
      "Resolve those first; the overall score recomputes as you close gaps.",
    ],
  },

  // ── Needs you today ───────────────────────────────────────────────────────
  "unaccepted-shifts": {
    eyebrow: "NECTAR · Scheduler",
    title: "Get those published shifts accepted.",
    why: "An unaccepted shift is not yet a commitment — clients can be left uncovered if it's left sitting.",
    steps: [
      "Open each pending shift and send the staff a nudge from the shift card.",
      "If they can't take it, reassign from the same staff list — no need to re-publish.",
      "Anything still unaccepted within 24 hours of start should be reassigned or cancelled.",
    ],
  },
  "expiring-30": {
    eyebrow: "NECTAR · Credentials",
    title: "30-day cert window — act now.",
    why: "DSPD considers a cert lapsed the day it expires. The 30-day window is your safety margin.",
    steps: [
      "Sort by soonest expiry first.",
      "For each row, queue the renewal training or upload the new certificate.",
      "Confirm in the staff profile that the new expiry date saved correctly.",
    ],
  },
  "incidents-pending-review": {
    eyebrow: "NECTAR · Incidents",
    title: "Close out pending incident reports.",
    why: "Open incidents block billing for affected shifts and must be reviewed within the DSPD reporting window.",
    steps: [
      "Open each pending report and confirm the staff's narrative against any witnesses.",
      "If an SC follow-up is required, send the SC request from the report.",
      "Mark the report reviewed once the SC has been notified or the action plan is documented.",
    ],
  },
  "daily-logs-returned": {
    eyebrow: "NECTAR · Daily logs",
    title: "Returned logs need a fix and resubmit.",
    why: "A returned log is unbillable evidence until staff repair it — and the clock keeps ticking on the billing cycle.",
    steps: [
      "Open each returned log and read the admin denial reason at the top.",
      "Coach the staff member (or edit on their behalf with attestation) so the fix matches the reason.",
      "Resubmit — the log will re-enter the standard approval queue.",
    ],
  },
  "unsigned-notes": {
    eyebrow: "NECTAR · Records",
    title: "Sign or chase the last 7 days of notes.",
    why: "An unsigned note is not legally documentation. Auditors treat unsigned = missing.",
    steps: [
      "Filter the Records tab to unsigned, last 7 days.",
      "Sign on the spot anything you authored.",
      "Bulk-nudge the staff who owe signatures; follow up directly on anything older than 72h.",
    ],
  },

  // ── Setup & backlog ───────────────────────────────────────────────────────
  "req-review": {
    eyebrow: "NECTAR · Requirements",
    title: "Review the requirements I pulled from your sources.",
    why: "I extract requirements from your SOW/contracts but never act on them until you've approved each one.",
    steps: [
      "Open each pending requirement and confirm the language matches the source.",
      "Approve, edit, or archive — approved requirements start driving alerts immediately.",
      "If a requirement is wrong, edit the source document and re-extract rather than approving a stale rule.",
    ],
  },
  "mapping-gaps": {
    eyebrow: "NECTAR · Engine mappings",
    title: "Map flagged requirements to engine fields.",
    why: "A requirement without a field mapping is text — it can't trigger checks until you tell me which data point it watches.",
    steps: [
      "Open each flagged mapping and pick the engine field it should evaluate against.",
      "If no field fits, mark it as manual-review-only so it surfaces in the audit checklist.",
      "Save — the requirement starts firing automated checks immediately.",
    ],
  },

  // ── Billing snapshot ──────────────────────────────────────────────────────
  "claims-ready": {
    eyebrow: "NECTAR · Claims",
    title: "Scrub claims before you submit.",
    why: "Every dollar that hits a denial costs you double — once in time, once in rework.",
    steps: [
      "Run the pre-submit scrub from the billing dashboard.",
      "Resolve any unit-math or authorization warnings — these are deterministic denials.",
      "Submit the cleaned batch; I'll archive the response with the claim batch.",
    ],
  },
  "payroll-review": {
    eyebrow: "NECTAR · Payroll",
    title: "Review timesheets before payroll closes.",
    why: "Once payroll closes, edits become an after-the-fact paper trail. Catch issues in this window.",
    steps: [
      "Filter to the current pay period.",
      "Resolve any open shifts (clocked-in, no clock-out) before they bleed into payroll.",
      "Confirm exception time (out-of-geofence, no-note) has either a reason or a deduction.",
    ],
  },
};

export function getFocusContent(focus: string | undefined | null): FocusContent | null {
  if (!focus) return null;
  return NECTAR_FOCUS_CONTENT[focus] ?? null;
}
