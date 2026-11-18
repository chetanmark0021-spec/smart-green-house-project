
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createGrowthSession,
  GROWTH_COOKIE,
  isGrowthSessionValid,
  verifyAdminPin,
} from "@/lib/growth-auth";

export const runtime = "nodejs";

// Verify PIN and create an admin session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pin = String(body.pin ?? "");

    if (!verifyAdminPin(pin)) {
      return NextResponse.json(
        { error: "Incorrect admin PIN." },
        { status: 401 }
      );
    }

    const session = createGrowthSession();

    const response = NextResponse.json({
      success: true,
      message: "GreenMind admin access granted.",
    });

    response.cookies.set({
      name: GROWTH_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api",
      maxAge: session.maxAge,
    });

    return response;

  } catch (error) {
    console.error("Growth authentication error:", error);

    return NextResponse.json(
      { error: "Unable to verify admin PIN." },
      { status: 500 }
    );
  }
}

// Check whether an admin session exists
export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: isGrowthSessionValid(request),
  });
}

// End admin session
export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: "Admin session ended.",
  });

  response.cookies.set({
    name: GROWTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: 0,
  });

  return response;
}
