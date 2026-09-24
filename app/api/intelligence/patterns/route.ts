import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { patternsForUser } from "@/lib/finance/engine";

// GET /api/intelligence/patterns — detect spending patterns (engine-built)
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period");
    const date = searchParams.get("date");

    const result = await patternsForUser(userId, period, date);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Pattern detection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to detect patterns" },
      { status: 500 }
    );
  }
}
