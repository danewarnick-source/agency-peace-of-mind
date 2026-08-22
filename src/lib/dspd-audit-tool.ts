// DSPD In-depth Review Tool for DHHS91172 (the 5-page auditor checklist).
//
// This is the information architecture reviewers actually sit down with:
// Part I Administrative, Part II Person Records, Part III Fiscal, Part IV Staff.
// Each row is YES / NO / N/A. N/A is automatic when the organization does not
// provide the service codes on the item. Items that lump several services in
// the paper tool are split here so a Host Home + SEI provider never sees RHS
// licensing or PPS foster-care rows.
//
// Existing Company Obligations are attached by exact seeded title. HIVE
// features that already produce the evidence (HRC, summaries, EVV, belongings)
// are linked rather than duplicated as a second to-do.

import { EVV_SERVICE_CODES } from "./evv-codes";
import { sowCatalogEntry, type FulfillmentChannel } from "./sow-obligation-catalog";

export type AuditPart = "I" | "II" | "III" | "IV";

export type AuditCondition = "if_pba" | "if_abi_clients";

export type AuditItem = {
  id: string;
  part: AuditPart;
  /** Number as printed on the review tool (e.g. "1", "6", "IV-2"). */
  number: string;
  prompt: string;
  citation: string;
  /** Empty = every provider. Item is N/A when the org's footprint shares none of these codes. */
  applies_to_codes: string[];
  condition?: AuditCondition;
  /** Exact company_obligations.title values that satisfy this row. */
  obligation_titles: string[];
  hive_href?: string;
  hive_label?: string;
  fulfillment: FulfillmentChannel;
  note: string;
};

export const AUDIT_PART_LABEL: Record<AuditPart, string> = {
  I: "Part I — Administrative",
  II: "Part II — Person records",
  III: "Part III — Fiscal / billing",
  IV: "Part IV — Staff requirements",
};

export const AUDIT_PART_HINT: Record<AuditPart, string> = {
  I: "Org-level processes, licenses, insurance, and committees. One packet for the whole contractor.",
  II: "What must be in each Person's file. Shown only for services this program actually delivers.",
  III: "Timesheets, EVV, and whether billed units match the service description.",
  IV: "Hire-date, annual, and service-specific staff qualifications. Per staff member.",
};

const EVV_CODES = EVV_SERVICE_CODES.filter((c) => c.evvLock).map((c) => c.code);

