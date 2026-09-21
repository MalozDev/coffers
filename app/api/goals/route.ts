import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Goal } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/goals — list goals
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean();

    // Add progress calculations
    const goalsWithProgress = goals.map((goal) => {
      const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);

      // Calculate months to completion based on monthly contribution
      let monthsToComplete = 0;
      if (goal.monthlyContribution > 0 && remaining > 0) {
        monthsToComplete = Math.ceil(remaining / goal.monthlyContribution);
      }

      const projectedDate = new Date();
      projectedDate.setMonth(projectedDate.getMonth() + monthsToComplete);

      return {
        ...goal,
        progress,
        remaining,
        monthsToComplete,
        projectedDate: goal.monthlyContribution > 0 ? projectedDate.toISOString() : null,
      };
    });

    return NextResponse.json({ success: true, data: { goals: goalsWithProgress } });
  } catch (error) {
    console.error("Goals fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch goals" },
      { status: 500 }
    );
  }
}

// POST /api/goals — create a goal
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, targetAmount, targetDate, monthlyContribution } = body;

    if (!name || !targetAmount || !targetDate) {
      return NextResponse.json(
        { success: false, error: "Name, target amount, and target date are required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const goal = await Goal.create({
      userId,
      name,
      targetAmount,
      targetDate: new Date(targetDate),
      monthlyContribution: monthlyContribution || 0,
    });

    return NextResponse.json(
      { success: true, data: { goal } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Goal creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
