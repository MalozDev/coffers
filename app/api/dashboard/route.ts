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
      recentTransactions,
      expectedIncome,
      activeGoals,
    ] = await Promise.all([
      // Current user (for the dashboard greeting)
      User.findOne({ _id: userId }).select("name email").lean(),
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
    ]);

    // Calculate account balances
    const accountBalances = await Promise.all(
      accounts.map(async (account) => {
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
              transferIn: { $sum: { $cond: [{ $eq: ["$toAccountId", account._id] }, "$amount", 0] } },
              transferOut: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$type", "transfer"] }, { $eq: ["$accountId", account._id] }] },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]);
        const agg = txAgg[0] || { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
        const currentBalance = account.openingBalance + agg.income - agg.expense + agg.transferIn - agg.transferOut;
        return { name: account.name, type: account.type, balance: currentBalance };
      })
    );

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
        user: user ? { name: user.name, email: user.email } : null,
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