export const DSPD_AUDIT_ITEMS: AuditItem[] = [
  // ── PART I ──────────────────────────────────────────────────────────────
  {
    id: "I-1-DSI",
    part: "I",
    number: "1",
    prompt:
      "Current DHHS/OL Day Treatment license (4+ persons) or Day Support certification (3 or fewer) for DSI. Check OL/UCLAPP.",
    citation: "SOW Article 8.5 (DSI)",
    applies_to_codes: ["DSI"],
    obligation_titles: [
      "OL Day Treatment License — 4+ Persons",
      "OL Day Support Certification — 3 or Fewer Persons",
    ],
    fulfillment: "external",
    note: "Issued by the Office of Licensing. Upload the current license or certification in HIVE. Community-only DSI uses the Community Based Day Support certification when serving 3 or fewer.",
  },
  {
    id: "I-1-DSG",
    part: "I",
    number: "1",
    prompt:
      "Current DHHS/OL Day Treatment license or Day Support certification for DSG/DSP. Check OL/UCLAPP.",
    citation: "SOW Article 7.5 (DSG & DSP)",
    applies_to_codes: ["DSG", "DSP"],
    obligation_titles: [
      "OL Day Treatment License — 4+ Persons",
      "OL Day Support Certification — 3 or Fewer Persons",
    ],
    fulfillment: "external",
    note: "Only applies if this program provides group/partial day supports.",
  },
  {
    id: "I-1-RHS",
    part: "I",
    number: "1",
    prompt:
      "Current DHHS/OL Residential Support license (4+) or certification (3 or fewer) for each RHS site. Check OL/UCLAPP.",
    citation: "SOW Article 21.5 (RHS)",
    applies_to_codes: ["RHS"],
    obligation_titles: [
      "OL Residential Support License — 4+ Persons per Site",
      "OL Residential Support Certification — 3 or Fewer Persons per Site",
    ],
    fulfillment: "external",
    note: "Only applies if this program provides Residential Habilitation Supports.",
  },
  {
    id: "I-2-HHS",
    part: "I",
    number: "2",
    prompt:
      "Current health/safety inspections and DSPD Host Home Certification for each HHS home (initial and annual).",
    citation: "SOW Article 11.5 (HHS)",
    applies_to_codes: ["HHS"],
    obligation_titles: ["HHS Home Certification — Annual (DSPD Form)"],
    fulfillment: "hybrid",
    note: "Inspect each home with the DSPD Host Home Certification form (or a tool covering every element on that form). Upload the completed form in HIVE.",
  },
  {
    id: "I-2-PPS",
    part: "I",
    number: "2",
    prompt: "Current Child Placing / Foster Care license through DHHS/OL (UCLAPP) for PPS.",
    citation: "SOW Article 20.5 (PPS)",
    applies_to_codes: ["PPS"],
    obligation_titles: ["Child Placing / Foster Care License (DHHS/OL) — PPS"],
    fulfillment: "external",
    note: "Only applies if this program provides Professional Parent Supports.",
  },
  {
    id: "I-3",
    part: "I",
    number: "3",
    prompt:
      "A Human Rights Committee is established, meets, and documents activities and attendance.",
    citation: "SOW Article 1.21 (5)",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/hub/documentation?tab=hrc",
    hive_label: "Human Rights Committee in HIVE",
    fulfillment: "in_hive",
    note: "HIVE holds the roster, meetings, and restriction records. The auditor wants proof the committee exists, meets, and records attendance.",
  },
  {
    id: "I-4",
    part: "I",
    number: "4",
    prompt: "Emergency Management and Business Continuity Plan is current (upload if updated).",
    citation: "CST 46",
    applies_to_codes: [],
    obligation_titles: ["Emergency Management and Business Continuity Plan"],
    fulfillment: "standing",
    note: "Client Service Terms, not the SOW body. Keep the plan on file and train staff annually (see Part IV item 4).",
  },
  {
    id: "I-5",
    part: "I",
    number: "5",
    prompt:
      "Incident reporting process is in place. Reports are submitted on contract timelines (USTEPS/UPI).",
    citation: "SOW Article 1.27",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/hub/documentation?tab=incidents",
    hive_label: "Incident reports in HIVE",
    fulfillment: "hybrid",
    note: "Write and store the IR in HIVE. Timeliness is still checked in USTEPS/UPI — HIVE does not transmit the report to the state.",
  },
  {
    id: "I-6",
    part: "I",
    number: "6",
    prompt: "Process to track that Persons are in the community 20% of the time (EPR).",
    citation: "SOW Article 9.3 (EPR)",
    applies_to_codes: ["EPR"],
    obligation_titles: [],
    fulfillment: "in_hive",
    note: "Only applies if this program provides Employment Preparation.",
  },
  {
    id: "I-7",
    part: "I",
    number: "7",
    prompt:
      "Process ensuring Contractor/Staff do not accept money or let a Person make purchases from Contractor/Staff.",
    citation: "SOW Article 1.28 (9) & (10)",
    applies_to_codes: [],
    obligation_titles: [],
    fulfillment: "standing",
    note: "A written process the auditor can read. Not a recurring calendar duty.",
  },
  {
    id: "I-8",
    part: "I",
    number: "8",
    prompt: "Process for addressing staff conflict of interest.",
    citation: "CST 9 & 10",
    applies_to_codes: [],
    obligation_titles: ["Staff Conflict of Interest Process"],
    fulfillment: "standing",
    note: "Client Service Terms. Policy on file; not a per-period upload unless the policy changes.",
  },
  {
    id: "I-9",
    part: "I",
    number: "9",
    prompt: "Discharge process for when a Person leaves services.",
    citation: "SOW Article 1.22 (c)",
    applies_to_codes: [],
    obligation_titles: ["Person Discharge Process"],
    fulfillment: "standing",
    note: "Written discharge procedure. Triggered when a Person is discharged, not on a calendar.",
  },
  {
    id: "I-10",
    part: "I",
    number: "10",
    prompt: "Internal Quality Management Plan is followed and can be externally validated.",
    citation: "CST 50",
    applies_to_codes: [],
    obligation_titles: ["Internal Quality Management Plan"],
    fulfillment: "standing",
    note: "Keep the IQMP on file. The auditor asks whether it is being followed, not whether a form was uploaded this month.",
  },
  {
    id: "I-11",
    part: "I",
    number: "11",
    prompt:
      "Loans from the Contractor to a Person of $2,000 or more are disclosed to DHHS Quality Assurance, with agreement, payment plan, and current accounting.",
    citation: "SOW Article 1.28 (7)(G)",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/client-loans",
    hive_label: "Client loans in HIVE",
    fulfillment: "hybrid",
    note: "HIVE stores the loan record. Disclosure to DHHS QA is outside HIVE.",
  },
  {
    id: "I-12",
    part: "I",
    number: "12",
    prompt:
      "Current General, Professional, and Automobile liability insurance at contracted minimums (Insurance Checklist).",
    citation: "CST 29–36",
    applies_to_codes: [],
    obligation_titles: ["General, Professional, and Automobile Liability Insurance"],
    fulfillment: "standing",
    note: "Standing credential. Track expiration on the declarations page; there is no SOW anniversary date.",
  },

  // ── PART II ─────────────────────────────────────────────────────────────
  {
    id: "II-1",
    part: "II",
    number: "1",
    prompt: "Record of all medical and/or dental examinations performed.",
    citation: "SOW Article 1.23 (h)(1)",
    applies_to_codes: ["RHS", "PPS", "HHS", "SLH", "RP4", "RP5"],
    obligation_titles: [],
    hive_href: "/dashboard/hub/clients",
    hive_label: "Person records",
    fulfillment: "in_hive",
    note: "Applies to RHS, PPS, HHS, SLH, and overnight respite. Keep exam records in the Person's file.",
  },
  {
    id: "II-2",
    part: "II",
    number: "2",
    prompt:
      "If the contractor provides medication support: a record of all medications taken (paper or electronic).",
    citation: "SOW Article 1.23 (b–c)",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/emar",
    hive_label: "eMAR in HIVE",
    fulfillment: "in_hive",
    note: "N/A for a Person when this contractor does not support their medications. eMAR is the electronic record.",
  },
  {
    id: "II-3",
    part: "II",
    number: "3",
    prompt:
      "Support Strategies exist for the Person's PCSP goals. Every service maps to at least one strategy (BSP for BC; Medical Care Plan for nursing).",
    citation: "SOW Article 1.24 (5)",
    applies_to_codes: [],
    obligation_titles: ["Support Strategies — [Client Name]"],
    fulfillment: "in_hive",
    note: "Due 30 days after PCSP activation. Not required for ELS, MTP, PBA, professional medication monitoring, or respite.",
  },
  {
    id: "II-4",
    part: "II",
    number: "4",
    prompt:
      "Functional Behavior Assessment and Behavior Support Plan on file for Persons receiving BC1, BC2, or BC3.",
    citation: "SOW Articles 3–5 (BC1/BC2/BC3)",
    applies_to_codes: ["BC1", "BC2", "BC3"],
    obligation_titles: [],
    hive_href: "/dashboard/behaviorist",
    hive_label: "Behavior support in HIVE",
    fulfillment: "in_hive",
    note: "Only if this program provides Behavior Consultation.",
  },
  {
    id: "II-5",
    part: "II",
    number: "5",
    prompt:
      "Employment supports follow the Person's Competitive Integrated Employment goals in the PCSP.",
    citation: "SOW Article 30 (SEI); also 9.2 (EPR), 28.2 (SED), 29 (SEE)",
    applies_to_codes: ["SEI", "EPR", "SED", "SEE"],
    obligation_titles: [
      "SEI Employment Data — UPI Entry Attestation",
      "SEI Employment Support Strategies — UPI Entry",
      "SEI — SSI/Benefits Knowledge Attestation",
    ],
    fulfillment: "hybrid",
    note: "For SEI, employment data and support strategies are entered in UPI. HIVE tracks the attestation that UPI is current.",
  },
  {
    id: "II-6",
    part: "II",
    number: "6",
    prompt:
      "Quarterly summaries completed per contract (monthly for SEI, CMP/CMS, PN1/PN2, SJD; monthly financials for PBA). Due 15 days after the period ends.",
    citation: "SOW Article 1.25",
    applies_to_codes: [],
    obligation_titles: [
      "SEI Monthly Summary — UPI Entry Attestation",
      "CMP/CMS Monthly Summaries — Submitted to SC",
      "SJD Monthly Summary — UPI Entry Attestation",
    ],
    hive_href: "/dashboard/summaries",
    hive_label: "Summaries in HIVE",
    fulfillment: "hybrid",
    note: "Write the summary in HIVE. SEI monthly summaries must also be typed into UPI by the 15th of the following month. Quarterly summaries for HHS, SLH, SLN, and DSI go to the Support Coordinator 15 days after quarter end.",
  },
  {
    id: "II-7",
    part: "II",
    number: "7",
    prompt:
      "Signed statement that the Person (and representative, if any) received and had the grievance policy explained.",
    citation: "SOW Article 1.10 (11)",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/hub/clients",
    hive_label: "Person record (grievance acknowledgment)",
    fulfillment: "in_hive",
    note: "On file in the Person's record. Not an org-level poster — a signed acknowledgment per Person.",
  },
  {
    id: "II-8",
    part: "II",
    number: "8",
    prompt:
      "Human-rights documentation for any restriction: informed consent, assessed need, positive supports tried, less-intrusive methods, proportionate description, data review, time limits, and no-harm assurance.",
    citation: "SOW Article 1.20 & HCBS Settings Rule",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/hub/documentation?tab=hrc",
    hive_label: "HRC restriction records",
    fulfillment: "in_hive",
    note: "N/A for a Person with no rights modification. When a restriction exists, all eight elements (a–h on the tool) must be in the record.",
  },
  {
    id: "II-9",
    part: "II",
    number: "9",
    prompt:
      "Inventory of the Person's belongings, reviewed at least annually ($50+ and items of significant value).",
    citation: "SOW Article 11.3 (5) HHS; 31.3 SLH; also 20.3 PPS, 21.3 RHS",
    applies_to_codes: ["HHS", "SLH", "PPS", "RHS"],
    obligation_titles: [],
    hive_href: "/dashboard/hub/clients",
    hive_label: "Belongings inventory",
    fulfillment: "in_hive",
    note: "HIVE's belongings register is the file. Applies to HHS, SLH, PPS, and RHS — not to SLN.",
  },
  {
    id: "II-10-HHS",
    part: "II",
    number: "10",
    prompt: "Current room-and-board agreement meeting contract and HCBS Settings Rule standards.",
    citation: "SOW Article 11.3 (9) (HHS) & HCBS Settings Rule",
    applies_to_codes: ["HHS"],
    obligation_titles: [],
    hive_href: "/dashboard/hub/clients",
    hive_label: "Person documents",
    fulfillment: "in_hive",
    note: "Per HHS Person. Keep the signed agreement in the file.",
  },
  {
    id: "II-10-RHS",
    part: "II",
    number: "10",
    prompt: "Lease agreement meeting contract and HCBS Settings Rule standards.",
    citation: "SOW Article 21.3 (1) (RHS) & HCBS Settings Rule",
    applies_to_codes: ["RHS"],
    obligation_titles: [],
    fulfillment: "in_hive",
    note: "Only if this program provides RHS.",
  },
  {
    id: "II-10-PPS",
    part: "II",
    number: "10",
    prompt: "Room-and-board agreement meeting contract and HCBS Settings Rule standards.",
    citation: "SOW Article 20.3 (PPS) & HCBS Settings Rule",
    applies_to_codes: ["PPS"],
    obligation_titles: [],
    fulfillment: "in_hive",
    note: "Only if this program provides PPS.",
  },
  {
    id: "II-PBA",
    part: "II",
    number: "PBA",
    prompt:
      "PBA / representative-payee financial review: monthly records with the Person, monthly bank statements, independent monthly review, quarterly admin sample, and monthly report to the SC.",
    citation: "SOW Article 1.28 & 15.3",
    applies_to_codes: ["PBA"],
    condition: "if_pba",
    obligation_titles: [],
    fulfillment: "hybrid",
    note: "Only if this program is the PBA provider or representative payee.",
  },
  {
    id: "II-LOAN",
    part: "II",
    number: "Loans",
    prompt:
      "Emergency loans only: SC notified within 24 hours, PCPT written approval, running accounting, monthly copy to Person/guardian/SC.",
    citation: "SOW Article 1.28 (7)",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/client-loans",
    hive_label: "Client loans",
    fulfillment: "hybrid",
    note: "Review regardless of PBA status. N/A when there are no loans.",
  },

  // ── PART III ────────────────────────────────────────────────────────────
  {
    id: "III-1",
    part: "III",
    number: "1",
    prompt:
      "Accurate attendance/timesheets for every instance of service: Person, date, service code, staff, summary note; start/end time for quarter-hour codes (and DSG/DSP).",
    citation: "SOW Article 1.10 (7); CST 55 & 56",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/compliance-desk",
    hive_label: "Timesheets / compliance desk",
    fulfillment: "in_hive",
    note: "HIVE time entries are the attendance record. HHS daily notes are the written summary for host-home days.",
  },
  {
    id: "III-2",
    part: "III",
    number: "2",
    prompt:
      "Electronic Visit Verification for Companion, Homemaker, Respite (except RP4/RP5/RPS), Supported Living, and Personal Assistance.",
    citation: "SOW Article 1.12",
    applies_to_codes: EVV_CODES,
    obligation_titles: [],
    hive_href: "/dashboard/compliance-desk",
    hive_label: "EVV / geofence validation",
    fulfillment: "in_hive",
    note: "For this program that includes SLH and SLN (and CMP/CMS if awarded). HHS, DSI, and SEI are not EVV-mandated — they capture time for payroll and evidence only.",
  },
  {
    id: "III-3",
    part: "III",
    number: "3",
    prompt: "Services rendered and billed match the service-code description in Articles 3–33.",
    citation: "SOW Articles 3–33",
    applies_to_codes: [],
    obligation_titles: [],
    hive_href: "/dashboard/billing",
    hive_label: "Billing",
    fulfillment: "in_hive",
    note: "Nectar flags mismatches; a human attests before a claim goes out. HIVE does not auto-publish billing.",
  },
  {
    id: "III-HHS",
    part: "III",
    number: "HHS",
    prompt:
      "Each billed Host Home day is attendance Present with a daily note. No overnight stay = unbillable day.",
    citation: "SOW Article 11; hhs_daily_records_v",
    applies_to_codes: ["HHS"],
    obligation_titles: [],
    hive_href: "/dashboard/host-home-control",
    hive_label: "Host home control",
    fulfillment: "in_hive",
    note: "A billable HHS day is Present + daily note. HIVE scores the last 30 days from the live daily-records view — it does not invent a second to-do.",
  },

  // ── PART IV ─────────────────────────────────────────────────────────────
  {
    id: "IV-BG",
    part: "IV",
    number: "BG",
    prompt:
      "Approved background screening from the Office of Background Processing, annually, per Utah Code 26B-2-120 and R501-14.",
    citation: "SOW Article 1.9 (2); CST 72",
    applies_to_codes: [],
    obligation_titles: ["Background Screening — Annual"],
    fulfillment: "hybrid",
    note: "The screening is done through the state process. Upload the clearance in HIVE. Due on the hire anniversary unless a printed expiration is earlier.",
  },
  {
    id: "IV-COC",
    part: "IV",
    number: "CoC",
    prompt: "Staff have signed the DHHS Code of Conduct on file.",
    citation: "CST 76",
    applies_to_codes: ["SLN", "SLH", "PPS", "HHS"],
    obligation_titles: ["DHHS Code of Conduct — Signed"],
    fulfillment: "in_hive",
    note: "The paper tool limits this to SLN, SLH, PPS, and HHS. Keep the signed copy in the staff file.",
  },
  {
    id: "IV-1",
    part: "IV",
    number: "1",
    prompt: "BCBA credentials on file for BC staff; RN/LPN license for nursing codes.",
    citation: "SOW Article 1.9 (4)",
    applies_to_codes: ["BC1", "BC2", "BC3", "PN1", "PN2", "PM1", "PM2"],
    obligation_titles: ["Educational Credentials and Licenses — On File"],
    fulfillment: "standing",
    note: "Only if this program provides behavior consultation or professional nursing.",
  },
  {
    id: "IV-2",
    part: "IV",
    number: "2",
    prompt:
      "ACRE training, or USU Workplace Supports / Effective Job Coach training, before providing SEI (and EPR/SED/SEE if awarded).",
    citation: "SOW Article 30.5–30.6 (SEI); 9.5 EPR; 28.4 SED; 29.4 SEE",
    applies_to_codes: ["SEI", "EPR", "SED", "SEE"],
    obligation_titles: [
      "ACRE Training Certification — SEI",
      "ACRE Training Certification — SED",
      "Customized Employment Training (USU) — SEE/SJD",
    ],
    fulfillment: "in_hive",
    note: "SEI: at least one ACRE-certified staff, and every SEI staff supervised by an ACRE-certified staff. USU Workplace Supports / Effective Job Coach is the current required course.",
  },
  {
    id: "IV-3",
    part: "IV",
    number: "3",
    prompt: "Medicaid fraud / OIG exclusion check completed (exclusions.oig.hhs.gov).",
    citation: "SOW Article 1.9 (7)",
    applies_to_codes: [],
    obligation_titles: ["Medicaid Fraud & Abuse Exclusion Screening — Annual"],
    fulfillment: "hybrid",
    note: "Run the check outside HIVE, then upload confirmation. Annual from hire date.",
  },
  {
    id: "IV-4",
    part: "IV",
    number: "4",
    prompt:
      "Staff are trained at least annually on the Contractor's Emergency Management and Business Continuity Plan.",
    citation: "CST 46",
    applies_to_codes: [],
    obligation_titles: ["Annual Emergency Management Plan Training"],
    fulfillment: "in_hive",
    note: "Annual staff training on the plan in Part I item 4. Not the same as the 30-day orientation.",
  },
  {
    id: "IV-5",
    part: "IV",
    number: "5",
    prompt:
      "Written documentation of each staff member's successful completion of every required training area, verifiable by an external reviewer.",
    citation: "SOW Article 1.8 (3)",
    applies_to_codes: [],
    obligation_titles: ["Training Documentation File — Maintained"],
    fulfillment: "standing",
    note: "HIVE is that file. This row is standing — not a separate annual class.",
  },
  {
    id: "IV-6",
    part: "IV",
    number: "6",
    prompt:
      "30-day (or before working alone) orientation: 911, medical/mental-health call, IR, seizures, missing person, choking, PBS, rights/ADA, ANE, HIPAA, ID.RC/ABI orientation, communicable disease, person-specific training, policy, DSPD philosophy, Medicaid 101, OIG fraud reporting, HCBS Settings Rule, crisis de-escalation, trauma-informed care, suicide prevention.",
    citation: "SOW Article 1.8 (4) (A–W)",
    applies_to_codes: [],
    obligation_titles: [
      "30-Day New Hire Orientation Training",
      "Client-Specific Training — [Client Name]",
    ],
    fulfillment: "in_hive",
    note: "One-time hire requirement. Person-specific training (O) is a separate instance per staff+client assignment, due 30 days after assignment.",
  },
  {
    id: "IV-7",
    part: "IV",
    number: "7",
    prompt:
      "Within 90 days of hire: current First Aid, current CPR, and person-centered thinking and practices.",
    citation: "SOW Article 1.8 (5)",
    applies_to_codes: [],
    obligation_titles: [
      "CPR/First Aid Certification — Initial",
      "CPR/First Aid Certification — Renewal",
      "Person-Centered Thinking and Practices Training",
    ],
    fulfillment: "in_hive",
    note: "Initial CPR/First Aid is 90 days, not 30. Renewal follows the date printed on the card.",
  },
  {
    id: "IV-8",
    part: "IV",
    number: "8",
    prompt:
      "Within 180 days: SOAR, MANDT, PART, CPI, Safety Care, or other DSPD-approved intervention training if the Person is likely to engage in aggressive, self-injurious, or destructive behavior. Keep current.",
    citation: "SOW Article 1.8 (6)",
    applies_to_codes: [],
    obligation_titles: ["Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)"],
    fulfillment: "in_hive",
    note: "N/A for staff who do not serve a Person with that risk profile. When it applies, certification must stay current.",
  },
  {
    id: "IV-9",
    part: "IV",
    number: "9",
    prompt:
      "Minimum 12 hours of training each year in the second and subsequent years of employment (classroom and/or documented on-the-job skills).",
    citation: "SOW Article 1.8 (7)",
    applies_to_codes: [],
    obligation_titles: ["Annual 12-Hour Continuing Education"],
    fulfillment: "in_hive",
    note: "Hire-anniversary year, starting year two — not a calendar year.",
  },
  {
    id: "IV-10",
    part: "IV",
    number: "10",
    prompt:
      "Staff serving Persons with ABI complete ABI training before working alone (behavior effects, hospital-to-community transition, functional impact, health/medication, staff role, family perspective).",
    citation: "SOW Article 1.8 (ABI training)",
    applies_to_codes: [],
    condition: "if_abi_clients",
    obligation_titles: ["ABI Training — Before Working Alone"],
    fulfillment: "in_hive",
    note: "Only if this program serves one or more Persons with acquired brain injury. Required before working alone with those Persons.",
  },
  {
    id: "IV-USOR",
    part: "IV",
    number: "SEI-Q",
    prompt:
      "Organization is an approved USOR vendor for job coaching, and SEI staff meet ACRE / USU Workplace Supports qualifications.",
    citation: "SOW Article 30.6",
    applies_to_codes: ["SEI"],
    obligation_titles: [
      "USOR Approved Vendor — Job Coaching (SEI)",
      "ACRE Training Certification — SEI",
    ],
    fulfillment: "external",
    note: "Vendor approval is outside HIVE (proof to osrprovider@utah.gov). Existing SEI providers have until January 31, 2027.",
  },
];

