import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Server-side client using the service-role key. Never import this in client
// components — it bypasses row-level security.
let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
