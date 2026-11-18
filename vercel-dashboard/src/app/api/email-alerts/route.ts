import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";

async function getAlertMonitorStatus() {
  const { data, error } = await supabaseAdmin
    .from("greenhouse_telemetry")
    .select("device_id, recorded_at")
    .eq("device_id", DEVICE_ID)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      success: true,
      mode: "waiting",
      message: "Waiting for the first ESP32 reading. Supabase/Brevo alerts run when telemetry arrives.",
    };
  }

  return {
    success: true,
    mode: "supabase-brevo",
    message: `Connected to Supabase telemetry for ${data.device_id}. Email delivery is handled by the existing Supabase alert function and Brevo webhook. Latest reading: ${new Date(data.recorded_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`,
  };
}

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    return NextResponse.json(await getAlertMonitorStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Supabase/Brevo alert status error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unable to read alert status.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
