
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isGrowthSessionValid } from "@/lib/growth-auth";

export const runtime = "nodejs";

const growthStages = [
  "Seedling",
  "Vegetative",
  "Flowering",
  "Fruiting",
  "Harvesting",
];

const careTypes = [
  "Watering",
  "Fertilizer",
  "Pesticide",
  "Pruning",
  "Maintenance",
  "Other",
];

// ==========================================
// COMMON VALIDATION FUNCTIONS
// ==========================================

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function validText(value: unknown, max = 100): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max
  );
}

function optionalNumber(
  value: unknown,
  min: number,
  max: number
): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    return undefined;
  }

  return number;
}

// Validate YYYY-MM-DD and reject impossible dates.
function isValidDateOnly(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// Validate ISO date-time supplied by the care form.
function isValidDateTime(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value)
  ) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

// ==========================================
// PUBLIC API: READ PLANTS AND GROWTH HISTORY
// No PIN required for viewing.
// ==========================================

export async function GET() {
  try {
    const { data: plants, error: plantsError } =
      await supabaseAdmin
        .from("plants")
        .select(
          "id, plant_name, plant_type, planting_date, created_at"
        )
        .order("created_at", { ascending: false });

    if (plantsError) {
      console.error("Plants query error:", plantsError);
      return errorResponse("Unable to load plants.", 500);
    }

    const plantIds = (plants ?? []).map((plant) => plant.id);

    if (plantIds.length === 0) {
      return NextResponse.json(
        {
          plants: [],
          growthLogs: [],
          careLogs: [],
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const [
      { data: growthLogs, error: growthError },
      { data: careLogs, error: careError },
    ] = await Promise.all([
      supabaseAdmin
        .from("plant_growth_logs")
        .select(
          "id, plant_id, measured_on, height_cm, leaf_count, growth_stage, health_score"
        )
        .in("plant_id", plantIds)
        .order("measured_on", { ascending: false }),

      supabaseAdmin
        .from("plant_care_logs")
        .select(
          "id, plant_id, care_type, amount, unit, performed_at"
        )
        .in("plant_id", plantIds)
        .order("performed_at", { ascending: false }),
    ]);

    if (growthError || careError) {
      console.error("History query error:", {
        growthError,
        careError,
      });

      return errorResponse("Unable to load plant history.", 500);
    }

    return NextResponse.json(
      {
        plants: plants ?? [],
        growthLogs: growthLogs ?? [],
        careLogs: careLogs ?? [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Public growth API error:", error);
    return errorResponse("Unable to load dashboard.", 500);
  }
}

// ==========================================
// PROTECTED API: ADD PLANTS AND RECORDS
// Admin PIN session required.
// ==========================================

export async function POST(request: NextRequest) {
  // Require valid Admin PIN session.
  if (!isGrowthSessionValid(request)) {
    return errorResponse("Admin PIN required.", 401);
  }

  // Check request origin.
  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    return errorResponse("Invalid request origin.", 403);
  }

  try {
    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return errorResponse("Invalid request data.");
    }

    // ======================================
    // ACTION 1: ADD A NEW PLANT
    // ======================================

    if (body.action === "add-plant") {
      const {
        plant_name,
        plant_type,
        location,
        planting_date,
      } = body;

      if (!validText(plant_name, 100)) {
        return errorResponse("Enter a valid plant name.");
      }

      if (!validText(plant_type, 100)) {
        return errorResponse("Enter a valid plant type.");
      }

      // Location is optional.
      const plantLocation =
        typeof location === "string" ? location.trim() : "";

      if (plantLocation.length > 150) {
        return errorResponse("Plant location is too long.");
      }

      if (
        planting_date !== null &&
        planting_date !== undefined &&
        planting_date !== "" &&
        !isValidDateOnly(planting_date)
      ) {
        return errorResponse("Invalid planting date.");
      }

      const { data, error } = await supabaseAdmin
        .from("plants")
        .insert({
          plant_name: plant_name.trim(),
          plant_type: plant_type.trim(),
          location: plantLocation,
          planting_date: planting_date || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Add plant error:", error);
        return errorResponse("Unable to add plant.", 500);
      }

      return NextResponse.json({
        success: true,
        message: "Plant added successfully.",
        plant: data,
      });
    }

    // ======================================
    // ACTION 2: ADD GROWTH RECORD
    // ======================================

    if (body.action === "add-growth") {
      const plantId = Number(body.plant_id);

      if (!Number.isSafeInteger(plantId) || plantId <= 0) {
        return errorResponse("Select a valid plant.");
      }

      // Validate measurement date.
      if (!isValidDateOnly(body.measured_on)) {
        return errorResponse("Invalid measurement date.");
      }

      const height = optionalNumber(
        body.height_cm,
        0,
        100000
      );

      const leaves = optionalNumber(
        body.leaf_count,
        0,
        1000000
      );

      const health = optionalNumber(
        body.health_score,
        0,
        100
      );

      if (height === undefined || height === null) {
        return errorResponse("Invalid plant height.");
      }

      if (
        leaves === undefined ||
        leaves === null ||
        !Number.isInteger(leaves)
      ) {
        return errorResponse(
          "Leaf count must be a whole number."
        );
      }

      if (health === undefined || health === null) {
        return errorResponse(
          "Health score must be between 0 and 100."
        );
      }

      const stage = body.growth_stage || null;

      if (
        stage !== null &&
        (
          typeof stage !== "string" ||
          !growthStages.includes(stage)
        )
      ) {
        return errorResponse("Invalid growth stage.");
      }

      const notes = body.notes ?? "";

      if (
        typeof notes !== "string" ||
        notes.length > 1000
      ) {
        return errorResponse("Invalid notes.");
      }

      // Verify that the plant exists.
      const { data: plant, error: plantError } =
        await supabaseAdmin
          .from("plants")
          .select("id")
          .eq("id", plantId)
          .maybeSingle();

      if (plantError || !plant) {
        return errorResponse("Plant not found.", 404);
      }

      // Save the measurement date along with the record.
      const { data, error } = await supabaseAdmin
        .from("plant_growth_logs")
        .insert({
          plant_id: plantId,
          measured_on: body.measured_on,
          height_cm: height,
          leaf_count: leaves,
          health_score: health,
          growth_stage: stage,
          notes: notes.trim(),
        })
        .select()
        .single();

      if (error) {
        console.error("Growth insert error:", error);

        return errorResponse(
          "Unable to save growth record.",
          500
        );
      }

      return NextResponse.json({
        success: true,
        message: "Growth record saved.",
        record: data,
      });
    }

    // ======================================
    // ACTION 3: ADD PLANT CARE RECORD
    // ======================================

    if (body.action === "add-care") {
      const plantId = Number(body.plant_id);

      if (!Number.isSafeInteger(plantId) || plantId <= 0) {
        return errorResponse("Select a valid plant.");
      }

      if (
        typeof body.care_type !== "string" ||
        !careTypes.includes(body.care_type)
      ) {
        return errorResponse("Invalid care type.");
      }

      // Validate the care date.
      if (!isValidDateTime(body.performed_at)) {
        return errorResponse("Invalid care date.");
      }

      const amount = optionalNumber(
        body.amount,
        0,
        1000000
      );

      if (amount === undefined) {
        return errorResponse("Invalid care amount.");
      }

      const unit = body.unit ?? "";
      const notes = body.notes ?? "";

      if (
        typeof unit !== "string" ||
        unit.length > 30 ||
        typeof notes !== "string" ||
        notes.length > 1000
      ) {
        return errorResponse("Invalid care details.");
      }

      // Verify that the plant exists.
      const { data: plant, error: plantError } =
        await supabaseAdmin
          .from("plants")
          .select("id")
          .eq("id", plantId)
          .maybeSingle();

      if (plantError || !plant) {
        return errorResponse("Plant not found.", 404);
      }

      // Save the selected care date.
      const { data, error } = await supabaseAdmin
        .from("plant_care_logs")
        .insert({
          plant_id: plantId,
          care_type: body.care_type,
          amount,
          unit: unit.trim(),
          notes: notes.trim(),
          performed_at: body.performed_at,
        })
        .select()
        .single();

      if (error) {
        console.error("Care insert error:", error);

        return errorResponse(
          "Unable to save care record.",
          500
        );
      }

      return NextResponse.json({
        success: true,
        message: "Care record saved.",
        record: data,
      });
    }

    // Unknown action.
    return errorResponse("Unknown action.");
  } catch (error) {
    console.error("Growth POST error:", error);

    return errorResponse(
      "Unable to save tracker data.",
      500
    );
  }
}
