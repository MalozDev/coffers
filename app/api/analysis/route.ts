import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { analyzePeriod } from "@/lib/finance/engine";

/**
 * GET /api/analysis?period=today|yesterday|week|month&date=YYYY-MM-DD
 *
 * Thin controller (docs/ask-engine.md §2): auth → connect → Finance Engine
 * → respond. All math and insight rules live in lib/finance/. Legacy
 * period values (daily/weekly/monthly) still resolve through the engine.
 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "month";
    const date = searchParams.get("date");

    const result = await analyzePeriod(userId, period, date);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}
