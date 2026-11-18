import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    // Get all saved diagnosis records.
    const { data: records, error: fetchError } = await supabaseAdmin
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
      const { error: deleteError } = await supabaseAdmin
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

      const { error: storageError } = await supabaseAdmin.storage
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
