// Supabase Edge Function: email alerts after a greenhouse_telemetry INSERT.
// The function is called only by a Supabase Database Webhook using the
// project's secret API key; it never exposes the Brevo API key to a browser.
import { withSupabase } from "npm:@supabase/server@^1";

type Telemetry = {
  device_id: string;
  recorded_at: string;
  temperature_c: number | string;
  humidity_percent: number | string;
  soil_moisture_percent: number | string;
  battery_voltage: number | string;
  pump_on: boolean;
  fan_on: boolean;
  grow_light_on: boolean;
  wifi_rssi: number | string | null;
};

type DatabaseWebhook = {
  type: "INSERT";
  table: "greenhouse_telemetry";
  record: Telemetry;
};

const DRY_SOIL_PERCENT = 20;
const DRY_PUMP_WAIT_MS = 2 * 60 * 1000;
const LOW_BATTERY_VOLTAGE = 7.0; // 2S Li-ion pack, measured before converters.

const asNumber = (value: number | string | null | undefined) => Number(value ?? 0);

function batteryEstimate(voltage: number) {
  if (voltage <= 0) return "Not fitted";
  if (voltage >= 8.35) return "100%";
  if (voltage >= 8.15) return "85%";
  if (voltage >= 7.95) return "70%";
  if (voltage >= 7.75) return "50%";
  if (voltage >= 7.55) return "30%";
  if (voltage >= 7.25) return "15%";
  if (voltage >= 7.0) return "5%";
  return "0%";
}

function parseSender(value: string) {
  const match = value.match(/^\s*(?:([^<]+?)\s*)?<([^>]+)>\s*$/);
  return match ? { name: match[1]?.trim() || "Smart Greenhouse", email: match[2].trim() } :
    { name: "Smart Greenhouse", email: value.trim() };
}

function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]!));
}

