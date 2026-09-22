import { NextRequest, NextResponse } from "next/server";
import { Account, Budget, Goal, Transaction, User } from "@/lib/models";
import connectToDatabase from "@/lib/db/connect";
import { getAdminUserId } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    await connectToDatabase();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [users, accounts, transactions, budgets, goals, newToday, newThisWeek, newThisMonth, newPreviousMonth, activeUsers, activityToday, activityThisWeek, signupTrend] = await Promise.all([
      User.find({}).select("name email phoneNumber isAdmin createdAt").sort({ createdAt: -1 }).lean(),
      Account.countDocuments({}),
      Transaction.countDocuments({}),
      Budget.countDocuments({}),
      Goal.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: weekStart } }),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      User.countDocuments({ createdAt: { $gte: previousMonthStart, $lt: monthStart } }),
      User.countDocuments({ $or: [{ updatedAt: { $gte: weekStart } }, { _id: { $in: await Transaction.distinct("userId", { date: { $gte: weekStart } }) } }] }),
      Transaction.countDocuments({ createdAt: { $gte: todayStart } }),
      Transaction.countDocuments({ createdAt: { $gte: weekStart } }),
      User.aggregate([
        { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    const usersWithSetup = await Account.distinct("userId");
    const setupRate = users.length ? Math.round((usersWithSetup.length / users.length) * 100) : 0;
    const monthGrowth = newPreviousMonth ? Math.round(((newThisMonth - newPreviousMonth) / newPreviousMonth) * 100) : newThisMonth > 0 ? 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        users,
        stats: { users: users.length, accounts, transactions, budgets, goals },
        growth: { newToday, newThisWeek, newThisMonth, newPreviousMonth, monthGrowth, activeUsers, setupRate, activityToday, activityThisWeek },
        signupTrend: signupTrend.map((item) => ({ label: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`, count: item.count })),
        system: { database: "Connected", api: "Healthy" },
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json({ success: false, error: "Failed to load admin overview" }, { status: 500 });
  }
}
