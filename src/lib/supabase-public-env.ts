/**
 * Public Supabase URL + anon/publishable key.
 *
 * Git preview / Vercel already ship VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * into the client bundle. Server-only code that historically read SUPABASE_URL
 * must map from those VITE_ names in-process — do not require a second pair.
 */

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = trimEnv(value);
    if (trimmed) return trimmed;
  }
  return undefined;
}

function processEnv(): Record<string, string | undefined> {
  return typeof process !== "undefined" ? process.env : {};
}

/**
 * Static import.meta.env.VITE_* reads so Vite inlines them into the browser
 * bundle. Do not access these through a dynamic key — Vite will not replace it.
 */
function readViteSupabaseUrl(): string | undefined {
  try {
    return trimEnv(import.meta.env.VITE_SUPABASE_URL);
  } catch {
    return undefined;
  }
}

function readViteSupabaseAnonKey(): string | undefined {
  try {
    return firstNonEmpty([
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ]);
  } catch {
    return undefined;
  }
}

export function readSupabasePublicUrl(
  env?: Record<string, string | undefined>,
): string | undefined {
  const source = env ?? processEnv();
  return firstNonEmpty([
    env ? undefined : readViteSupabaseUrl(),
    source.VITE_SUPABASE_URL,
    source.SUPABASE_URL,
    source.NEXT_PUBLIC_SUPABASE_URL,
  ]);
}

export function readSupabasePublishableKey(
  env?: Record<string, string | undefined>,
): string | undefined {
  const source = env ?? processEnv();
  return firstNonEmpty([
    env ? undefined : readViteSupabaseAnonKey(),
    source.VITE_SUPABASE_ANON_KEY,
    source.VITE_SUPABASE_PUBLISHABLE_KEY,
    source.SUPABASE_PUBLISHABLE_KEY,
    source.SUPABASE_ANON_KEY,
    source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ]);
}

export function readSupabasePublicEnv(
  env?: Record<string, string | undefined>,
): { url: string; key: string } | null {
  const url = readSupabasePublicUrl(env);
  const key = readSupabasePublishableKey(env);
  if (!url || !key) return null;
  return { url, key };
}

export function readSupabaseServiceRoleKey(
  env?: Record<string, string | undefined>,
): string | undefined {
  return trimEnv((env ?? processEnv()).SUPABASE_SERVICE_ROLE_KEY);
}

/** Admin client needs URL (mapped from VITE_ if needed) + service role. */
export function readSupabaseAdminEnv(
  env?: Record<string, string | undefined>,
): { url: string; serviceRoleKey: string } | null {
  const url = readSupabasePublicUrl(env);
  const serviceRoleKey = readSupabaseServiceRoleKey(env);
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}
