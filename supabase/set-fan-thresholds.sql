-- Run this once in Supabase SQL Editor for the existing greenhouse device.
-- Keep the saved configuration aligned with the ESP32's local fan hysteresis.
update public.greenhouse_devices
set
  temperature_on = 29,
  temperature_off = 28,
  updated_at = now()
where device_id = 'greenhouse-esp32-s3-01';

-- Expected behaviour:
--   temperature >= 29 C  -> fan ON
--   temperature <= 28 C  -> fan OFF
--   between 28 C and 29 C -> keep the previous fan state
