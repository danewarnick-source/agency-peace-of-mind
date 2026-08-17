#!/usr/bin/env bash
# Idempotent Cloud Agent install for HIVE.
# The repo's authoritative lockfile is bun.lock (package-lock.json is stale),
# and bunfig.toml carries bun-specific install policy, so dependencies are
# installed with bun. The dev/build tooling itself runs on Node via npm scripts.
set -euo pipefail

# Install bun if it is not already present (stable toolchain missing from the base image).
if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

bun --version
bun install --frozen-lockfile
