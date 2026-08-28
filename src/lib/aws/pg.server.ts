/**
 * Pooler-safe Postgres access for the AWS dual-run path.
 * Transaction-mode PgBouncer / RDS Proxy: no session SET, no LISTEN.
 */

import pg from "pg";
import { getDatabaseUrl } from "./env";

let _pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
    });
  }
  return _pool;
}

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPgPool().query<T>(text, params);
}

/** Reset between tests. */
export async function closePgPool(): Promise<void> {
  if (_pool) {
    await _pool.end().catch(() => {});
    _pool = null;
  }
}
