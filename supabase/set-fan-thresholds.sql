-- Run this once in Supabase SQL Editor for the existing greenhouse device.
-- It updates the saved cloud configuration that the ESP32 downloads every 15 seconds.
update public.greenhouse_devices
set
  temperature_on = 30,
  temperature_off = 29,
  updated_at = now()
where device_id = 'greenhouse-esp32-s3-01';

-- Expected behaviour:
--   temperature >= 30 C  -> fan ON
--   temperature <= 29 C  -> fan OFF
--   between 29 C and 30 C -> keep the previous fan state
