import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    // TEMPORARY diagnostic try/catch: h3/nitro on the AWS Lambda target has
    // been sanitizing every thrown error down to a generic, detail-free
    // "Internal Server Error" before it reaches server.ts's own error
    // logging — confirmed even with a dev-mode build. Logging here,
    // synchronously and unconditionally, guarantees the real error/stack
    // reaches CloudWatch regardless of what the framework does downstream.
    // Remove this wrapper once the real cause is found and fixed.
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error('Missing Supabase environment variables.');
      }

      const request = getRequest();
      const authHeader = request?.headers?.get('authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
      }

      const token = authHeader.replace('Bearer ', '');

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        throw new Error('Unauthorized');
      }

      return next({
        context: {
          supabase,
          userId: data.user.id,
          claims: data.user,
        },
      });
    } catch (err) {
      console.error('[requireSupabaseAuth] real error:', err);
      throw err;
    }
  },
);

