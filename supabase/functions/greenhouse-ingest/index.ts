// Supabase Edge Function: protected ESP32 telemetry ingest + config response.
// Deploy with: supabase functions deploy greenhouse-ingest --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // DEVICE_INGEST_KEY is optional for initial hardware testing. Once it is set
  // in Edge Function Secrets, every request must provide the matching header.
  const deviceIngestKey = Deno.env.get("DEVICE_INGEST_KEY");
  if (deviceIngestKey && request.headers.get("x-device-key") !== deviceIngestKey) {
    return json({ error: "Unauthorized device" }, 401);
  }

  // Supabase injects new API keys as JSON maps. Keep legacy fallbacks so this
  // function can still run during a gradual key migration.
  let secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    secretKey = secretKeys.default || secretKey;
  } catch {
    // Use the legacy fallback above if this project has not injected new keys.
  }
  if (!secretKey) return json({ error: "Supabase server secret missing" }, 500);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey);
  const url = new URL(request.url);

  if (request.method === "GET" && url.searchParams.get("action") === "config") {
    const deviceId = url.searchParams.get("deviceId");
    if (!deviceId) return json({ error: "deviceId is required" }, 400);
    const { data, error } = await supabase
      .from("greenhouse_devices")
      .select("temperature_on,temperature_off,soil_moisture_on,irrigation_burst_seconds,irrigation_soak_seconds,fan_mode,pump_mode,grow_light_mode,manual_fan,manual_pump,manual_grow_light,manual_control_until")
      .eq("device_id", deviceId)
      .single();
    if (error) return json({ error: error.message }, 404);
    return json({
      temperatureOn: data.temperature_on,
      temperatureOff: data.temperature_off,
      soilMoistureOn: data.soil_moisture_on,
      irrigationBurstSeconds: data.irrigation_burst_seconds,
      irrigationSoakSeconds: data.irrigation_soak_seconds,
      modes: { fan: data.fan_mode, pump: data.pump_mode, growLight: data.grow_light_mode },
      manual: { fan: data.manual_fan, pump: data.manual_pump, growLight: data.manual_grow_light },
      manualControlRemainingSeconds: data.manual_control_until
        ? Math.max(0, Math.ceil((Date.parse(data.manual_control_until) - Date.now()) / 1000))
        : 0,
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await request.json();
    const required = ["deviceId", "temperature", "humidity", "soilMoisture", "light"];
    const missing = required.filter((key) => input[key] === undefined);
    if (missing.length) return json({ error: `Missing fields: ${missing.join(", ")}` }, 400);
    const row = {
      device_id: String(input.deviceId),
      temperature_c: Number(input.temperature),
      humidity_percent: Number(input.humidity),
      soil_moisture_percent: Number(input.soilMoisture),
      light_percent: Number(input.light),
      battery_voltage: Number(input.batteryVoltage || 0),
      pump_on: Boolean(input.pump), fan_on: Boolean(input.fan), grow_light_on: Boolean(input.growLight),
      wifi_rssi: Number(input.wifiRssi || 0),
    };
    if (![row.temperature_c, row.humidity_percent, row.soil_moisture_percent, row.light_percent].every(Number.isFinite)) {
      return json({ error: "Sensor values must be numbers" }, 400);
    }
    const { error } = await supabase.from("greenhouse_telemetry").insert(row);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }
});
