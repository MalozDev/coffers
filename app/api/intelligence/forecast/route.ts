import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/intelligence/forecast — predict month-end position
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    // Aggregation pipelines do not cast strings — userId must be an ObjectId
    const userIdOid = new Types.ObjectId(userId);

    // Current month transactions
    const monthTransactions = await Transaction.find({
      userId,
      date: { $gte: monthStart, $lte: now },
    }).populate("categoryId", "name color icon").lean();

    const income = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Daily spending rate
    const dailySpendRate = dayOfMonth > 0 ? expenses / dayOfMonth : 0;
    const dailyIncomeRate = dayOfMonth > 0 ? income / dayOfMonth : 0;

    // Project month-end values
    const projectedExpenses = dailySpendRate * daysInMonth;
    const projectedIncome = dailyIncomeRate * daysInMonth;
    const projectedSavings = projectedIncome - projectedExpenses;

    // Category projections
    const categorySpending: Record<string, { total: number; name: string; count: number }> = {};
    monthTransactions
      .filter((t) => t.type === "expense" && t.categoryId)
      .forEach((t) => {
        const category = t.categoryId as any;
        const catId = String(category?._id || category || "unknown");
        if (!categorySpending[catId]) {
          categorySpending[catId] = { total: 0, name: "", count: 0 };
        }
        categorySpending[catId].total += t.amount;
          categorySpending[catId].name = category?.name || "Other";
        categorySpending[catId].count++;
      });

    const categoryProjections = Object.entries(categorySpending)
      .map(([id, data]) => ({
        categoryId: id,
        name: data.name,
        currentSpend: Math.round(data.total),
        projectedMonthEnd: Math.round((data.total / dayOfMonth) * daysInMonth),
        dailyRate: Math.round(data.total / dayOfMonth * 100) / 100,
      }))
      .sort((a, b) => b.projectedMonthEnd - a.projectedMonthEnd);

    // Account balance projections
    const accounts = await Account.find({ userId }).lean();
    const accountProjections = await Promise.all(
      accounts.map(async (account) => {
        const txAgg = await Transaction.aggregate([
          {
            $match: {
              userId: userIdOid,
              $or: [
                { accountId: account._id, type: { $in: ["income", "expense"] } },
                { toAccountId: account._id, type: "transfer" },
              ],
              date: { $gte: monthStart },
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
        const net = agg.income - agg.expense;
        const dailyNet = dayOfMonth > 0 ? net / dayOfMonth : 0;

        return {
          name: account.name,
          type: account.type,
          currentBalance: account.openingBalance + net,
          projectedMonthEnd: account.openingBalance + net + dailyNet * daysRemaining,
        };
      })
    );

    // Week-by-week breakdown
    const weeklyBreakdown: { week: string; spending: number; income: number }[] = [];
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(monthStart);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > now) weekEnd.setTime(now.getTime());

      const weekTx = monthTransactions.filter((t) => {
        const d = new Date(t.date);
        return d >= weekStart && d <= weekEnd;
      });

      weeklyBreakdown.push({
        week: `Week ${w + 1}`,
        spending: Math.round(
          weekTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0)
        ),
        income: Math.round(
          weekTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0)
        ),
      });
    }

    // Generate forecast insights
    const insights: string[] = [];

    if (daysRemaining > 0) {
      insights.push(
        `At your current spending rate of K${Math.round(dailySpendRate)}/day, you'll spend approximately K${Math.round(projectedExpenses)} by month-end.`
      );
    }

    if (projectedSavings < 0) {
      insights.push(
        `⚠️ Warning: You're projected to overspend by K${Math.round(Math.abs(projectedSavings))} this month.`
      );
    } else if (projectedSavings > 0) {
      insights.push(
        `You're on track to save K${Math.round(projectedSavings)} this month (${Math.round((projectedSavings / projectedIncome) * 100)}% savings rate).`
      );
    }

    if (categoryProjections.length > 0 && categoryProjections[0].projectedMonthEnd > 0) {
      insights.push(
        `Your highest projected expense is ${categoryProjections[0].name} at K${categoryProjections[0].projectedMonthEnd}.`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        current: {
          dayOfMonth,
          daysInMonth,
          daysRemaining,
          income,
          expenses,
          dailySpendRate: Math.round(dailySpendRate),
          dailyIncomeRate: Math.round(dailyIncomeRate),
        },
        projected: {
          income: Math.round(projectedIncome),
          expenses: Math.round(projectedExpenses),
          savings: Math.round(projectedSavings),
          savingsRate:
            projectedIncome > 0
              ? Math.round((projectedSavings / projectedIncome) * 100)
              : 0,
        },
        categoryProjections,
        accountProjections,
        weeklyBreakdown,
        insights,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Forecast error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate forecast" },
      { status: 500 }
    );
  }
}