export type OrgFootprint = {
  codes: string[];
  hasAbiClients: boolean;
};

/** True when we know which codes this program actually runs. Empty = fail open. */
export function footprintIsKnown(footprint: OrgFootprint): boolean {
  return footprint.codes.length > 0;
}

export function itemApplies(item: AuditItem, footprint: OrgFootprint): boolean {
  const known = footprintIsKnown(footprint);
  if (item.condition === "if_abi_clients") {
    if (footprint.hasAbiClients) return true;
    return !known;
  }
  if (item.condition === "if_pba") {
    if (footprint.codes.map((c) => c.toUpperCase()).includes("PBA")) return true;
    return !known;
  }
  if (!item.applies_to_codes.length) return true;
  if (!known) return true;
  const have = new Set(footprint.codes.map((c) => c.toUpperCase()));
  return item.applies_to_codes.some((c) => have.has(c.toUpperCase()));
}

/** Union of the seeded row's target_service_codes and the SOW catalog overlay. */
export function obligationServiceTargets(
  title: string,
  dbTargets: string[] | null | undefined,
): string[] {
  const catalog = sowCatalogEntry(title);
  const merged = [...(dbTargets ?? []), ...(catalog?.service_codes ?? [])];
  return [...new Set(merged.map((c) => c.toUpperCase()).filter(Boolean))];
}

