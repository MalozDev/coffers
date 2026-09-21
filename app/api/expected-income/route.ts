import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { ExpectedIncome, Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/expected-income
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const expected = await ExpectedIncome.find({ userId })
      .sort({ expectedDate: 1 })
      .lean();

    const totalPending = expected
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      success: true,
      data: { expected, totalPending },
    });
  } catch (error) {
    console.error("Expected income fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch expected income" },
      { status: 500 }
    );
  }
}

// POST /api/expected-income
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { source, amount, expectedDate, note } = body;

    if (!source || !amount || !expectedDate) {
      return NextResponse.json(
        { success: false, error: "Source, amount, and expected date are required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const expectedIncome = await ExpectedIncome.create({
      userId,
      source,
      amount,
      expectedDate: new Date(expectedDate),
      note,
      status: "pending",
    });

    return NextResponse.json(
      { success: true, data: { expectedIncome } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Expected income creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create expected income" },
      { status: 500 }
    );
  }
}
