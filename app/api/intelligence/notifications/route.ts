import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Reminder, Budget, ExpectedIncome, Account } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

interface Notification {
  id: string;
  type: "warning" | "info" | "success" | "reminder";
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  action?: string;
}

// GET /api/intelligence/notifications — generate smart notifications
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Aggregation pipelines do not cast strings — userId must be an ObjectId
    const userIdOid = new Types.ObjectId(userId);

    const notifications: Notification[] = [];

    // 1. Upcoming salary/income expected
    const expectedIncome = await ExpectedIncome.find({
      userId,
      status: "pending",
      expectedDate: { $gte: today, $lte: weekFromNow },
    }).lean();

    expectedIncome.forEach((ei) => {
      const daysUntil = Math.ceil(
        (new Date(ei.expectedDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      notifications.push({
        id: `income-${ei._id}`,
        type: "info",
        title: `${ei.source} expected`,
        message: `K${ei.amount.toLocaleString()} expected ${daysUntil <= 0 ? "today" : `in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`}. You have upcoming expenses to plan for.`,
        priority: "medium",
      });
    });

    // 2. Upcoming bills/reminders
    const upcomingReminders = await Reminder.find({
      userId,
      isCompleted: false,
      dueDate: { $gte: today, $lte: weekFromNow },
    })
      .sort({ dueDate: 1 })
      .lean();

    upcomingReminders.forEach((r) => {
      const daysUntil = Math.ceil(
        (new Date(r.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      notifications.push({
        id: `reminder-${r._id}`,
        type: daysUntil <= 1 ? "warning" : "reminder",
        title: r.title,
        message: `K${r.amount.toLocaleString()} due ${daysUntil <= 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`,
        priority: daysUntil <= 1 ? "high" : "medium",
      });
    });

    // 3. Budget warnings
    const budgets = await Budget.find({ userId })
      .populate("categoryId", "name")
      .lean();

    for (const budget of budgets) {
      // Shopping-list budgets have no category limit to warn about
      if (!budget.amount || !budget.categoryId) continue;
      const spent = await Transaction.aggregate([
        {
          $match: {
            userId: userIdOid,
            type: "expense",
            categoryId: budget.categoryId,
            date: { $gte: monthStart, $lte: now },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const spentAmount = spent[0]?.total || 0;
      const percentage = (spentAmount / budget.amount) * 100;

      if (percentage >= 100) {
        notifications.push({
          id: `budget-over-${budget._id}`,
          type: "warning",
          title: `${budget.name} limit reached`,
          message: `You've spent K${spentAmount.toLocaleString()} of your K${budget.amount.toLocaleString()} ${budget.period} budget for ${(budget.categoryId as any)?.name || "this category"}.`,
          priority: "high",
        });
      } else if (percentage >= 80) {
        notifications.push({
          id: `budget-warn-${budget._id}`,
          type: "warning",
          title: `${budget.name} approaching limit`,
          message: `You've used ${Math.round(percentage)}% of your ${(budget.categoryId as any)?.name || ""} budget. K${(budget.amount - spentAmount).toLocaleString()} remaining.`,
          priority: "medium",
        });
      }
    }

    // 4. Overspending alerts
    const dayOfMonth = now.getDate();
    const monthExpenses = await Transaction.aggregate([
      { $match: { userId: userIdOid, type: "expense", date: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const monthIncome = await Transaction.aggregate([
      { $match: { userId: userIdOid, type: "income", date: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const expenses = monthExpenses[0]?.total || 0;
    const income = monthIncome[0]?.total || 0;
    const dailyRate = dayOfMonth > 0 ? expenses / dayOfMonth : 0;
    const daysInMonth = monthEnd.getDate();
    const projected = dailyRate * daysInMonth;

    if (income > 0 && projected > income * 1.1) {
      notifications.push({
        id: "overspending-alert",
        type: "warning",
        title: "Spending projection warning",
        message: `At your current rate of K${Math.round(dailyRate)}/day, you'll spend K${Math.round(projected).toLocaleString()} by month-end — ${Math.round(((projected - income) / income) * 100)}% more than your income.`,
        priority: "high",
      });
    }

    // 5. Account low balance
    const accounts = await Account.find({ userId }).lean();
    for (const account of accounts) {
      const txAgg = await Transaction.aggregate([
        {
          $match: {
            userId: userIdOid,
            $or: [
              { accountId: account._id, type: { $in: ["income", "expense"] } },
              { toAccountId: account._id, type: "transfer" },
            ],
          },
        },
        {
          $group: {
            _id: null,
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          },
        },
      ]);
      const agg = txAgg[0] || { income: 0, expense: 0 };
      const balance = account.openingBalance + agg.income - agg.expense;

      if (balance < 100 && account.type !== "savings") {
        notifications.push({
          id: `low-balance-${account._id}`,
          type: "warning",
          title: `Low balance: ${account.name}`,
          message: `Your ${account.name} balance is K${balance.toLocaleString()}. Consider topping it up.`,
          priority: "medium",
        });
      }
    }

    // 6. Positive reinforcement
    if (income > 0) {
      const savingsRate = ((income - expenses) / income) * 100;
      if (savingsRate >= 20 && dayOfMonth >= 15) {
        notifications.push({
          id: "savings-success",
          type: "success",
          title: "Great savings rate! 🎉",
          message: `You're saving ${Math.round(savingsRate)}% of your income this month. Keep it up!`,
          priority: "low",
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notifications.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount: notifications.filter((n) => n.priority === "high").length,
      },
    });
  } catch (error) {
    console.error("Notifications error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate notifications" },
      { status: 500 }
    );
  }
}
