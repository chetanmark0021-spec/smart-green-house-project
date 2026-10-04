-- Smart Greenhouse cloud schema
-- Run this entire file in Supabase Dashboard -> SQL Editor -> New query.

create table if not exists public.greenhouse_devices (
  device_id text primary key,
  display_name text not null default 'ESP32-S3 Greenhouse',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  temperature_on numeric not null default 35,
  temperature_off numeric not null default 32,
  soil_moisture_on numeric not null default 30,
  irrigation_burst_seconds integer not null default 10,
  irrigation_soak_seconds integer not null default 30,
  fan_mode text not null default 'auto' check (fan_mode in ('auto', 'manual')),
  pump_mode text not null default 'auto' check (pump_mode in ('auto', 'manual')),
  grow_light_mode text not null default 'auto' check (grow_light_mode in ('auto', 'manual')),
  manual_fan boolean not null default false,
  manual_pump boolean not null default false,
  manual_grow_light boolean not null default false
);

create table if not exists public.greenhouse_telemetry (
  id bigint generated always as identity primary key,
  device_id text not null references public.greenhouse_devices(device_id) on delete cascade,
  recorded_at timestamptz not null default now(),
  temperature_c numeric not null check (temperature_c between -20 and 70),
  humidity_percent numeric not null check (humidity_percent between 0 and 100),
  soil_moisture_percent numeric not null check (soil_moisture_percent between 0 and 100),
  light_percent numeric not null default 0 check (light_percent between 0 and 100),
  battery_voltage numeric not null default 0 check (battery_voltage between 0 and 20),
  pump_on boolean not null default false,
  fan_on boolean not null default false,
  grow_light_on boolean not null default false,
  wifi_rssi integer
);

create index if not exists greenhouse_telemetry_device_time_idx
  on public.greenhouse_telemetry (device_id, recorded_at desc);

-- Add your actual ESP32 identifier. It must equal DEVICE_ID in the Arduino sketch.
insert into public.greenhouse_devices (device_id, display_name)
values ('greenhouse-esp32-s3-01', 'Smart Greenhouse')
on conflict (device_id) do nothing;

-- Browser dashboard can read telemetry and device configuration using only a
-- publishable key. The temporary policy below also lets the ESP32 insert by
-- direct REST while testing. Replace it with the Edge Function/device-key flow
-- before exposing the system publicly.
alter table public.greenhouse_devices enable row level security;
alter table public.greenhouse_telemetry enable row level security;

drop policy if exists "public read devices" on public.greenhouse_devices;
create policy "public read devices" on public.greenhouse_devices
  for select to anon, authenticated using (true);

drop policy if exists "public read telemetry" on public.greenhouse_telemetry;
create policy "public read telemetry" on public.greenhouse_telemetry
  for select to anon, authenticated using (true);

drop policy if exists "temporary direct ESP32 telemetry inserts" on public.greenhouse_telemetry;
create policy "temporary direct ESP32 telemetry inserts" on public.greenhouse_telemetry
  for insert to anon, authenticated with check (true);

-- Realtime POSTGRES_CHANGES requires the tables in the publication.
alter publication supabase_realtime add table public.greenhouse_telemetry;
alter publication supabase_realtime add table public.greenhouse_devices;
