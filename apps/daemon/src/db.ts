/**
 * Supabase service-role client for daemon writes. Bypasses RLS.
 * Daemon is the only process that holds the service-role key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let _sb: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (_sb) return _sb;
  _sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}
