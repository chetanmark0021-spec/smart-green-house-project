# Direct ESP32 to Supabase test mode

The current ESP32 sketch sends directly to Supabase PostgREST. It contains these two separate public settings:

```cpp
const char* SUPABASE_URL = "https://wclsupskijbczcwocmze.supabase.co";
const char* SUPABASE_PUBLISHABLE_KEY = "...";
```

The project URL identifies the Supabase project. The publishable key authorizes requests under the Row Level Security policies; it is not a secret and is the same public key used by the Vercel dashboard.

## Required one-time Supabase step

Run `supabase/direct-testing-policy.sql` in Supabase Dashboard -> SQL Editor. Without this temporary RLS policy, inserts from the ESP32 are denied.

## Expected serial output

After entering the Wi-Fi name and password and uploading `esp32/SmartGreenhouse.ino`, a successful write says:

```text
Telemetry status: 201 (stored)
```

`404` was from the former `/functions/v1/greenhouse-ingest` URL: it meant the optional Edge Function was not deployed. The direct REST firmware no longer uses that URL.

## Important

This is intentionally open test mode. The direct-insert policy allows anyone who has the project URL and publishable key to create telemetry records. Before presenting or sharing the public system, remove the direct-insert policy and return to an authenticated Edge Function with a per-device key.
