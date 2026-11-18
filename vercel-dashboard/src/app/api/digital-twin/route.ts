
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDeviceState(value: unknown): string {
  if (value === true || value === 1) return "ON";
  if (value === false || value === 0) return "OFF";

  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();

    if (["on", "true", "active", "running", "1"].includes(normalized)) {
      return "ON";
    }

    if (["off", "false", "inactive", "stopped", "0"].includes(normalized)) {
      return "OFF";
    }
  }

  return "Unknown";
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("greenhouse_telemetry")
      .select("*, created_at:recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Digital Twin Supabase error:", error);
      throw error;
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        mode: "waiting",
        message: "Waiting for greenhouse sensor readings.",
        ageSeconds: null,
        telemetry: null,
        devices: {
          pump: "Unknown",
          fan: "Unknown",
          growLight: "Unknown",
        },
      });
    }

    const createdAt = data.created_at
      ? new Date(data.created_at).getTime()
      : NaN;

    const ageSeconds = Number.isFinite(createdAt)
      ? Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
      : null;

    const mode =
      ageSeconds === null
        ? "unknown"
        : ageSeconds <= 30
          ? "live"
          : ageSeconds <= 120
            ? "delayed"
            : "stale";

    return NextResponse.json({
      success: true,
      mode,
      message:
        mode === "live"
          ? "Latest greenhouse sensor data received."
          : mode === "delayed"
            ? "Sensor data has not updated recently."
            : mode === "stale"
              ? "Sensor readings are outdated."
              : "Sensor timestamp is unavailable.",
      ageSeconds,
      telemetry: {
        temperature: data.temperature_c ?? null,
        humidity: data.humidity_percent ?? null,
        soilMoisture: data.soil_moisture_percent ?? null,
        light: data.light_percent ?? null,
        batteryVoltage: data.battery_voltage ?? null,
        deviceId: data.device_id ?? null,
        createdAt: data.created_at ?? null,
        wifiRssi: data.wifi_rssi ?? null,
      },
      devices: {
        pump: getDeviceState(data.pump),
        fan: getDeviceState(data.fan),
        growLight: getDeviceState(data.grow_light),
      },
    });
  } catch (error) {
    console.error("Digital Twin API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load greenhouse telemetry.",
      },
      { status: 500 }
    );
  }
}
