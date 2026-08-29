#!/usr/bin/env node
/**
 * Prove `npm run build:lambda` produced Nitro's official Lambda layout.
 * Usage: node scripts/verify-lambda-output.mjs
 * Never prints env values.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serverDir = join(root, ".output/server");
const publicDir = join(root, ".output/public");
const indexMjs = join(serverDir, "index.mjs");

function fail(message) {
  console.error(`[verify-lambda-output] ${message}`);
  process.exit(1);
}

if (!existsSync(indexMjs)) {
  fail(`missing ${indexMjs} — run npm run build:lambda`);
}

const indexSrc = readFileSync(indexMjs, "utf8");
const hasHandler =
  /\bexport\s*\{[^}]*\bhandler\b/.test(indexSrc) ||
  /\bexport\s+(async\s+)?function\s+handler\b/.test(indexSrc) ||
  /\bexport\s+const\s+handler\b/.test(indexSrc) ||
  /\bexports\.handler\s*=/.test(indexSrc);

if (!hasHandler) {
  fail(`${indexMjs} does not export handler (Lambda needs index.handler)`);
}

if (!existsSync(publicDir) || !statSync(publicDir).isDirectory()) {
  fail(`missing ${publicDir} — static assets must land in .output/public for S3`);
}

const publicEntries = readdirSync(publicDir);
if (publicEntries.length === 0) {
  fail(`${publicDir} is empty`);
}

const hasAssets =
  publicEntries.includes("assets") ||
  publicEntries.some((name) => name.endsWith(".js") || name.endsWith(".css") || name.endsWith(".html"));

if (!hasAssets) {
  fail(`${publicDir} has no assets/ or hashed static files`);
}

console.log(
  `[verify-lambda-output] ok handler=index.handler server=${serverDir} public=${publicDir} publicEntries=${publicEntries.length}`,
);
