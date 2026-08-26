import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (typeof window !== "undefined") {
    const win = window as unknown as { __supabaseClient?: SupabaseClient };
    if (win.__supabaseClient) {
      return win.__supabaseClient;
    }
  }

  if (client) {
    return client;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!url || !anonKey) {
    return null;
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  if (typeof window !== "undefined") {
    (window as unknown as { __supabaseClient?: SupabaseClient }).__supabaseClient = client;
  }

  return client;
}
