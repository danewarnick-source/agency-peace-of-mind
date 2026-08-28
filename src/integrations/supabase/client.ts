// Dual-run: default remains the generated supabase-js client. AWS intercepts
// auth / data / storage only when the matching env flags are on.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
// ws is required for Supabase realtime in Node.js < 22 (no native WebSocket)
import ws from 'ws';
import {
  isCognitoAuth,
  isS3StorageEnabled,
  resolveSupabaseClientEnv,
  shouldProxyClientData,
} from '@/lib/aws/env';
import { getRuntimeCognitoAuth } from '@/lib/aws/auth-adapter';
import { getAwsDataClient } from '@/lib/aws/db-client';
import { getS3StorageAdapter } from '@/lib/aws/s3-storage';
import { createNoopChannel, noopRemoveChannel } from '@/lib/aws/noop-realtime';
// Do not import e2e/mocks here. Local Playwright swaps this module via the
// vite plugin when VITE_E2E_HARNESS=1 — a static import would ship the stub
// into production bundles.

function getEnv() {
  return resolveSupabaseClientEnv();
}

function hasBrowserStorage(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage !== null
    );
  } catch {
    return false;
  }
}

// Persistent browser client — only instantiated when localStorage is confirmed available.
let _browserClient: ReturnType<typeof createClient<Database>> | null = null;
function getBrowserClient() {
  if (!_browserClient) {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getEnv();
    _browserClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _browserClient;
}

// Stateless server client — used during SSR or when localStorage is unavailable.
let _serverClient: ReturnType<typeof createClient<Database>> | null = null;
function getServerClient() {
  if (!_serverClient) {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getEnv();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _serverClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: ws as any },
    }) as unknown as NonNullable<typeof _serverClient>;
  }
  return _serverClient!;
}

function liveClient() {
  return hasBrowserStorage() ? getBrowserClient() : getServerClient();
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as unknown as ReturnType<typeof createClient<Database>> & object, {
  get(_, prop, receiver) {
    if (prop === 'auth' && isCognitoAuth()) {
      return getRuntimeCognitoAuth();
    }
    if ((prop === 'from' || prop === 'rpc') && shouldProxyClientData()) {
      return getAwsDataClient()[prop];
    }
    if (prop === 'storage' && isS3StorageEnabled()) {
      return getS3StorageAdapter();
    }
    if (prop === 'channel' && shouldProxyClientData()) {
      return createNoopChannel;
    }
    if (prop === 'removeChannel' && shouldProxyClientData()) {
      return noopRemoveChannel;
    }
    const client = liveClient();
    return Reflect.get(client, prop, receiver);
  },
});
