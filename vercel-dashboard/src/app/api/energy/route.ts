
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("energy_telemetry")
      .select(
        "device_id, voltage_v, current_a, power_w, energy_wh, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Energy telemetry error:", error.message);

      if (/energy_telemetry|does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json(
          {
            success: true,
            mode: "waiting",
            isStale: true,
            message: "The current ESP32/Supabase setup does not provide energy telemetry (voltage/current/power readings).",
            ageSeconds: null,
            telemetry: null,
            history: [],
          },
          { headers }
        );
      }

      return NextResponse.json(
        { success: false, message: "Unable to read energy telemetry." },
        { status: 500, headers }
      );
    }

    const history = data ?? [];
    const latest = history[0] ?? null;

    if (!latest) {
      return NextResponse.json(
        {
          success: true,
          mode: "waiting",
          isStale: true,
          message: "Waiting for ESP32 energy readings.",
          ageSeconds: null,
          telemetry: null,
          history: [],
        },
        { headers }
      );
    }

    const ageSeconds = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(latest.created_at).getTime()) / 1000
      )
    );

    const isStale = ageSeconds > 120;

    return NextResponse.json(
      {
        success: true,
        mode: isStale ? "stale" : "live",
        isStale,
        message: isStale
          ? "Energy readings are outdated."
          : "Live energy readings received.",
        ageSeconds,
        telemetry: latest,
        history,
      },
      { headers }
    );
  } catch (error) {
    console.error("Energy API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Energy monitoring service unavailable.",
      },
      { status: 500, headers }
    );
  }
}
