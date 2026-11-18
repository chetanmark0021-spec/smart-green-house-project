import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const elevatedServerKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !elevatedServerKey) {
  throw new Error(
    "A Supabase server secret is required. Set SUPABASE_SECRET_KEY to an sb_secret_... value."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  elevatedServerKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
