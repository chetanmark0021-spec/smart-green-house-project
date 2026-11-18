
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";
const SOIL_WARNING_THRESHOLD = 30;
const SOIL_CRITICAL_THRESHOLD = 20;
const MAX_READING_AGE_SECONDS = 120;

type Reading = {
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  created_at: string;
};

type NumericField =
  | "temperature_c"
  | "humidity_percent"
  | "soil_moisture_percent"
  | "light_percent";

function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numericValues(rows: Reading[], field: NumericField): number[] {
  return rows
    .map((row) => row[field])
    .filter(
      (value): value is number =>
        value !== null && Number.isFinite(Number(value))
    )
    .map(Number);
}

function trend(values: number[]): string {
  if (values.length < 4) return "insufficient data";

  const midpoint = Math.floor(values.length / 2);
  const earlier = average(values.slice(midpoint));
  const recent = average(values.slice(0, midpoint));

  if (earlier === null || recent === null) {
    return "insufficient data";
  }

  const difference = recent - earlier;

  if (Math.abs(difference) < 1) return "stable";

  return difference > 0 ? "increasing" : "decreasing";
}

// Calculate soil moisture change using timestamped readings.
// Negative slope means soil moisture is decreasing.
function calculateSoilMoistureRate(rows: Reading[]) {
  const points = rows
    .filter(
      (row) =>
        row.soil_moisture_percent !== null &&
        Number.isFinite(Number(row.soil_moisture_percent)) &&
        Number.isFinite(new Date(row.created_at).getTime())
    )
    .map((row) => ({
      time: new Date(row.created_at).getTime(),
      value: Number(row.soil_moisture_percent),
    }))
    .sort((a, b) => a.time - b.time);

  if (points.length < 5) {
    return {
      available: false,
      ratePercentPerHour: null,
      estimatedHoursUntilWarning: null,
      message: "More soil moisture history is needed.",
    };
  }

  const firstTime = points[0].time;
  const lastTime = points[points.length - 1].time;
  const durationHours = (lastTime - firstTime) / 3600000;

  if (durationHours < 5 / 60) {
    return {
      available: false,
      ratePercentPerHour: null,
      estimatedHoursUntilWarning: null,
      message:
        "Readings must cover at least five minutes for a time estimate.",
    };
  }

  const x = points.map((point) => (point.time - firstTime) / 3600000);
  const y = points.map((point) => point.value);

  const meanX = average(x)!;
  const meanY = average(y)!;

  const numerator = x.reduce(
    (sum, value, index) =>
      sum + (value - meanX) * (y[index] - meanY),
    0
  );

  const denominator = x.reduce(
    (sum, value) => sum + Math.pow(value - meanX, 2),
    0
  );

  if (denominator === 0) {
    return {
      available: false,
      ratePercentPerHour: null,
      estimatedHoursUntilWarning: null,
      message: "Soil moisture trend cannot be calculated.",
    };
  }

  const rate = numerator / denominator;
  const latestSoil = points[points.length - 1].value;

  let estimatedHoursUntilWarning: number | null = null;

  if (rate < -0.1 && latestSoil > SOIL_WARNING_THRESHOLD) {
    estimatedHoursUntilWarning =
      (latestSoil - SOIL_WARNING_THRESHOLD) / Math.abs(rate);
  }

  return {
    available: true,
    ratePercentPerHour: Number(rate.toFixed(2)),
    estimatedHoursUntilWarning:
      estimatedHoursUntilWarning === null
        ? null
        : Number(estimatedHoursUntilWarning.toFixed(2)),
    message:
      rate < -0.1
        ? "Soil moisture is decreasing."
        : rate > 0.1
          ? "Soil moisture is increasing."
          : "Soil moisture is relatively stable.",
  };
}

