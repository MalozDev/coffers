import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account, ExpectedIncome, Reminder, Goal, User } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aggregation pipelines do not cast strings — userId must be an ObjectId
    const userIdOid = new Types.ObjectId(userId);

    // Run all queries in parallel
    const [
      user,
      accounts,
      todayAgg,
      monthAgg,
      totalAgg,
      upcomingReminders,
      upcomingCount,
      recentTransactions,
      expectedIncome,
      activeGoals,
      allTransactions,
    ] = await Promise.all([
      // Current user (for the dashboard greeting)
      User.findOne({ _id: userId }).select("name email profileImage isAdmin").lean(),
      // Accounts with balances
      Account.find({ userId }).lean(),
      // Today's income/expenses
      Transaction.aggregate([
        { $match: { userId: userIdOid, date: { $gte: todayStart } } },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
          },
        },
      ]),
      // This month's income/expenses
      Transaction.aggregate([
        { $match: { userId: userIdOid, date: { $gte: monthStart } } },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
          },
        },
      ]),
      // All-time totals
      Transaction.aggregate([
        { $match: { userId: userIdOid } },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
          },
        },
      ]),
      // Upcoming reminders (next 7 days)
      Reminder.find({
        userId,
        isCompleted: false,
        dueDate: {
          $gte: now,
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      })
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
      // "Due" = a bill whose date has been reached but is not paid yet
      // (overdue or due today). Closing/completing a reminder drops it out of
      // this count immediately.
      Reminder.countDocuments({
        userId,
        isCompleted: false,
        dueDate: { $lte: endOfToday },
      }),
      // Recent transactions (last 5)
      Transaction.find({ userId })
        .sort({ date: -1 })
        .limit(5)
        .populate("categoryId", "name color icon")
        .populate("accountId", "name")
        .lean(),
      // Pending expected income
      ExpectedIncome.find({ userId, status: "pending" })
        .sort({ expectedDate: 1 })
        .lean(),
      // Active goals
      Goal.find({ userId, status: "active" })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean(),
      Transaction.find({ userId }).select("type amount accountId toAccountId payments").lean(),
    ]);

    // Calculate account balances
    const accountBalances = accounts.map((account) => {
        let currentBalance = account.openingBalance;
        allTransactions.forEach((transaction) => {
          if (transaction.type === "income" && String(transaction.accountId) === String(account._id)) {
            currentBalance += transaction.amount;
          } else if (transaction.type === "expense") {
            const payment = transaction.payments?.find((item) => String(item.accountId) === String(account._id));
            currentBalance -= payment?.amount ?? (String(transaction.accountId) === String(account._id) ? transaction.amount : 0);
          } else if (transaction.type === "transfer") {
            if (String(transaction.accountId) === String(account._id)) currentBalance -= transaction.amount;
            if (String(transaction.toAccountId) === String(account._id)) currentBalance += transaction.amount;
          }
        });
        return { name: account.name, type: account.type, balance: currentBalance };
      });

    const totalBalance = accountBalances.reduce((sum, a) => sum + a.balance, 0);

    const parseAgg = (agg: { _id: string; total: number }[]) => {
      const map: Record<string, number> = {};
      agg.forEach((a) => { map[a._id] = a.total; });
      return map;
    };

    const today = parseAgg(todayAgg);
    const month = parseAgg(monthAgg);
    const total = parseAgg(totalAgg);

    const expectedIncomeTotal = expectedIncome.reduce((sum, e) => sum + e.amount, 0);
    const upcomingRemindersTotal = upcomingReminders.reduce((sum, r) => sum + r.amount, 0);

    // Insights
    const insights: string[] = [];
    if (month.expense && month.income) {
      const savingsRate = ((month.income - month.expense) / month.income) * 100;
      if (savingsRate < 10) {
        insights.push("Your savings rate is low this month. Try to cut back on non-essential spending.");
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        user: user ? { name: user.name, email: user.email, profileImage: user.profileImage || null, isAdmin: user.isAdmin } : null,
        balance: {
          total: totalBalance,
          accounts: accountBalances,
          expected: expectedIncomeTotal,
          committed: upcomingRemindersTotal,
        },
        today: {
          income: today.income || 0,
          expenses: today.expense || 0,
        },
        month: {
          income: month.income || 0,
          expenses: month.expense || 0,
        },
        lifetime: {
          income: total.income || 0,
          expenses: total.expense || 0,
        },
        recentTransactions,
        upcomingReminders,
        upcomingCount,
        expectedIncome,
        activeGoals,
        insights,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
