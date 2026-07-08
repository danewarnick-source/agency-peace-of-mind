// Unified "client document report" registry.
//
// Every client-facing PDF report (Client Budget, Meal Plan Weekly Menu,
// Meal Plan vs. Actual, Chore Chart) registers here so callers — the
// manager UI buttons AND the NECTAR/assistant path — can generate or ship
// any of them through one common surface.
//
// This is only a registry: PDF rendering + data fetching live in each
// report module (`client-budget-report`, `meal-plan-menu-report`,
// `meal-plan-vs-actual-report`, `chore-chart-report`). Nothing is
// re-implemented here.
//
// No fabrication anywhere in the chain: missing data renders "—" in the
// PDF, never invented values.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateBudgetReport,
  shipBudgetReport,
  type BudgetReportArgs,
  type BudgetReportResult,
  type ShippedBudgetReport,
} from "./client-budget-report";
import {
  generateMealMenuReport,
  shipMealMenuReport,
  type MealMenuReportArgs,
  type MealMenuReportResult,
  type ShippedMealMenuReport,
} from "./meal-plan-menu-report";
import {
  generatePlanVsActualReport,
  shipPlanVsActualReport,
  mondayOf,
  type GenerateArgs as PlanVsActualArgs,
  type GenerateResult as PlanVsActualResult,
  type ShipResult as ShippedPlanVsActual,
} from "./meal-plan-vs-actual-report";
import {
  generateChoreChartReport,
  shipChoreChartReport,
  type ChoreChartReportArgs,
  type ChoreChartReportResult,
  type ShippedChoreChartReport,
} from "./chore-chart-report";
import {
  generateEmployeeFaceSheet,
  shipEmployeeFaceSheet,
  type EmployeeFaceSheetArgs,
  type EmployeeFaceSheetResult,
  type ShippedEmployeeFaceSheet,
} from "./employee-face-sheet";

// ── Report type keys ────────────────────────────────────────────────────────

export type ReportType =
  | "client_budget"
  | "meal_plan_menu"
  | "meal_plan_vs_actual"
  | "chore_chart"
  | "employee_face_sheet";

export const REPORT_TYPES: ReadonlyArray<ReportType> = [
  "client_budget",
  "meal_plan_menu",
  "meal_plan_vs_actual",
  "chore_chart",
  "employee_face_sheet",
];

/** Params accepted by any report. Consumers pass a superset; each report
 *  only reads what it needs. */
export type ReportParams = {
  clientId?: string;
  spaceId?: string;
  /** Employee/staff id for employee-scoped reports (e.g. Employee Face Sheet). */
  staffId?: string;
  /** "YYYY-MM" or "YYYY-MM-DD" for budget. */
  periodMonth?: string;
  /** Any date within the target week for meal reports. */
  weekStart?: string | Date;
  /** Number of consecutive weeks for plan-vs-actual (1..12). */
  weeksCount?: number;
  supabaseClient?: SupabaseClient;
};

// ── Normalized outputs ──────────────────────────────────────────────────────

/** Common shape every generator returns, regardless of the underlying
 *  report. UI + NECTAR consume this without caring which type ran. */
export interface CommonReportOutput {
  reportType: ReportType;
  bytes: Uint8Array;
  filename: string;
  /** Human-readable label for the covered period, e.g. "July 2026",
   *  "Jul 6 – Jul 12, 2026", "2026-07-07". */
  periodLabel: string;
  organizationId: string;
  orgName: string;
  /** Populated for client-scoped reports; empty for chore chart until ship. */
  clientId: string | null;
  clientName: string | null;
  /** Chore-chart reports carry the space identity here. */
  spaceId: string | null;
  spaceName: string | null;
  /** Employee-scoped reports (Employee Face Sheet) carry the staff identity here. */
  staffId?: string | null;
  staffName?: string | null;
  /** Client IDs the report is / would be attached to on ship.
   *  - client_budget / meal_plan_menu / meal_plan_vs_actual: [clientId]
   *  - chore_chart: linked space clients
   *  - employee_face_sheet: [] (ships to employee_documents, not client files) */
  attachClientIds: string[];
  /** Underlying generator payload, for callers that need the specifics. */
  raw:
    | BudgetReportResult
    | MealMenuReportResult
    | PlanVsActualResult
    | ChoreChartReportResult
    | EmployeeFaceSheetResult;
}

