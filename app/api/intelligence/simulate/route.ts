import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { simulateForUser } from "@/lib/finance/engine";

// POST /api/intelligence/simulate — simulate a financial decision.
// The simulation itself is a pure function over a read-only snapshot of
// the user's state (docs/ask-engine.md §3.5) — it cannot touch the DB.
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, description, categoryId, period, date } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid amount is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const result = await simulateForUser(userId, {
      amount: Number(amount),
      description: typeof description === "string" ? description : undefined,
      categoryId: typeof categoryId === "string" ? categoryId : undefined,
      period: typeof period === "string" ? period : null,
      date: typeof date === "string" ? date : null,
    });

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Simulation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to run simulation" },
      { status: 500 }
    );
  }
}