export function obligationAppliesToFootprint(
  title: string,
  dbTargets: string[] | null | undefined,
  footprint: OrgFootprint,
): boolean {
  const targets = obligationServiceTargets(title, dbTargets);
  if (!targets.length) return true;
  if (!footprintIsKnown(footprint)) return true;
  const have = new Set(footprint.codes.map((c) => c.toUpperCase()));
  return targets.some((c) => have.has(c));
}

/** Seeded titles keep a literal "[Client Name]" placeholder. */
export function obligationTitleMatches(actual: string, template: string): boolean {
  if (actual === template) return true;
  if (template.includes("[Client Name]")) {
    const prefix = template.split("[Client Name]")[0] ?? "";
    return prefix.length > 0 && actual.startsWith(prefix);
  }
  return false;
}

export function itemsForPart(
  part: AuditPart,
  footprint: OrgFootprint,
  includeNa: boolean,
): AuditItem[] {
  return DSPD_AUDIT_ITEMS.filter((i) => i.part === part).filter(
    (i) => includeNa || itemApplies(i, footprint),
  );
}

export function naReason(item: AuditItem, footprint: OrgFootprint): string | null {
  if (itemApplies(item, footprint)) return null;
  if (item.condition === "if_abi_clients") return "No active Persons with ABI on caseload.";
  if (item.condition === "if_pba") return "This program does not provide PBA.";
  if (item.applies_to_codes.length) {
    return `Does not apply — this program does not provide ${item.applies_to_codes.join(", ")}.`;
  }
  return "Does not apply.";
}

export function itemAppliesToPerson(
  item: AuditItem,
  person: { service_codes: string[]; has_abi: boolean },
): boolean {
  return itemApplies(item, { codes: person.service_codes, hasAbiClients: person.has_abi });
}
