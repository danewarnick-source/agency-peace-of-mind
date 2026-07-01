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
} from "lucide-react";

export type ExecNavItem = {
  to: string;
  label: string;
  icon: typeof Building2;
  exact?: boolean;
};

export const EXEC_NAV: ExecNavItem[] = [
  { to: "/dashboard/hive-exec", label: "Companies", icon: Building2, exact: true },
  { to: "/dashboard/hive-exec/new-company", label: "Add Company", icon: Plus },
  { to: "/dashboard/hive-exec/states", label: "States", icon: MapPin },
  { to: "/dashboard/hive-exec/approvals", label: "Extraction Approvals", icon: ShieldCheck },
  { to: "/dashboard/hive-exec/billing-approvals", label: "Billing Approvals", icon: ShieldCheck },
  { to: "/dashboard/hive-exec/permissions", label: "Permissions & Roles", icon: UserCog },
  { to: "/dashboard/hive-exec/plans", label: "Plans & Billing", icon: CreditCard },
  { to: "/dashboard/hive-exec/health", label: "Account Health", icon: Activity },
  { to: "/dashboard/hive-exec/tickets", label: "Support Queue", icon: LifeBuoy },
  { to: "/dashboard/hive-exec/company-migration", label: "Company Migration", icon: ArrowRightLeft },
  { to: "/dashboard/hive-exec/messages", label: "Message Center", icon: Mail },
  { to: "/dashboard/hive-exec/nectar", label: "NECTAR", icon: Hexagon },
];
