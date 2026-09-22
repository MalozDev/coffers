import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account, Goal, Reminder, ExpectedIncome, Budget } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// POST /api/intelligence/ask — answer a financial question
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { question } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Gather all financial data
    const [accounts, monthTransactions, activeGoals, upcomingReminders, expectedIncome, budgets] =
      await Promise.all([
        Account.find({ userId }).lean(),
        Transaction.find({ userId, date: { $gte: monthStart } })
          .populate("categoryId", "name")
          .lean(),
        Goal.find({ userId, status: "active" }).lean(),
        Reminder.find({ userId, isCompleted: false, dueDate: { $gte: now } })
          .sort({ dueDate: 1 })
          .lean(),
        ExpectedIncome.find({ userId, status: "pending" }).lean(),
        Budget.find({ userId }).populate("categoryId", "name").lean(),
      ]);

    // Calculate key metrics
    const totalBalance = accounts.reduce((sum, a) => sum + a.openingBalance, 0);
    const monthIncome = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const monthExpenses = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const expectedTotal = expectedIncome.reduce((sum, e) => sum + e.amount, 0);
    const committedTotal = upcomingReminders.reduce((sum, r) => sum + r.amount, 0);
    const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome) * 100 : 0;
    const dayOfMonth = now.getDate();
    const dailySpendRate = dayOfMonth > 0 ? monthExpenses / dayOfMonth : 0;
    const daysInMonth = monthEnd.getDate();
    const projectedMonthEnd = dailySpendRate * daysInMonth;

    // Category spending
    const categorySpending: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === "expense" && t.categoryId)
      .forEach((t) => {
        const name = (t.categoryId as any)?.name || "Other";
        categorySpending[name] = (categorySpending[name] || 0) + t.amount;
      });

    // Parse the question and generate answer
    const q = question.toLowerCase();
    let answer = "";
    let data: Record<string, unknown> = {};

    // Balance questions
    if (q.includes("balance") || q.includes("how much") || q.includes("money do i have")) {
      answer = `Your current available balance is K${totalBalance.toLocaleString()}. You also have K${expectedTotal.toLocaleString()} in expected income and K${committedTotal.toLocaleString()} in upcoming committed expenses.`;
      data = { balance: totalBalance, expected: expectedTotal, committed: committedTotal };
    }

    // Spending questions
    else if (q.includes("spend") || q.includes("spent") || q.includes("expense")) {
      if (q.includes("today")) {
        const todayExpenses = monthTransactions
          .filter((t) => t.type === "expense" && new Date(t.date).toDateString() === now.toDateString())
          .reduce((sum, t) => sum + t.amount, 0);
        answer = `You've spent K${todayExpenses.toLocaleString()} today.`;
        data = { todayExpenses };
      } else if (q.includes("month")) {
        answer = `You've spent K${monthExpenses.toLocaleString()} so far this month. At your current rate of K${Math.round(dailySpendRate)}/day, you'll spend approximately K${Math.round(projectedMonthEnd).toLocaleString()} by month-end.`;
        data = { monthExpenses, dailyRate: dailySpendRate, projected: projectedMonthEnd };
      } else {
        const topCategory = Object.entries(categorySpending).sort(([, a], [, b]) => b - a)[0];
        answer = `You've spent K${monthExpenses.toLocaleString()} this month. Your biggest category is ${topCategory?.[0] || "N/A"} at K${topCategory?.[1]?.toLocaleString() || 0}.`;
        data = { monthExpenses, categorySpending };
      }
    }

    // Savings questions
    else if (q.includes("saving") || q.includes("save")) {
      const currentSavings = monthIncome - monthExpenses;
      answer = `Your current savings rate is ${Math.round(savingsRate)}%. You've saved K${currentSavings.toLocaleString()} this month. ${savingsRate >= 20 ? "That's a healthy rate!" : "Try to aim for at least 20%."}`;
      data = { savingsRate: Math.round(savingsRate), savings: currentSavings };
    }

    // Income questions
    else if (q.includes("income") || q.includes("earning") || q.includes("made")) {
      answer = `You've earned K${monthIncome.toLocaleString()} this month. You also have K${expectedTotal.toLocaleString()} in expected income.`;
      data = { monthIncome, expected: expectedTotal };
    }

    // "Can I afford" questions
    else if (q.includes("can i afford") || q.includes("buy")) {
      const amountMatch = q.match(/k?\s*(\d[\d,]*)/);
      const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, "")) : 0;

      if (amount > 0) {
        const afterPurchase = totalBalance - amount;
        const netPosition = totalBalance + expectedTotal - committedTotal - amount;

        answer = afterPurchase >= 0
          ? `Yes, you can afford K${amount.toLocaleString()}. Your balance would go from K${totalBalance.toLocaleString()} to K${afterPurchase.toLocaleString()}. Your net position after expected income and commitments would be K${netPosition.toLocaleString()}.`
          : `You don't have enough. That purchase of K${amount.toLocaleString()} exceeds your available balance of K${totalBalance.toLocaleString()} by K${Math.abs(afterPurchase).toLocaleString()}.`;
        data = { amount, afterPurchase, netPosition };
      } else {
        answer = "I couldn't detect an amount in your question. Try asking 'Can I afford K5,000?'";
      }
    }

    // Goal questions
    else if (q.includes("goal") || q.includes("saving") && q.includes("plan")) {
      if (activeGoals.length === 0) {
        answer = "You don't have any active savings goals yet. Would you like to create one?";
      } else {
        const goalList = activeGoals
          .map((g) => {
            const progress = Math.round((g.currentAmount / g.targetAmount) * 100);
            const remaining = g.targetAmount - g.currentAmount;
            const monthsLeft =
              g.monthlyContribution > 0
                ? Math.ceil(remaining / g.monthlyContribution)
                : "unknown";
            return `"${g.name}" — ${progress}% complete (K${g.currentAmount.toLocaleString()} of K${g.targetAmount.toLocaleString()}). ~${monthsLeft} months to go at K${g.monthlyContribution.toLocaleString()}/month.`;
          })
          .join("\n");
        answer = `You have ${activeGoals.length} active goal(s):\n${goalList}`;
        data = { goals: activeGoals.length };
      }
    }

    // Budget questions
    else if (q.includes("budget")) {
      if (budgets.length === 0) {
        answer = "You don't have any budgets set up yet. Create one to start tracking spending limits.";
      } else {
        const limitBudgets = budgets.filter((b) => !!b.amount);
        if (limitBudgets.length === 0) {
          const items = budgets.reduce((s, b) => s + (b.items?.length || 0), 0);
          answer = `You have ${budgets.length} shopping-list budget(s) with ${items} item(s) across them. No category-limit budgets yet.`;
          data = { budgetCount: budgets.length };
        } else {
        const budgetList = limitBudgets
          .map((b) => {
            if (!b.amount) return null;
            const spent = monthTransactions
              .filter(
                (t) =>
                  t.type === "expense" &&
                  t.categoryId?.toString() === b.categoryId?.toString()
              )
              .reduce((sum, t) => sum + t.amount, 0);
            const pct = Math.round((spent / b.amount) * 100);
            return `"${b.name}" — K${spent.toLocaleString()} of K${b.amount.toLocaleString()} (${pct}%)`;
          })
          .filter((s): s is string => !!s)
          .join("\n");
        answer = `Your budgets:\n${budgetList}`;
        data = { budgetCount: limitBudgets.length };
        }
      }
    }

    // Upcoming/Reminders
    else if (q.includes("upcoming") || q.includes("due") || q.includes("owe") || q.includes("reminder")) {
      if (upcomingReminders.length === 0) {
        answer = "You have no upcoming obligations. You're all clear!";
      } else {
        const reminderList = upcomingReminders
          .slice(0, 5)
          .map((r) => {
            const daysUntil = Math.ceil(
              (new Date(r.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            return `"${r.title}" — K${r.amount.toLocaleString()} ${daysUntil <= 0 ? "due today" : `due in ${daysUntil} days`}`;
          })
          .join("\n");
        answer = `You have ${upcomingReminders.length} upcoming obligation(s):\n${reminderList}`;
        data = { reminderCount: upcomingReminders.length };
      }
    }

    // General / fallback
    else {
      answer = `Here's your financial snapshot:\n\n• Balance: K${totalBalance.toLocaleString()}\n• This month's income: K${monthIncome.toLocaleString()}\n• This month's expenses: K${monthExpenses.toLocaleString()}\n• Savings rate: ${Math.round(savingsRate)}%\n• Expected income: K${expectedTotal.toLocaleString()}\n• Upcoming commitments: K${committedTotal.toLocaleString()}\n\nYou can ask me about:\n• "How much do I have?"\n• "What did I spend this month?"\n• "Can I afford K5,000?"\n• "How are my savings goals?"\n• "What's my budget status?"\n• "What's coming up?"`;
      data = { balance: totalBalance, income: monthIncome, expenses: monthExpenses };
    }

    return NextResponse.json({
      success: true,
      data: {
        question,
        answer,
        context: data,
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Ask Coffers error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process your question" },
      { status: 500 }
    );
  }
}
