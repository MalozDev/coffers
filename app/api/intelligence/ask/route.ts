import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { ask } from "@/lib/finance/engine";

// POST /api/intelligence/ask — answer a financial question.
// The route only validates and builds the snapshot; the answer router and
// every number behind it live in the Finance Engine (lib/finance/), the
// same math the analysis page renders.
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { question } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const result = await ask(userId, question);

    return NextResponse.json(
      {
        success: true,
        data: {
          question: result.data.question,
          answer: result.data.answer,
          context: result.data.context,
          timestamp: result.data.timestamp,
        },
        meta: result.meta,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Ask Coffers error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process your question" },
      { status: 500 }
    );
  }
}
