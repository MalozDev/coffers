import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { forecastForUser } from "@/lib/finance/engine";

// GET /api/intelligence/forecast — predict month-end position (engine-built)
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const result = await forecastForUser(userId);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Forecast error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate forecast" },
      { status: 500 }
    );
  }
}
