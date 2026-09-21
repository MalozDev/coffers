import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Reminder } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// PATCH /api/reminders/[id] — complete or update
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

    // Handle completion
    if (body.isCompleted !== undefined) {
      const reminder = await Reminder.findOneAndUpdate(
        { _id: id, userId },
        { $set: { isCompleted: body.isCompleted } },
        { new: true }
      );
      if (!reminder) {
        return NextResponse.json({ success: false, error: "Reminder not found" }, { status: 404 });
      }

      // If recurring and completed, create next occurrence
      if (body.isCompleted && reminder.recurrence !== "none") {
        const nextDate = new Date(reminder.dueDate);
        switch (reminder.recurrence) {
          case "daily": nextDate.setDate(nextDate.getDate() + 1); break;
          case "weekly": nextDate.setDate(nextDate.getDate() + 7); break;
          case "monthly": nextDate.setMonth(nextDate.getMonth() + 1); break;
          case "yearly": nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        }

        await Reminder.create({
          userId,
          title: reminder.title,
          dueDate: nextDate,
          amount: reminder.amount,
          categoryId: reminder.categoryId,
          recurrence: reminder.recurrence,
          isCompleted: false,
        });
      }

      return NextResponse.json({ success: true, data: { reminder } });
    }

    // Regular update
    const reminder = await Reminder.findOneAndUpdate(
      { _id: id, userId },
      { $set: body },
      { new: true }
    );
    if (!reminder) {
      return NextResponse.json({ success: false, error: "Reminder not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { reminder } });
  } catch (error) {
    console.error("Reminder update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}

// DELETE /api/reminders/[id]
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
    const reminder = await Reminder.findOneAndDelete({ _id: id, userId });
    if (!reminder) {
      return NextResponse.json({ success: false, error: "Reminder not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { message: "Reminder deleted" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
