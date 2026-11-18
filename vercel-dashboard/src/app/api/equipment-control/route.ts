import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deviceId =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";
const manualTestDurationMs = 20000;
const equipment = {
  pump: { mode: "pump_mode", value: "manual_pump" },
  fan: { mode: "fan_mode", value: "manual_fan" },
  grow_light: { mode: "grow_light_mode", value: "manual_grow_light" },
} as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return error("Invalid request origin.", 403);

  try {
    const body = await request.json();
    let update: Record<string, string | boolean | null>;
    if (body?.action === "resume-auto") {
      update = {
        pump_mode: "auto", fan_mode: "auto", grow_light_mode: "auto",
        manual_pump: false, manual_fan: false, manual_grow_light: false,
        manual_control_until: null,
      };
    } else if (
      body?.action === "test" &&
      Object.hasOwn(equipment, body.equipment) &&
      typeof body.on === "boolean"
    ) {
      const fields = equipment[body.equipment as keyof typeof equipment];
      update = {
        [fields.mode]: "manual",
        [fields.value]: body.on,
        manual_control_until: new Date(Date.now() + manualTestDurationMs).toISOString(),
      };
    } else {
      return error("Choose a valid test output and ON/OFF state.", 400);
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("greenhouse_devices")
      .update(update)
      .eq("device_id", deviceId)
      .select("device_id")
      .maybeSingle();

    if (updateError) {
      console.error("Equipment control update failed:", updateError);
      return error("Could not save the test command. Check the server Supabase service-role key and device row.", 503);
    }
    if (!data) return error("Greenhouse device row was not found in Supabase.", 404);

    return NextResponse.json({ ok: true, message: "Command saved. The ESP32 applies it on its next configuration poll; test mode expires after 20 seconds." }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    console.error("Equipment control API error:", cause);
    return error("Unable to process equipment command.", 500);
  }
}
