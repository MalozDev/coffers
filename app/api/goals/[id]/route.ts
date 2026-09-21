import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Goal } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// PATCH /api/goals/[id] — update goal (name, amounts, contribute)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    await connectToDatabase();

    // Handle contribution (add to current amount)
    if (body.contribution) {
      const goal = await Goal.findOne({ _id: id, userId });
      if (!goal) {
        return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
      }

      goal.currentAmount += body.contribution;
      if (goal.currentAmount >= goal.targetAmount) {
        goal.status = "completed";
      }
      await goal.save();

      return NextResponse.json({ success: true, data: { goal } });
    }

    // Regular update
    const goal = await Goal.findOneAndUpdate(
      { _id: id, userId },
      { $set: body },
      { new: true }
    );

    if (!goal) {
      return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { goal } });
  } catch (error) {
    console.error("Goal update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

// DELETE /api/goals/[id] — delete goal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await connectToDatabase();

    const goal = await Goal.findOneAndDelete({ _id: id, userId });
    if (!goal) {
      return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { message: "Goal deleted" } });
  } catch (error) {
    console.error("Goal delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}
