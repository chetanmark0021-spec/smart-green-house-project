
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 2 * 60 * 1000;
const HISTORY_LIMIT = 150;

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("greenhouse_telemetry")
      .select(
        "temperature_c, humidity_percent, soil_moisture_percent, light_percent, battery_voltage, created_at:recorded_at"
      )
      .order("recorded_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(HISTORY_LIMIT);

    if (error) {
      console.error("Irrigation telemetry error:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Unable to read greenhouse telemetry.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const history = data || [];
    const latest = history[0] || null;

    if (!latest) {
      return NextResponse.json(
        {
          success: true,
          mode: "waiting",
          isSimulated: false,
          isStale: true,
          message: "No greenhouse sensor readings are available yet.",
          ageSeconds: null,
          telemetry: null,
          history: [],
        },
        {
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const readingTime = latest.created_at
      ? new Date(latest.created_at).getTime()
      : NaN;

    const ageMs = Number.isFinite(readingTime)
      ? Math.max(0, Date.now() - readingTime)
      : null;

    const isStale =
      ageMs === null || ageMs > STALE_AFTER_MS;

    return NextResponse.json(
      {
        success: true,
        mode: isStale ? "stale" : "live",
        isSimulated: false,
        isStale,

        message: isStale
          ? "The latest sensor reading is old. Check the ESP32 connection."
          : "Live greenhouse sensor readings received.",

        ageSeconds:
          ageMs === null
            ? null
            : Math.floor(ageMs / 1000),

        telemetry: latest,

        // Recent readings for trend analysis.
        // Newest reading comes first.
        history,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Irrigation API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unexpected irrigation API error.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
