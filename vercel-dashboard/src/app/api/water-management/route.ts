
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
      .from("water_tank_telemetry")
      .select(
        "device_id, tank_level_percent, water_volume_liters, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Water telemetry error:", error.message);

      if (/water_tank_telemetry|does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json(
          {
            success: true,
            mode: "waiting",
            isStale: true,
            message: "The current ESP32/Supabase setup does not provide water-tank level telemetry.",
            ageSeconds: null,
            telemetry: null,
            history: [],
          },
          { headers }
        );
      }

      return NextResponse.json(
        { success: false, message: "Unable to read water telemetry." },
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
          message: "Waiting for ESP32 water tank readings.",
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
          ? "Water tank readings are outdated."
          : "Live water tank readings received.",
        ageSeconds,
        telemetry: latest,
        history,
      },
      { headers }
    );
  } catch (error) {
    console.error("Water management API error:", error);

    return NextResponse.json(
      { success: false, message: "Water management service unavailable." },
      { status: 500, headers }
    );
  }
}
