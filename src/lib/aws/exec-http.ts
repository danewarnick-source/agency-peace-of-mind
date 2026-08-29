/**
 * /api/aws/db must never return HTTP 5xx. Nitro/h3 swallows those as
 * unhandled HTTPError and the browser supabase shim never settles — Dane's
 * Loading… overlay then waits forever. Logical errors stay in the JSON body.
 */
export function httpStatusForAwsDbResult(status: number): number {
  if (status === 401) return 401;
  return 200;
}

export function awsDbUnhandledBody(message: string) {
  return {
    data: null,
    error: { message },
    count: null,
    status: 500,
    statusText: "Error",
  };
}

export const AWS_DB_ERROR_EVENT = "hive:aws-db-error";

export type AwsDbErrorDetail = { message: string; status: number };

export function isAwsDbLogical5xx(result: {
  status?: number | null;
  error?: { message?: string } | null;
  unhandled?: boolean;
}): boolean {
  const status = result.status ?? 0;
  if (status >= 500) return true;
  if (result.unhandled) return true;
  const msg = String(result.error?.message ?? "");
  return /httperror|internal server error/i.test(msg);
}
