/**
 * TLS for the AWS dual-run Postgres pool (RDS / RDS Proxy).
 *
 * `sslmode=require` in DATABASE_URL makes node-pg set `ssl: true`, which
 * verifies against Node's Mozilla CA store. Amazon RDS uses its own roots
 * (rds-ca-rsa2048-g1 and regional CAs), so Node 20 fails with
 * "self-signed certificate in certificate chain".
 *
 * We pass an explicit `ssl` object (verify + Amazon RDS global bundle) and
 * strip libpq ssl* query params so they cannot override it.
 *
 * Keep certificate verification on. Do not unset Node's TLS rejection flag.
 */

import type { ConnectionOptions } from "node:tls";
import { RDS_GLOBAL_CA_BUNDLE } from "./rds-ca-bundle.ts";

const SSL_QUERY_KEYS = [
  "sslmode",
  "ssl",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
] as const;

export function rdsTlsOptions(): ConnectionOptions {
  return {
    rejectUnauthorized: true,
    ca: RDS_GLOBAL_CA_BUNDLE,
  };
}

export function stripSslQueryParams(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid Postgres URL");
  }
  for (const key of SSL_QUERY_KEYS) {
    parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

export function pgPoolConnectionOptions(connectionString: string): {
  connectionString: string;
  ssl: ConnectionOptions;
} {
  return {
    connectionString: stripSslQueryParams(connectionString),
    ssl: rdsTlsOptions(),
  };
}