export interface CommonShipOutput extends CommonReportOutput {
  /** One entry per client file the snapshot was attached to.
   *  Employee-scoped ships surface via `employeeSnapshot` instead. */
  snapshots: Array<{
    clientId: string;
    documentId: string;
    storagePath: string;
  }>;
  /** Populated when the shipped report was employee-scoped
   *  (employee_documents row, not client_documents). */
  employeeSnapshot?: {
    staffId: string;
    documentId: string;
    storagePath: string;
  };
}

// ── Metadata (for UI + NECTAR discovery) ────────────────────────────────────

export interface ReportTypeMeta {
  key: ReportType;
  label: string;
  scope: "client" | "space" | "staff";
  requiredParams: Array<"clientId" | "spaceId" | "staffId" | "periodMonth" | "weekStart">;
  optionalParams: Array<"weeksCount">;
  /** For client-scoped reports this matches `client_documents.document_type`.
   *  For employee-scoped reports it matches `employee_documents.kind`. */
  documentType: string;
  description: string;
}

export const REPORT_META: Record<ReportType, ReportTypeMeta> = {
  client_budget: {
    key: "client_budget",
    label: "Client Budget",
    scope: "client",
    requiredParams: ["clientId", "periodMonth"],
    optionalParams: [],
    documentType: "financial_support_budget",
    description: "Monthly income & spending plan for a client.",
  },
  meal_plan_menu: {
    key: "meal_plan_menu",
    label: "Meal Plan — Weekly Menu",
    scope: "client",
    requiredParams: ["clientId", "weekStart"],
    optionalParams: [],
    documentType: "meal_plan_menu",
    description:
      "Weekly meal plan grid with shopping list, nutrition, and preferences.",
  },
  meal_plan_vs_actual: {
    key: "meal_plan_vs_actual",
    label: "Meal Plan — Plan vs. Actual",
    scope: "client",
    requiredParams: ["clientId", "weekStart"],
    optionalParams: ["weeksCount"],
    documentType: "meal_plan_plan_vs_actual",
    description:
      "Per-day per-slot planned meal vs. staff-recorded actual for audits.",
  },
  chore_chart: {
    key: "chore_chart",
    label: "Chore Chart",
    scope: "space",
    requiredParams: ["spaceId"],
    optionalParams: [],
    documentType: "chore_chart",
    description:
      "Living-space chore chart (client rotation + staff shift grid).",
  },
  employee_face_sheet: {
    key: "employee_face_sheet",
    label: "Employee Face Sheet",
    scope: "staff",
    requiredParams: ["staffId"],
    optionalParams: [],
    documentType: "face_sheet",
    description:
      "One-page aggregated employee record: identity, contact, employment, certifications & trainings, deadlines, and HR docs on file.",
  },
};

// ── Param validation ────────────────────────────────────────────────────────

