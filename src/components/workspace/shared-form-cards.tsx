// src/components/workspace/shared-form-cards.tsx
// Single source of truth for the form card grid used by both:
//   - FormsHubTab  (hourly workspace)
//   - PrnFormsTab  (HHS hub)

import {
  AlertOctagon,
  Stethoscope,
  Brain,
  BarChart3,
  Gem,
  Flame,
  ArrowLeftRight,
} from "lucide-react";

export type FormType =
  | "incident"
  | "medical"
  | "behavior"
  | "summary"
  | "inventory"
  | "drill"
  | "transfer";

export interface FormCardDef {
  type: FormType;
  title: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind classes for the left accent border + background tint */
  accent: string;
  /** Tailwind classes for the icon wrapper background + color */
  iconStyle: string;
}

// Critical Incident Report is always FIRST so it is the most visible in an emergency.
export const FORM_CARDS: FormCardDef[] = [
  {
    type: "incident",
    title: "Critical Incident Report",
    description: "Injury, behavior crisis, medication error, abuse, or neglect requiring admin review.",
    icon: AlertOctagon,
    accent:
      "border-l-4 border-l-rose-500 bg-rose-50/60 hover:bg-rose-50 hover:shadow-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30",
    iconStyle: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
  },
  {
    type: "medical",
    title: "Medical & Specialist Appointment Log",
    description: "Record a provider visit, physician orders, vitals, and follow-up date.",
    icon: Stethoscope,
    accent:
      "border-l-4 border-l-blue-500 bg-blue-50/60 hover:bg-blue-50 hover:shadow-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30",
    iconStyle: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    type: "behavior",
    title: "Behavior / Seizure Data Sheet",
    description: "ABC data — antecedent, behavior, consequence — plus seizure type and duration.",
    icon: Brain,
    accent:
      "border-l-4 border-l-violet-500 bg-violet-50/60 hover:bg-violet-50 hover:shadow-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-950/30",
    iconStyle: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
  },
  {
    type: "summary",
    title: "Monthly Review Summary",
    description: "Comprehensive PCSP progress narrative and community outing log.",
    icon: BarChart3,
    accent:
      "border-l-4 border-l-teal-500 bg-teal-50/60 hover:bg-teal-50 hover:shadow-teal-100 dark:bg-teal-950/20 dark:hover:bg-teal-950/30",
    iconStyle: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300",
  },
  {
    type: "inventory",
    title: "$50+ Valuables Inventory",
    description: "Register or remove high-value client belongings with estimated dollar value.",
    icon: Gem,
    accent:
      "border-l-4 border-l-amber-500 bg-amber-50/60 hover:bg-amber-50 hover:shadow-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/30",
    iconStyle: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    type: "drill",
    title: "Quarterly Evacuation Drill Record",
    description: "Document fire, earthquake, or severe weather drill with evacuation time.",
    icon: Flame,
    accent:
      "border-l-4 border-l-orange-500 bg-orange-50/60 hover:bg-orange-50 hover:shadow-orange-100 dark:bg-orange-950/20 dark:hover:bg-orange-950/30",
    iconStyle: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
  },
  {
    type: "transfer",
    title: "Cross-Agency Transfer Log",
    description: "Communication record for school, day program, or respite handoff.",
    icon: ArrowLeftRight,
    accent:
      "border-l-4 border-l-slate-400 bg-slate-50/60 hover:bg-slate-50 hover:shadow-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-950/30",
    iconStyle: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
];
