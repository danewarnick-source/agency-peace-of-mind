/**
 * BEDROCK_MODEL_ID must be an on-demand inference profile, not a bare
 * foundation-model id. Anthropic on-demand in us-east-1 rejects
 * `anthropic.claude-…` with ValidationException / "on-demand throughput"
 * / "inference profile".
 *
 * This helper remaps the shapes this account has already used. It does
 * not invent a Claude id when the env is empty.
 */

const GEO_PREFIX = /^(us|eu|apac|global)\./i;
const FOUNDATION_PROVIDERS = /^(anthropic|amazon|meta|mistral|cohere|ai21)\./i;

/** Short id that already appears in Hive Bedrock logs / cancelled draft jobs. */
const HIVE_KNOWN_SHORT: Record<string, string> = {
  "claude-sonnet-4-6": "us.anthropic.claude-sonnet-4-6",
};

export function geoPrefixForRegion(region: string | undefined): string {
  const r = (region ?? "us-east-1").toLowerCase();
  if (r.startsWith("eu-")) return "eu";
  if (r.startsWith("ap-")) return "apac";
  return "us";
}

export function isInferenceProfileId(id: string): boolean {
  const t = id.trim();
  if (!t) return false;
  if (t.startsWith("arn:aws:bedrock:")) return true;
  if (GEO_PREFIX.test(t)) return true;
  if (/inference-profile/i.test(t)) return true;
  return false;
}

/**
 * Return a Converse-ready model id. Bare foundation ids get the regional
 * geo prefix (`us.anthropic.…`). Already-valid profiles and ARNs pass through.
 */
export function resolveBedrockModelId(
  raw: string | undefined | null,
  region: string | undefined = "us-east-1",
): { modelId: string; remapped: boolean } {
  const id = (raw ?? "").trim();
  if (!id) {
    throw new Error("BEDROCK_MODEL_ID is not configured.");
  }
  if (isInferenceProfileId(id)) {
    return { modelId: id, remapped: false };
  }
  const known = HIVE_KNOWN_SHORT[id.toLowerCase()];
  if (known) {
    return { modelId: known, remapped: known !== id };
  }
  if (FOUNDATION_PROVIDERS.test(id)) {
    const geo = geoPrefixForRegion(region);
    return { modelId: `${geo}.${id}`, remapped: true };
  }
  return { modelId: id, remapped: false };
}
