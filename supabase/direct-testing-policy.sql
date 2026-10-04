-- Temporary direct ESP32 telemetry mode
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- This permits any holder of the public project key to insert telemetry.
-- Remove this policy and use the Edge Function/device key before public use.

drop policy if exists "temporary direct ESP32 telemetry inserts" on public.greenhouse_telemetry;
create policy "temporary direct ESP32 telemetry inserts" on public.greenhouse_telemetry
  for insert to anon, authenticated with check (true);
