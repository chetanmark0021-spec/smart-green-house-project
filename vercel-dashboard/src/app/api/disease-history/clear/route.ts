import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isGrowthSessionValid } from "@/lib/growth-auth";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  if (!isGrowthSessionValid(request)) {
    return NextResponse.json(
      { error: "Admin sign-in is required to clear diagnosis history." },
      { status: 401 }
    );
  }
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error: "Server Supabase configuration is missing.",
        },
        { status: 500 }
      );
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get all saved diagnosis records.
    const { data: records, error: fetchError } = await admin
      .from("disease_analyses")
      .select("id, image_path");

    if (fetchError) {
      throw fetchError;
    }

    const imagePaths = (records || [])
      .map((record) => record.image_path)
      .filter((path): path is string => Boolean(path));

    // Delete database records first.
    if (records && records.length > 0) {
      const { error: deleteError } = await admin
        .from("disease_analyses")
        .delete()
        .not("id", "is", null);

      if (deleteError) {
        throw deleteError;
      }
    }

    // Delete associated images from Supabase Storage.
    for (let i = 0; i < imagePaths.length; i += 100) {
      const batch = imagePaths.slice(i, i + 100);

      const { error: storageError } = await admin.storage
        .from("disease-images")
        .remove(batch);

      if (storageError) {
        throw storageError;
      }
    }

    return NextResponse.json({
      success: true,
      deletedRecords: records?.length || 0,
      message:
        "All diagnosis history and saved leaf images were cleared.",
    });
  } catch (error) {
    console.error("Disease history deletion error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to clear diagnosis history.",
      },
      { status: 500 }
    );
  }
}
