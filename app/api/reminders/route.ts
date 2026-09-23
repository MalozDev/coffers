import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Reminder } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/reminders — list reminders
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get("upcoming"); // ?upcoming=true

    let query: Record<string, unknown> = { userId };
    if (upcoming === "true") {
      query.dueDate = { $gte: new Date() };
      query.isCompleted = false;
    }

    const raw = await Reminder.find(query)
      .populate("categoryId", "name color icon")
      .sort({ createdAt: -1 })
      .lean();

    // Most recent → oldest; legacy docs predate the status field
    const reminders = raw.map((reminder) => ({
      ...reminder,
      status: reminder.status || (reminder.isCompleted ? "closed" : "active"),
    }));

    return NextResponse.json({ success: true, data: { reminders } });
  } catch (error) {
    console.error("Reminders fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch reminders" },
      { status: 500 }
    );
  }
}

// POST /api/reminders — create a reminder
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, dueDate, amount, categoryId, recurrence } = body;

    if (!title || !dueDate || !amount) {
      return NextResponse.json(
        { success: false, error: "Title, due date, and amount are required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const reminder = await Reminder.create({
      userId,
      title,
      dueDate: new Date(dueDate),
      amount,
      categoryId: categoryId || undefined,
      recurrence: recurrence || "none",
    });

    return NextResponse.json(
      { success: true, data: { reminder } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Reminder creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create reminder" },
      { status: 500 }
    );
  }
}
