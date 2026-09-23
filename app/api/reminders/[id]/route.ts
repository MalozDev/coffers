import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Reminder, Account, Category, Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

/*
 * PATCH /api/reminders/[id]
 *   { action: "complete", accountId } — confirmed completion: deducts the
 *     amount from the chosen account, then marks the reminder completed.
 *     Once-off reminders are additionally closed; recurring reminders spawn
 *     their next occurrence.
 *   { isCompleted: boolean } — legacy toggle (no money moves)
 */
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

    // ── Confirmed completion: deduct then mark completed ──────────────
    if (body.action === "complete") {
      const reminder = await Reminder.findOne({ _id: id, userId });
      if (!reminder) {
        return NextResponse.json({ success: false, error: "Reminder not found" }, { status: 404 });
      }
      // Already processed — never deduct twice
      if (reminder.isCompleted) {
        return NextResponse.json({ success: true, data: { reminder, alreadyCompleted: true } });
      }

      if (!body.accountId) {
        return NextResponse.json(
          { success: false, error: "Choose the account to pay from" },
          { status: 400 }
        );
      }
      const account = await Account.findOne({ _id: body.accountId, userId }).lean();
      if (!account) {
        return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
      }

      let categoryId = reminder.categoryId || null;
      if (!categoryId) {
        const category = await Category.findOne({ userId, type: "expense" })
          .sort({ createdAt: 1 })
          .lean();
        categoryId = category?._id || null;
      }
      if (!categoryId) {
        return NextResponse.json(
          { success: false, error: "Create an expense category before completing reminders" },
          { status: 400 }
        );
      }

      let transactionId: string | null = null;
      let nextOccurrence: string | null = null;
      try {
        const transaction = await Transaction.create({
          userId,
          type: "expense",
          amount: reminder.amount,
          categoryId,
          accountId: account._id,
          description: `Reminder: ${reminder.title}`,
          date: new Date(),
        });
        transactionId = String(transaction._id);

        reminder.isCompleted = true;
        reminder.status = "closed";
        await reminder.save();

        // Recurring reminders schedule their next occurrence
        if (reminder.recurrence !== "none") {
          const nextDate = new Date(reminder.dueDate);
          switch (reminder.recurrence) {
            case "daily":
              nextDate.setDate(nextDate.getDate() + 1);
              break;
            case "weekly":
              nextDate.setDate(nextDate.getDate() + 7);
              break;
            case "monthly":
              nextDate.setMonth(nextDate.getMonth() + 1);
              break;
            case "yearly":
              nextDate.setFullYear(nextDate.getFullYear() + 1);
              break;
          }
          const created = await Reminder.create({
            userId,
            title: reminder.title,
            dueDate: nextDate,
            amount: reminder.amount,
            categoryId: reminder.categoryId,
            recurrence: reminder.recurrence,
            isCompleted: false,
            status: "active",
          });
          nextOccurrence = String(created._id);
        }
      } catch (completeError) {
        // Roll back so the account and the reminder never disagree
        if (transactionId) {
          await Transaction.deleteOne({ _id: transactionId, userId });
        }
        if (nextOccurrence) {
          await Reminder.deleteOne({ _id: nextOccurrence, userId });
        }
        throw completeError;
      }

      return NextResponse.json({
        success: true,
        data: {
          reminder,
          deducted: reminder.amount,
          deductedFrom: account.name,
        },
      });
    }

    // ── Legacy completion toggle (no deduction) ───────────────────────
    if (body.isCompleted !== undefined) {
      const reminder = await Reminder.findOneAndUpdate(
        { _id: id, userId },
        {
          $set: {
            isCompleted: body.isCompleted,
            status: body.isCompleted ? "closed" : "active",
          },
        },
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
          status: "active",
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

// DELETE /api/reminders/[id] — any reminder can be deleted, whatever its
// status or type (active, completed, closed, recurring, once-off).
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
