import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

function getStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getPrevPeriod(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  return {
    prevStart: new Date(start.getTime() - diff),
    prevEnd: new Date(end.getTime() - diff - 1),
  };
}

// GET /api/analysis?period=daily|weekly|monthly&date=2024-01-15
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "monthly") as "daily" | "weekly" | "monthly";
    const dateParam = searchParams.get("date");
    const referenceDate = dateParam ? new Date(dateParam) : new Date();

    // Determine current and previous period ranges
    let start: Date, end: Date;
    if (period === "daily") {
      start = getStartOfDay(referenceDate);
      end = getEndOfDay(referenceDate);
    } else if (period === "weekly") {
      start = getStartOfWeek(referenceDate);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start = getStartOfMonth(referenceDate);
      end = getEndOfMonth(referenceDate);
    }

    const { prevStart, prevEnd } = getPrevPeriod(start, end);

    // Current period aggregation
    const currentAgg = await Transaction.aggregate([
      {
        $match: {
          userId,
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Previous period aggregation
    const prevAgg = await Transaction.aggregate([
      {
        $match: {
          userId,
          date: { $gte: prevStart, $lte: prevEnd },
        },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Category breakdown for expenses
    const categoryBreakdown = await Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$categoryId",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          total: 1,
          count: 1,
          name: "$category.name",
          color: "$category.color",
          icon: "$category.icon",
        },
      },
    ]);

    // Parse results
    const current: Record<string, number> = {};
    const currentCount: Record<string, number> = {};
    currentAgg.forEach((a) => {
      current[a._id] = a.total;
      currentCount[a._id] = a.count;
    });

    const prev: Record<string, number> = {};
    prevAgg.forEach((a) => {
      prev[a._id] = a.total;
    });

    const income = current.income || 0;
    const expenses = current.expense || 0;
    const prevIncome = prev.income || 0;
    const prevExpenses = prev.expense || 0;
    const savings = income - expenses;
    const prevSavings = prevIncome - prevExpenses;

    const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0;
    const expenseChange = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Spending patterns
    const transactionCount = currentCount.expense || 0;
    const avgTransaction = transactionCount > 0 ? expenses / transactionCount : 0;

    // Top category
    const topCategory = categoryBreakdown[0] || null;

    // Category totals for chart
    const totalExpenses = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);
    const categoryWithPercent = categoryBreakdown.map((c) => ({
      ...c,
      percentage: totalExpenses > 0 ? (c.total / totalExpenses) * 100 : 0,
    }));

    // Generate insights
    const insights: string[] = [];
    if (expenseChange > 15) {
      insights.push(`Your spending increased by ${Math.round(expenseChange)}% compared to the previous ${period}.`);
    } else if (expenseChange < -15) {
      insights.push(`Great job! Your spending decreased by ${Math.round(Math.abs(expenseChange))}% compared to the previous ${period}.`);
    }

    if (savingsRate < 10 && income > 0) {
      insights.push(`Your savings rate is only ${Math.round(savingsRate)}%. Try to save at least 20% of your income.`);
    } else if (savingsRate >= 20) {
      insights.push(`Excellent! You're saving ${Math.round(savingsRate)}% of your income.`);
    }

    if (topCategory && totalExpenses > 0) {
      insights.push(`Your biggest expense category is ${topCategory.name || "Unknown"} at ${Math.round(topCategory.percentage || 0)}% of total spending.`);
    }

    return NextResponse.json({
      success: true,
      data: {
        period,
        dateRange: { start, end },
        current: {
          income,
          expenses,
          savings,
          savingsRate,
          transactionCount,
          avgTransaction,
        },
        previous: {
          income: prevIncome,
          expenses: prevExpenses,
          savings: prevSavings,
        },
        changes: {
          income: incomeChange,
          expenses: expenseChange,
        },
        categoryBreakdown: categoryWithPercent,
        insights,
        topCategory,
      },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}
