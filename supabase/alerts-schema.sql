-- Smart Greenhouse alert state
-- Run this once in Supabase Dashboard -> SQL Editor -> New query.
-- This table is internal: no browser or ESP32 access is granted.

create table if not exists public.greenhouse_alert_state (
  device_id text primary key references public.greenhouse_devices(device_id) on delete cascade,
  last_fan_on boolean not null default false,
  dry_pump_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.greenhouse_alert_cooldowns (
  device_id text not null references public.greenhouse_devices(device_id) on delete cascade,
  alert_key text not null,
  last_sent_at timestamptz not null default now(),
  primary key (device_id, alert_key)
);

alter table public.greenhouse_alert_state enable row level security;
alter table public.greenhouse_alert_cooldowns enable row level security;
