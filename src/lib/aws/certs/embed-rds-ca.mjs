/**
 * Refresh src/lib/aws/rds-ca-bundle.ts from rds-global-bundle.pem.
 * Source PEM: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const pem = readFileSync(join(dir, "rds-global-bundle.pem"), "utf8");
if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
  throw new Error("rds-global-bundle.pem is missing PEM certificates");
}

const out = `/**
 * Amazon RDS global CA bundle (rds-ca-rsa2048-g1 and regional roots).
 * Source: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
 * Refresh: curl that URL into this folder's rds-global-bundle.pem, then
 * \`node src/lib/aws/certs/embed-rds-ca.mjs\`. Inlined so the Nitro
 * node-server image does not need the .pem next to index.mjs.
 */
export const RDS_GLOBAL_CA_BUNDLE = ${JSON.stringify(pem)};
`;

writeFileSync(join(dir, "../rds-ca-bundle.ts"), out);
console.log("wrote src/lib/aws/rds-ca-bundle.ts");
