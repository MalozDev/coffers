import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/intelligence/patterns — detect spending patterns
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get all transactions from the last 3 months
    const transactions = await Transaction.find({
      userId,
      date: { $gte: threeMonthsAgo },
    })
      .populate<{ categoryId: { _id: string; name: string; color: string; icon?: string } | null }>("categoryId", "name color icon")
      .sort({ date: 1 })
      .lean();

    // 1. Recurring Expenses — find expenses that happen regularly
    const expenseByDescription: Record<string, {
      amounts: number[];
      dates: Date[];
      categoryId: string;
      categoryName: string;
      count: number;
    }> = {};

    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = t.description.toLowerCase().trim();
        if (!expenseByDescription[key]) {
          expenseByDescription[key] = {
            amounts: [],
            dates: [],
            categoryId: (t.categoryId as any)?._id?.toString() || "",
            categoryName: (t.categoryId as any)?.name || "Unknown",
            count: 0,
          };
        }
        expenseByDescription[key].amounts.push(t.amount);
        expenseByDescription[key].dates.push(new Date(t.date));
        expenseByDescription[key].count++;
      });

    const recurringExpenses = Object.entries(expenseByDescription)
      .filter(([, data]) => data.count >= 2) // At least 2 occurrences
      .map(([description, data]) => {
        const avgAmount =
          data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;

        // Calculate frequency (days between occurrences)
        const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());
        let avgDaysBetween = 30;
        if (sortedDates.length >= 2) {
          const gaps = [];
          for (let i = 1; i < sortedDates.length; i++) {
            gaps.push(
              (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) /
                (1000 * 60 * 60 * 24)
            );
          }
          avgDaysBetween = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        }

        let frequency = "irregular";
        if (avgDaysBetween <= 2) frequency = "daily";
        else if (avgDaysBetween <= 9) frequency = "weekly";
        else if (avgDaysBetween <= 35) frequency = "monthly";
        else if (avgDaysBetween <= 400) frequency = "yearly";

        // Predict next occurrence
        const lastDate = sortedDates[sortedDates.length - 1];
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + Math.round(avgDaysBetween));

        return {
          description,
          categoryId: data.categoryId,
          categoryName: data.categoryName,
          count: data.count,
          avgAmount: Math.round(avgAmount),
          frequency,
          avgDaysBetween: Math.round(avgDaysBetween),
          lastDate: lastDate.toISOString(),
          nextPredictedDate: nextDate.toISOString(),
          isUpcoming: nextDate > now && nextDate < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
      })
      .sort((a, b) => b.count - a.count);

    // 2. Payday Pattern — detect income cycle and spending behavior around payday
    const incomeTransactions = transactions.filter((t) => t.type === "income");
    const paydayDates: Date[] = [];

    // Find income dates (likely payday)
    incomeTransactions.forEach((t) => {
      const date = new Date(t.date);
      paydayDates.push(date);
    });

    // Analyze spending in first 5 days after each payday vs rest of month
    let earlyPaydaySpending = 0;
    let earlyPaydayDays = 0;
    let latePaydaySpending = 0;
    let latePaydayDays = 0;

    if (paydayDates.length > 0) {
      const expenseTransactions = transactions.filter((t) => t.type === "expense");

      paydayDates.forEach((payday) => {
        const fiveDaysLater = new Date(payday);
        fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

        expenseTransactions.forEach((expense) => {
          const expenseDate = new Date(expense.date);
          const daysSincePayday =
            (expenseDate.getTime() - payday.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSincePayday >= 0 && daysSincePayday <= 5) {
            earlyPaydaySpending += expense.amount;
            earlyPaydayDays++;
          } else if (daysSincePayday > 5 && daysSincePayday <= 30) {
            latePaydaySpending += expense.amount;
            latePaydayDays++;
          }
        });
      });
    }

    const avgEarlySpending =
      earlyPaydayDays > 0 ? earlyPaydaySpending / paydayDates.length : 0;
    const avgLateSpending =
      latePaydayDays > 0 ? latePaydaySpending / paydayDates.length : 0;

    const paydayPattern =
      paydayDates.length >= 2
        ? {
            detected: true,
            avgFirst5Days: Math.round(avgEarlySpending),
            avgRestOfMonth: Math.round(avgLateSpending / 3), // Normalize to ~5 day equivalent
            insight:
              avgEarlySpending > avgLateSpending / 3 * 1.3
                ? `You spend ${Math.round(((avgEarlySpending / (avgLateSpending / 3 || 1)) - 1) * 100)}% more in the first 5 days after payday compared to the rest of the month.`
                : "Your spending is fairly consistent throughout the month.",
          }
        : { detected: false };

    // 3. Spending Trends — compare month-over-month
    const monthlyTotals: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = new Date(t.date).toISOString().slice(0, 7); // YYYY-MM
        monthlyTotals[key] = (monthlyTotals[key] || 0) + t.amount;
      });

    const months = Object.entries(monthlyTotals).sort(([a], [b]) => a.localeCompare(b));
    const spendingTrend =
      months.length >= 2
        ? {
            direction:
              months[months.length - 1][1] > months[months.length - 2][1]
                ? "increasing"
                : months[months.length - 1][1] < months[months.length - 2][1]
                  ? "decreasing"
                  : "stable",
            monthlyData: months.map(([month, total]) => ({
              month,
              total: Math.round(total),
            })),
          }
        : { direction: "insufficient_data", monthlyData: [] };

    // 4. Category Trends — detect growing/falling categories
    const currentMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 7);

    const categoryTrends: Record<string, { current: number; previous: number; name: string }> = {};
    transactions
      .filter((t) => t.type === "expense" && t.categoryId)
      .forEach((t) => {
        const month = new Date(t.date).toISOString().slice(0, 7);
        const catId = t.categoryId?._id?.toString() || "unknown";
        const catName = t.categoryId?.name || "Unknown";

        if (!categoryTrends[catId]) {
          categoryTrends[catId] = { current: 0, previous: 0, name: catName };
        }

        if (month === currentMonth) {
          categoryTrends[catId].current += t.amount;
        } else if (month === lastMonth) {
          categoryTrends[catId].previous += t.amount;
        }
      });

    const categoryChanges = Object.entries(categoryTrends)
      .filter(([, data]) => data.previous > 0)
      .map(([id, data]) => ({
        categoryId: id,
        name: data.name,
        current: Math.round(data.current),
        previous: Math.round(data.previous),
        change:
          data.previous > 0
            ? Math.round(((data.current - data.previous) / data.previous) * 100)
            : 0,
      }))
      .sort((a, b) => b.change - a.change);

    // 5. Forgotten Expenses — expected but not yet recorded this month
    const forgottenExpenses = recurringExpenses
      .filter((r) => {
        const lastDate = new Date(r.lastDate);
        const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceLast > r.avgDaysBetween * 1.2 && !r.isUpcoming;
      })
      .map((r) => ({
        description: r.description,
        categoryName: r.categoryName,
        avgAmount: r.avgAmount,
        expectedDate: r.nextPredictedDate,
        daysOverdue: Math.round(
          (now.getTime() - new Date(r.nextPredictedDate).getTime()) / (1000 * 60 * 60 * 24)
        ),
      }));

    // 6. Financial Health Indicators
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const healthIndicators = {
      savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0,
      spendingConsistency: spendingTrend.direction === "stable" ? "Good" : spendingTrend.direction === "decreasing" ? "Improving" : "Needs attention",
      categoryDiversification: Object.keys(categoryTrends).length > 3 ? "Diversified" : "Concentrated",
      recurringAwareness: recurringExpenses.length > 0 ? "Tracking" : "None detected",
    };

    return NextResponse.json({
      success: true,
      data: {
        recurringExpenses,
        paydayPattern,
        spendingTrend,
        categoryChanges,
        forgottenExpenses,
        healthIndicators,
      },
    });
  } catch (error) {
    console.error("Pattern detection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to detect patterns" },
      { status: 500 }
    );
  }
}
