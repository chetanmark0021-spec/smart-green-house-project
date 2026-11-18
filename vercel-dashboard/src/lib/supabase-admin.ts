import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const elevatedServerKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseAdminClient = ReturnType<typeof createClient>;

let client: SupabaseAdminClient | null = null;

function getSupabaseAdmin(): SupabaseAdminClient {
  if (client) return client;

  const url =
    supabaseUrl || process.env.SUPABASE_URL;
  const key =
    elevatedServerKey;

  if (!url || !key) {
    throw new Error(
      "Supabase server access is not configured. Add SUPABASE_SECRET_KEY in Vercel for server-side database operations."
    );
  }

  client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

// Defer credential validation until a route actually uses the server client.
// This lets Vercel build the app without production secrets in the build step.
export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_target, property) {
    const admin = getSupabaseAdmin();
    const value = Reflect.get(admin, property, admin);
    return typeof value === "function" ? value.bind(admin) : value;
  },
});
