import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Database } from './types'

type SupabaseAuthContext = {
  supabase: SupabaseClient<Database>
  userId: string
  claims: User
  isSSR: boolean
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Missing Supabase environment variables.');
    }

    const request = getRequest();
    const authHeader = request?.headers?.get('authorization');

    // During SSR there is no auth header — return a safe empty context
    // instead of throwing, so SSR completes and the client re-calls with
    // proper auth after hydration.
    if (!authHeader?.startsWith('Bearer ')) {
      return next({
        context: {
          supabase: null,
          userId: null,
          claims: null,
          isSSR: true,
        },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      // TEMPORARY: log full detail — h3/nitro on the AWS Lambda target
      // sanitizes every thrown error down to a generic, detail-free
      // "Internal Server Error" downstream, so this is the only place the
      // real cause (expired token, Supabase reachability, wrong key, etc.)
      // will actually show up in CloudWatch. Remove once the real cause
      // here is found and fixed.
      console.error('[requireSupabaseAuth] getUser failed:', error, 'hasUser:', !!data?.user);
      throw new Error('Unauthorized');
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
        isSSR: false,
      },
    });
  },
);