function requireField<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required param: ${name}`);
  }
  return v;
}

function coerceWeekStart(v: string | Date): Date {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid weekStart");
  return d;
}

// ── Unified generate ────────────────────────────────────────────────────────

export async function generateClientReport(
  reportType: ReportType,
  params: ReportParams,
): Promise<CommonReportOutput> {
  switch (reportType) {
    case "client_budget": {
      const args: BudgetReportArgs = {
        clientId: requireField(params.clientId, "clientId"),
        periodMonth: requireField(params.periodMonth, "periodMonth"),
        supabaseClient: params.supabaseClient,
      };
      const r = await generateBudgetReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.periodLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: r.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [r.clientId],
        raw: r,
      };
    }
    case "meal_plan_menu": {
      const args: MealMenuReportArgs = {
        clientId: requireField(params.clientId, "clientId"),
        weekStart: coerceWeekStart(requireField(params.weekStart, "weekStart")),
        supabaseClient: params.supabaseClient,
      };
      const r = await generateMealMenuReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.weekLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: r.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [r.clientId],
        raw: r,
      };
    }
    case "meal_plan_vs_actual": {
      const args: PlanVsActualArgs = {
        clientId: requireField(params.clientId, "clientId"),
        weekStart: mondayOf(
          coerceWeekStart(requireField(params.weekStart, "weekStart")),
        ),
        weeksCount: params.weeksCount,
        supabaseClient: params.supabaseClient,
      };
      const r = await generatePlanVsActualReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.rangeLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: args.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [args.clientId],
        raw: r,
      };
    }
    case "chore_chart": {
      const args: ChoreChartReportArgs = {
        spaceId: requireField(params.spaceId, "spaceId"),
        supabaseClient: params.supabaseClient,
      };
      const r = await generateChoreChartReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.dateLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: null,
        clientName: null,
        spaceId: r.spaceId,
        spaceName: r.spaceName,
        attachClientIds: r.clientIds,
        raw: r,
      };
    }
    case "employee_face_sheet": {
      const args: EmployeeFaceSheetArgs = {
        staffId: requireField(params.staffId, "staffId"),
        supabaseClient: params.supabaseClient,
      };
      const r = await generateEmployeeFaceSheet(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.periodLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: null,
        clientName: null,
        spaceId: null,
        spaceName: null,
        staffId: r.staffId,
        staffName: r.staffName,
        attachClientIds: [],
        raw: r,
      };
    }
  }
}

// ── Unified ship ────────────────────────────────────────────────────────────

export async function shipClientReport(
  reportType: ReportType,
  params: ReportParams,
): Promise<CommonShipOutput> {
  switch (reportType) {
    case "client_budget": {
      const args: BudgetReportArgs = {
        clientId: requireField(params.clientId, "clientId"),
        periodMonth: requireField(params.periodMonth, "periodMonth"),
        supabaseClient: params.supabaseClient,
      };
      const r: ShippedBudgetReport = await shipBudgetReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.periodLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: r.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [r.clientId],
        raw: r,
        snapshots: [
          { clientId: r.clientId, documentId: r.documentId, storagePath: r.storagePath },
        ],
      };
    }
    case "meal_plan_menu": {
      const args: MealMenuReportArgs = {
        clientId: requireField(params.clientId, "clientId"),
        weekStart: coerceWeekStart(requireField(params.weekStart, "weekStart")),
        supabaseClient: params.supabaseClient,
      };
      const r: ShippedMealMenuReport = await shipMealMenuReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.weekLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: r.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [r.clientId],
        raw: r,
        snapshots: [
          { clientId: r.clientId, documentId: r.documentId, storagePath: r.storagePath },
        ],
      };
    }
    case "meal_plan_vs_actual": {
      const args: PlanVsActualArgs = {
        clientId: requireField(params.clientId, "clientId"),
        weekStart: mondayOf(
          coerceWeekStart(requireField(params.weekStart, "weekStart")),
        ),
        weeksCount: params.weeksCount,
        supabaseClient: params.supabaseClient,
      };
      const r: ShippedPlanVsActual = await shipPlanVsActualReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.rangeLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: args.clientId,
        clientName: r.clientName,
        spaceId: null,
        spaceName: null,
        attachClientIds: [args.clientId],
        raw: r,
        snapshots: [
          { clientId: args.clientId, documentId: r.documentId, storagePath: r.storagePath },
        ],
      };
    }
    case "chore_chart": {
      const args: ChoreChartReportArgs = {
        spaceId: requireField(params.spaceId, "spaceId"),
        supabaseClient: params.supabaseClient,
      };
      const r: ShippedChoreChartReport = await shipChoreChartReport(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.dateLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: null,
        clientName: null,
        spaceId: r.spaceId,
        spaceName: r.spaceName,
        attachClientIds: r.clientIds,
        raw: r,
        snapshots: r.snapshots,
      };
    }
    case "employee_face_sheet": {
      const args: EmployeeFaceSheetArgs = {
        staffId: requireField(params.staffId, "staffId"),
        supabaseClient: params.supabaseClient,
      };
      const r: ShippedEmployeeFaceSheet = await shipEmployeeFaceSheet(args);
      return {
        reportType,
        bytes: r.bytes,
        filename: r.filename,
        periodLabel: r.periodLabel,
        organizationId: r.organizationId,
        orgName: r.orgName,
        clientId: null,
        clientName: null,
        spaceId: null,
        spaceName: null,
        staffId: r.staffId,
        staffName: r.staffName,
        attachClientIds: [],
        raw: r,
        // Employee face sheets ship into employee_documents, not client_documents.
        snapshots: [],
        employeeSnapshot: {
          staffId: r.staffId,
          documentId: r.documentId,
          storagePath: r.storagePath,
        },
      };
    }
  }
}
