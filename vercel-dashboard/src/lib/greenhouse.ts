
export const DEFAULT_DEVICE_ID = "greenhouse-esp32-s3-01";

export type GreenhouseTelemetry = {
  id?: number;
  device_id: string;
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  pump_on: boolean | null;
  fan_on: boolean | null;
  grow_light_on: boolean | null;
  wifi_rssi: number | null;
  battery_voltage: number | null;
  created_at: string;
};

export function isDeviceOnline(
  lastSeen: string | null,
  timeoutSeconds = 30
) {
  if (!lastSeen) return false;

  const age = Math.abs(
    Date.now() - new Date(lastSeen).getTime()
  );

  return age <= timeoutSeconds * 1000;
}

export function getEnvironmentalStatus(
  data: GreenhouseTelemetry | null
) {
  if (!data) return "Waiting for sensor data";

  if (
    data.temperature_c == null ||
    data.humidity_percent == null ||
    data.soil_moisture_percent == null
  ) {
    return "Incomplete sensor data";
  }

  if (
    data.temperature_c > 35 ||
    data.soil_moisture_percent < 30 ||
    data.humidity_percent > 80
  ) {
    return "Attention required";
  }

  return "Readings within configured limits";
}
