-- Temporary manual relay tests. Run this additive migration once in Supabase SQL Editor.
-- The ESP32 returns to local automatic mode after the timestamp expires.
alter table public.greenhouse_devices
  add column if not exists manual_control_until timestamptz;