function snapshotHtml(reading: Telemetry) {
  const battery = asNumber(reading.battery_voltage);
  const rows = [
    ["Device", reading.device_id],
    ["Recorded", new Date(reading.recorded_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
    ["Temperature", `${asNumber(reading.temperature_c).toFixed(1)} °C`],
    ["Humidity", `${asNumber(reading.humidity_percent).toFixed(1)} %`],
    ["Soil moisture", `${asNumber(reading.soil_moisture_percent).toFixed(0)} %`],
    ["Battery", battery > 0 ? `${battery.toFixed(2)} V (${batteryEstimate(battery)}, estimate)` : "Divider not fitted"],
    ["Water pump", reading.pump_on ? "ON" : "OFF"],
    ["Cooling fan", reading.fan_on ? "ON" : "OFF"],
    ["Grow light", reading.grow_light_on ? "ON" : "OFF"],
    ["Wi-Fi signal", reading.wifi_rssi == null ? "Unknown" : `${reading.wifi_rssi} dBm`],
  ];
  return `<table style="border-collapse:collapse">${rows.map(([key, value]) =>
    `<tr><td style="padding:6px 12px 6px 0;font-weight:600">${htmlEscape(key)}</td><td style="padding:6px 0">${htmlEscape(value)}</td></tr>`
  ).join("")}</table>`;
}

const handler = async (request: Request, ctx: { supabaseAdmin: any }) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await request.json() as DatabaseWebhook;
  if (body.type !== "INSERT" || body.table !== "greenhouse_telemetry" || !body.record?.device_id) {
    return Response.json({ ignored: true });
  }

  const reading = body.record;
  const admin = ctx.supabaseAdmin;
  const now = Date.now();
  const { data: existingState } = await admin
    .from("greenhouse_alert_state")
    .select("last_fan_on,dry_pump_started_at")
    .eq("device_id", reading.device_id)
    .maybeSingle();

  // First event establishes a baseline. It must not create a false "fan started" alert.
  const isFirstReading = !existingState;
  const state = existingState ?? { last_fan_on: reading.fan_on, dry_pump_started_at: null };
  const soil = asNumber(reading.soil_moisture_percent);
  let dryPumpStartedAt = state.dry_pump_started_at as string | null;
  const reasons: Array<{ key: string; text: string }> = [];

  if (!isFirstReading && reading.fan_on && !state.last_fan_on) {
    reasons.push({ key: "fan-started", text: "Cooling fan started because the greenhouse temperature reached the local ESP32 threshold." });
  }

  // The ESP32 irrigates in short bursts separated by a soak period. Start the
  // timer when irrigation first begins, retain it through those short OFF
  // periods, and reset only after soil recovers. This detects failed repeated
  // irrigation attempts without falsely requiring a continuously running pump.
  if (soil < DRY_SOIL_PERCENT) {
    if (reading.pump_on && !dryPumpStartedAt) dryPumpStartedAt = new Date(now).toISOString();
    if (reading.pump_on && dryPumpStartedAt && now - new Date(dryPumpStartedAt).getTime() >= DRY_PUMP_WAIT_MS) {
      reasons.push({ key: "soil-dry-after-pump", text: `Soil remains critically dry at ${soil.toFixed(0)}% after at least two minutes of local irrigation attempts. Check the tank, pump and irrigation pipe.` });
    }
  } else {
    dryPumpStartedAt = null;
  }

  const battery = asNumber(reading.battery_voltage);
  if (battery > 0 && battery <= LOW_BATTERY_VOLTAGE) {
    reasons.push({ key: "battery-low", text: `2S battery is low: ${battery.toFixed(2)} V (${batteryEstimate(battery)} estimated). Recharge the pack.` });
  }

  const { error: stateError } = await admin.from("greenhouse_alert_state").upsert({
    device_id: reading.device_id,
    last_fan_on: reading.fan_on,
    dry_pump_started_at: dryPumpStartedAt,
    updated_at: new Date(now).toISOString(),
  });
  if (stateError) throw stateError;

  const cooldownSeconds = Math.max(60, Number(Deno.env.get("ALERT_COOLDOWN_SECONDS") || 1800));
  const allowed: typeof reasons = [];
  for (const reason of reasons) {
    const { data: cooldown } = await admin.from("greenhouse_alert_cooldowns")
      .select("last_sent_at").eq("device_id", reading.device_id).eq("alert_key", reason.key).maybeSingle();
    if (!cooldown || now - new Date(cooldown.last_sent_at).getTime() >= cooldownSeconds * 1000) allowed.push(reason);
  }
  if (!allowed.length) return Response.json({ ok: true, sent: false });

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const from = Deno.env.get("ALERT_FROM_EMAIL");
  const to = (Deno.env.get("ALERT_TO_EMAIL") || "").split(",").map((email) => email.trim()).filter(Boolean);
  if (!brevoKey || !from || !to.length) throw new Error("Brevo alert secrets are incomplete");

  const subject = `Smart Greenhouse alert: ${allowed.map((reason) => reason.key.replaceAll("-", " ")).join(", ")}`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": brevoKey },
    body: JSON.stringify({
      sender: parseSender(from),
      to: to.map((email) => ({ email })),
      subject,
      htmlContent: `<h2>Smart Greenhouse Alert</h2><ul>${allowed.map((reason) => `<li>${htmlEscape(reason.text)}</li>`).join("")}</ul><h3>Live sensor snapshot</h3>${snapshotHtml(reading)}`,
    }),
  });
  if (!response.ok) throw new Error(`Brevo email failed: ${response.status} ${await response.text()}`);

  const sentAt = new Date(now).toISOString();
  const { error: cooldownError } = await admin.from("greenhouse_alert_cooldowns").upsert(
    allowed.map((reason) => ({ device_id: reading.device_id, alert_key: reason.key, last_sent_at: sentAt }))
  );
  if (cooldownError) throw cooldownError;
  return Response.json({ ok: true, sent: true, alerts: allowed.map((reason) => reason.key) });
};

export default { fetch: withSupabase({ auth: ["secret"] }, handler) };