export async function GET() {
  try {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !serviceKey) {
      throw new Error(
        "Supabase server environment variables are missing."
      );
    }

    const endpoint = new URL(
      `${url.replace(/\/+$/, "")}/rest/v1/greenhouse_telemetry`
    );

    endpoint.searchParams.set(
      "select",
      "temperature_c,humidity_percent,soil_moisture_percent,light_percent,created_at:recorded_at"
    );

    endpoint.searchParams.set("device_id", `eq.${DEVICE_ID}`);
    endpoint.searchParams.set("order", "recorded_at.desc");
    endpoint.searchParams.set("limit", "100");

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Supabase error: ${(await response.text()).slice(0, 500)}`
      );
    }

    const rows = (await response.json()) as Reading[];

    // No real sensor records.
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        mode: "waiting",
        dataSource: "Supabase",
        message: "Waiting for actual greenhouse sensor readings.",
        count: 0,
        analytics: null,
      });
    }

    // Validate newest reading timestamp.
    const newest = new Date(rows[0].created_at).getTime();

    if (!Number.isFinite(newest)) {
      return NextResponse.json({
        success: true,
        mode: "error",
        message: "The latest greenhouse timestamp is invalid.",
        count: rows.length,
        analytics: null,
      });
    }

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - newest) / 1000)
    );

    // Do not predict using stale readings.
    if (ageSeconds > MAX_READING_AGE_SECONDS) {
      return NextResponse.json({
        success: true,
        mode: "stale",
        dataSource: "Supabase",
        message:
          "The latest greenhouse reading is older than two minutes. Predictions are paused until fresh readings arrive.",
        count: rows.length,
        ageSeconds,
        analytics: null,
      });
    }

    const temperatures = numericValues(rows, "temperature_c");
    const humidities = numericValues(rows, "humidity_percent");
    const soils = numericValues(rows, "soil_moisture_percent");
    const lights = numericValues(rows, "light_percent");

    const temperature = average(temperatures);
    const humidity = average(humidities);
    const soil = average(soils);
    const light = average(lights);

    // Latest values are used for immediate alerts.
    const latest = rows[0];

    const currentTemperature = latest.temperature_c;
    const currentHumidity = latest.humidity_percent;
    const currentSoil = latest.soil_moisture_percent;

    const recommendations: string[] = [];

    if (currentSoil !== null && currentSoil <= SOIL_CRITICAL_THRESHOLD) {
      recommendations.push(
        "Critical soil moisture: inspect the soil and check irrigation immediately."
      );
    } else if (
      currentSoil !== null &&
      currentSoil <= SOIL_WARNING_THRESHOLD
    ) {
      recommendations.push(
        "Low soil moisture: inspect the plant and soil. Consider watering if required."
      );
    }

    if (currentTemperature !== null && currentTemperature >= 35) {
      recommendations.push(
        "High temperature: inspect greenhouse ventilation and cooling."
      );
    }

    if (currentHumidity !== null && currentHumidity > 80) {
      recommendations.push(
        "High humidity: improve ventilation and monitor leaves for excess moisture."
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "No configured environmental warning thresholds are currently crossed."
      );
    }

    const sufficientHistory = rows.length >= 10;

    const soilRate = calculateSoilMoistureRate(rows);

    let irrigationRecommendation: string;
    let estimatedNeed: string;

    if (currentSoil === null) {
      irrigationRecommendation =
        "Insufficient soil moisture readings.";
      estimatedNeed = "Unknown";
    } else if (currentSoil <= SOIL_CRITICAL_THRESHOLD) {
      irrigationRecommendation =
        "Critical: inspect soil and check irrigation immediately.";
      estimatedNeed = "High attention";
    } else if (currentSoil <= SOIL_WARNING_THRESHOLD) {
      irrigationRecommendation =
        "Soil moisture is low. Check plant requirements and consider irrigation.";
      estimatedNeed = "Possible watering need";
    } else if (
      soilRate.estimatedHoursUntilWarning !== null &&
      soilRate.estimatedHoursUntilWarning > 0
    ) {
      irrigationRecommendation =
        "Soil moisture is decreasing. Continue monitoring and prepare to check irrigation.";
      estimatedNeed =
        `Estimated ${soilRate.estimatedHoursUntilWarning} hours until the 30% warning threshold, based on recent trend.`;
    } else {
      irrigationRecommendation =
        "No low-moisture warning. Continue monitoring soil and plant requirements.";
      estimatedNeed = "No immediate low-moisture warning";
    }

    const risk =
      (currentSoil !== null &&
        currentSoil <= SOIL_CRITICAL_THRESHOLD) ||
      (currentTemperature !== null && currentTemperature >= 35) ||
      (currentHumidity !== null && currentHumidity > 80)
        ? "attention"
        : currentSoil !== null &&
            currentSoil <= SOIL_WARNING_THRESHOLD
          ? "warning"
          : "no configured warning";

    return NextResponse.json({
      success: true,
      mode: "live",
      dataSource: "Actual Supabase sensor readings",
      predictionType: "Rule-based trend analysis",
      message: sufficientHistory
        ? "Analytics calculated from actual greenhouse sensor history."
        : "Live readings are available, but more history is needed for reliable trend analysis.",
      count: rows.length,
      ageSeconds,
      analytics: {
        current: {
          temperature: currentTemperature,
          humidity: currentHumidity,
          soilMoisture: currentSoil,
          light: latest.light_percent,
          timestamp: latest.created_at,
        },

        averages: {
          temperature:
            temperature === null ? null : Number(temperature.toFixed(1)),
          humidity:
            humidity === null ? null : Number(humidity.toFixed(1)),
          soilMoisture:
            soil === null ? null : Number(soil.toFixed(1)),
          light: light === null ? null : Number(light.toFixed(1)),
        },

        trends: {
          temperature: sufficientHistory
            ? trend(temperatures)
            : "insufficient data",
          humidity: sufficientHistory
            ? trend(humidities)
            : "insufficient data",
          soilMoisture: sufficientHistory
            ? trend(soils)
            : "insufficient data",
          light: sufficientHistory
            ? trend(lights)
            : "insufficient data",
        },

        soilMoisturePrediction: {
          available: soilRate.available,
          ratePercentPerHour: soilRate.ratePercentPerHour,
          warningThreshold: SOIL_WARNING_THRESHOLD,
          estimatedHoursUntilWarning:
            soilRate.estimatedHoursUntilWarning,
          message: soilRate.message,
          note:
            "This is a trend-based estimate, not a guaranteed watering time.",
        },

        irrigation: {
          recommendation: irrigationRecommendation,
          estimatedNeed,
          automaticWatering: false,
        },

        risk,
        recommendations,
        sufficientHistory,

        history: rows.slice(0, 24).reverse().map((row) => ({
          time: row.created_at,
          temperature: row.temperature_c,
          humidity: row.humidity_percent,
          soilMoisture: row.soil_moisture_percent,
        })),
      },
    });
  } catch (error) {
    console.error("Predictive analytics error:", error);

    return NextResponse.json(
      {
        success: false,
        mode: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to calculate greenhouse analytics.",
      },
      { status: 500 }
    );
  }
}
