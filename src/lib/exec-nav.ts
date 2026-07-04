import {
  Building2,
  Plus,
  MapPin,
  ShieldCheck,
  UserCog,
  CreditCard,
  Activity,
  LifeBuoy,
  ArrowRightLeft,
  Mail,
  Hexagon,
  Sparkles,
  FileSignature,
  ToggleRight,
  Wrench,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import type { ExecCapability } from "@/lib/exec-capabilities";

export type ExecNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  capability: ExecCapability;
  badgeKey?: "upgrade_requests_pending";
};

export type ExecDomain = {
  id: string;
  label: string;
  items: ExecNavItem[];
};

/**
 * Command Center landing — not part of a domain, always shown at top of nav.
 */
export const COMMAND_CENTER_ITEM: ExecNavItem = {
  to: "/dashboard/hive-exec/command",
  label: "Command Center",
  icon: LayoutDashboard,
  capability: "companies.read",
};

export const EXEC_DOMAINS: ExecDomain[] = [
  {
    id: "growth",
    label: "Growth & Accounts",
    items: [
      { to: "/dashboard/hive-exec", label: "Companies", icon: Building2, exact: true, capability: "companies.read" },
      { to: "/dashboard/hive-exec/new-company", label: "Add Company", icon: Plus, capability: "companies.write" },
      { to: "/dashboard/hive-exec/company-migration", label: "Company Migration", icon: ArrowRightLeft, capability: "companies.write" },
      { to: "/dashboard/hive-exec/plans", label: "Plans & Billing", icon: CreditCard, capability: "billing.approve" },
      { to: "/dashboard/hive-exec/upgrade-requests", label: "Upgrade Requests", icon: Sparkles, capability: "upgrades.manage", badgeKey: "upgrade_requests_pending" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance & Approvals",
    items: [
      { to: "/dashboard/hive-exec/approvals", label: "Extraction Approvals", icon: ShieldCheck, capability: "extraction.approve" },
      { to: "/dashboard/hive-exec/billing-approvals", label: "Billing Approvals", icon: ShieldCheck, capability: "billing.approve" },
      { to: "/dashboard/hive-exec/agreements", label: "Agreements Matrix", icon: FileSignature, capability: "agreements.read" },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    items: [
      { to: "/dashboard/hive-exec/states", label: "States", icon: MapPin, capability: "states.edit" },
      { to: "/dashboard/hive-exec/permissions", label: "Permissions & Roles", icon: UserCog, capability: "roles.manage" },
      { to: "/dashboard/hive-exec/features", label: "Feature Registry", icon: ToggleRight, capability: "features.manage" },
    ],
  },
  {
    id: "ops",
    label: "Operations & Support",
    items: [
      { to: "/dashboard/hive-exec/health", label: "Account Health", icon: Activity, capability: "health.read" },
      { to: "/dashboard/hive-exec/tickets", label: "Support Queue", icon: LifeBuoy, capability: "support.manage" },
      { to: "/dashboard/hive-exec/functionality", label: "IT / Functionality", icon: Wrench, capability: "support.manage" },
      { to: "/dashboard/hive-exec/messages", label: "Message Center", icon: Mail, capability: "support.manage" },
      { to: "/dashboard/hive-exec/nectar", label: "NECTAR", icon: Hexagon, capability: "steve.use" },
    ],
  },
];

/**
 * Flat list — preserved for legacy consumers (badges, search).
 * Everything the old EXEC_NAV had is still here.
 */
export const EXEC_NAV: ExecNavItem[] = EXEC_DOMAINS.flatMap((d) => d.items);
