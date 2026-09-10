/**
 * Employee Smart Import is retired. Deep links must land on the
 * Employees roster template upload — never the shared Nectar review flow.
 */

export const EMPLOYEE_SMART_IMPORT_REDIRECT = {
  to: "/dashboard/employees",
  search: { upload: true },
  replace: true,
} as const;

export function shouldBlockEmployeeSmartImport(mode: string | null | undefined): boolean {
  return mode === "employee";
}

export function employeeSmartImportRedirect() {
  return EMPLOYEE_SMART_IMPORT_REDIRECT;
}
