/*
 * Finance Engine — Ask Coffers answer router (pure).
 *
 * The keyword router lives here so answers are deterministic, testable and
 * fed by the same engine numbers the analysis page shows. The route's only
 * job is to build the snapshot and call this function.
 */

import type { FlowTotals } from "./types";
import { formatK, monthLabel, round } from "./format";

export interface AskSnapshot {
  now: Date;
  balance: {
    total: number;
    accounts: { name: string; balance: number }[];
  };
  expectedIncome: number;
  committed: {
    total: number;
    items: { title: string; amount: number; dueDate: Date | string }[];
  };
  /** The analysis page's four presets, computed by the same period engine. */
  periods: {
    today: FlowTotals;
    yesterday: FlowTotals;
    week: FlowTotals;
    month: FlowTotals;
  };
  categoriesThisMonth: { name: string; total: number }[];
  goals: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    monthlyContribution: number;
  }[];
  budgets: { name: string; amount?: number; spent?: number }[];
  month: {
    income: number;
    expenses: number;
    dayOfMonth: number;
    daysInMonth: number;
    dailySpendRate: number;
    projectedMonthEnd: number;
  };
}

export interface AskAnswer {
  answer: string;
  data: Record<string, unknown>;
}

function has(q: string, ...words: string[]): boolean {
  return words.some((word) => q.includes(word));
}

function parseAmount(q: string): number {
  const match = q.match(/k?\s*(\d[\d,]*)/);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
}

function spendAnswer(question: string, snapshot: AskSnapshot): AskAnswer | null {
  const q = question.toLowerCase();
  const { periods, month } = snapshot;

  if (has(q, "yesterday")) {
    const total = periods.yesterday.expenses;
    return {
      answer:
        total > 0
          ? `You spent ${formatK(total)} yesterday across ${periods.yesterday.expenseCount} expense(s).`
          : "You didn't record any spending yesterday.",
      data: { period: "yesterday", expenses: total },
    };
  }

  if (has(q, "today")) {
    const total = periods.today.expenses;
    return {
      answer:
        total > 0
          ? `You've spent ${formatK(total)} today across ${periods.today.expenseCount} expense(s).`
          : "You haven't recorded any spending today.",
      data: { period: "today", expenses: total },
    };
  }

  if (has(q, "week")) {
    const total = periods.week.expenses;
    return {
      answer:
        total > 0
          ? `You've spent ${formatK(total)} so far this week.`
          : "You haven't recorded any spending this week.",
      data: { period: "week", expenses: total },
    };
  }

  if (has(q, "month")) {
    const top = [...snapshot.categoriesThisMonth].sort((a, b) => b.total - a.total)[0];
    const topText = top ? ` Your biggest category is ${top.name} at ${formatK(top.total)}.` : "";
    return {
      answer: `You've spent ${formatK(month.expenses)} so far this month. At your current rate of K${Math.round(month.dailySpendRate)}/day, you'll spend about ${formatK(month.projectedMonthEnd)} by month-end.${topText}`,
      data: {
        period: "month",
        expenses: month.expenses,
        dailyRate: month.dailySpendRate,
        projected: month.projectedMonthEnd,
        categorySpending: Object.fromEntries(
          snapshot.categoriesThisMonth.map((c) => [c.name, c.total])
        ),
      },
    };
  }

  // No period mentioned — this month plus the top category.
  const top = [...snapshot.categoriesThisMonth].sort((a, b) => b.total - a.total)[0];
  const topText = top
    ? ` Your biggest category is ${top.name} at ${formatK(top.total)}.`
    : "";
  return {
    answer: `You've spent ${formatK(month.expenses)} this month.${topText}`,
    data: { period: "month", expenses: month.expenses },
  };
}

function goalAnswer(snapshot: AskSnapshot): AskAnswer {
  if (snapshot.goals.length === 0) {
    return {
      answer: "You don't have any active savings goals yet. Would you like to create one?",
      data: { goals: 0 },
    };
  }
  const lines = snapshot.goals.map((goal) => {
    const progress =
      goal.targetAmount > 0
        ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
        : 0;
    const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
    const monthsLeft =
      goal.monthlyContribution > 0
        ? Math.ceil(remaining / goal.monthlyContribution)
        : "unknown";
    return `"${goal.name}" — ${progress}% complete (${formatK(goal.currentAmount)} of ${formatK(goal.targetAmount)}). ~${monthsLeft} months to go at ${formatK(goal.monthlyContribution)}/month.`;
  });
  return {
    answer: `You have ${snapshot.goals.length} active goal(s):\n${lines.join("\n")}`,
    data: { goals: snapshot.goals.length },
  };
}

function budgetAnswer(snapshot: AskSnapshot): AskAnswer {
  if (snapshot.budgets.length === 0) {
    return {
      answer:
        "You don't have any budgets set up yet. Create one to start tracking spending limits.",
      data: { budgetCount: 0 },
    };
  }

  const withLimits = snapshot.budgets.filter((budget) => !!budget.amount);
  if (withLimits.length === 0) {
    return {
      answer: `You have ${snapshot.budgets.length} shopping-list budget(s) with checked items tracked against them. No category-limit budgets yet.`,
      data: { budgetCount: snapshot.budgets.length },
    };
  }

  const lines = withLimits
    .map((budget) => {
      const spent = budget.spent || 0;
      const pct = budget.amount ? Math.round((spent / budget.amount) * 100) : 0;
      return `"${budget.name}" — ${formatK(spent)} of ${formatK(budget.amount || 0)} (${pct}%)`;
    })
    .join("\n");

  return {
    answer: `Your budgets:\n${lines}`,
    data: { budgetCount: withLimits.length },
  };
}

function upcomingAnswer(snapshot: AskSnapshot): AskAnswer {
  const { items, total } = snapshot.committed;
  if (items.length === 0) {
    return {
      answer: "You have no upcoming obligations. You're all clear!",
      data: { reminderCount: 0 },
    };
  }
  const lines = items
    .slice(0, 5)
    .map((item) => {
      const daysUntil = Math.ceil(
        (new Date(item.dueDate).getTime() - snapshot.now.getTime()) / (24 * 60 * 60 * 1000)
      );
      return `"${item.title}" — ${formatK(item.amount)} ${
        daysUntil <= 0 ? "due today" : `due in ${daysUntil} days`
      }`;
    })
    .join("\n");
  return {
    answer: `You have ${items.length} upcoming obligation(s) totalling ${formatK(total)}:\n${lines}`,
    data: { reminderCount: items.length, committed: total },
  };
}

function savingsAnswer(snapshot: AskSnapshot): AskAnswer {
  const { month } = snapshot;
  const rate = month.income > 0 ? ((month.income - month.expenses) / month.income) * 100 : 0;
  const saved = month.income - month.expenses;
  const verdict =
    rate >= 20
      ? "That's a healthy rate!"
      : rate >= 10
        ? "Aim for at least 20%."
        : "Try to cut back so you can reach the 20% target.";
  return {
    answer: `Your savings rate this month is ${round(rate)}%. You've ${
      saved >= 0 ? "netted" : "gone over by"
    } ${formatK(saved)} so far. ${verdict}`,
    data: { savingsRate: round(rate), net: saved },
  };
}

function balanceAnswer(snapshot: AskSnapshot): AskAnswer {
  return {
    answer: `Your current available balance is ${formatK(snapshot.balance.total)}. You also have ${formatK(
      snapshot.expectedIncome
    )} in expected income and ${formatK(snapshot.committed.total)} in upcoming committed expenses.`,
    data: {
      balance: snapshot.balance.total,
      expected: snapshot.expectedIncome,
      committed: snapshot.committed.total,
    },
  };
}

function snapshotAnswer(snapshot: AskSnapshot): AskAnswer {
  const { month } = snapshot;
  const rate = month.income > 0 ? ((month.income - month.expenses) / month.income) * 100 : 0;
  const monthName = monthLabel(snapshot.now);
  return {
    answer: `Here's your financial snapshot:\n\n• Balance: ${formatK(snapshot.balance.total)}\n• Today: ${formatK(
      snapshot.periods.today.expenses
    )} spent · Yesterday: ${formatK(snapshot.periods.yesterday.expenses)} spent\n• ${monthName}: ${formatK(
      month.income
    )} in, ${formatK(month.expenses)} out\n• Savings rate: ${round(rate)}%\n• Expected income: ${formatK(
      snapshot.expectedIncome
    )}\n• Upcoming commitments: ${formatK(snapshot.committed.total)}\n\nYou can ask me about:\n• "What did I spend today?"\n• "What did I spend yesterday?"\n• "What did I spend this week?"\n• "What did I spend this month?"\n• "Can I afford K5,000?"\n• "How are my savings goals?"`,
    data: {
      balance: snapshot.balance.total,
      income: month.income,
      expenses: month.expenses,
      todayExpenses: snapshot.periods.today.expenses,
      yesterdayExpenses: snapshot.periods.yesterday.expenses,
      weekExpenses: snapshot.periods.week.expenses,
    },
  };
}

/**
 * Route a natural-language question to an engine-built answer.
 * Branch order matters: spending questions must beat the generic
 * "how much …" balance match ("How much did I spend today?" is spending).
 */
export function answerQuestion(question: string, snapshot: AskSnapshot): AskAnswer {
  const q = question.toLowerCase().trim();

  // 1. Affordability / purchase intent
  if (has(q, "can i afford", "can i buy", "should i buy", "can i purchase", "afford")) {
    const amount = parseAmount(q);
    if (amount > 0) {
      const { total } = snapshot.balance;
      const afterPurchase = total - amount;
      const netPosition =
        total + snapshot.expectedIncome - snapshot.committed.total - amount;
      return afterPurchase >= 0
        ? {
            answer: `Yes, you can afford ${formatK(amount)}. Your balance would go from ${formatK(
              total
            )} to ${formatK(afterPurchase)}. Your net position after expected income and commitments would be ${formatK(netPosition)}.`,
            data: { amount, afterPurchase, netPosition },
          }
        : {
            answer: `You don't have enough. That purchase of ${formatK(amount)} exceeds your available balance of ${formatK(
              total
            )} by ${formatK(Math.abs(afterPurchase))}.`,
            data: { amount, afterPurchase, netPosition },
          };
    }
    return {
      answer:
        "I couldn't detect an amount in your question. Try asking 'Can I afford K5,000?'",
      data: {},
    };
  }

  // 2. Spending (period-aware — mirrors the analysis page presets)
  if (has(q, "spend", "spent", "spending", "expense", "buy", "bought", "purchased")) {
    return spendAnswer(question, snapshot) || snapshotAnswer(snapshot);
  }

  // 3. Income
  if (has(q, "income", "earn", "earning", "salary", "made", "make")) {
    return {
      answer: `You've earned ${formatK(snapshot.month.income)} this month. You also have ${formatK(
        snapshot.expectedIncome
      )} in expected income.`,
      data: { monthIncome: snapshot.month.income, expected: snapshot.expectedIncome },
    };
  }

  // 4. Goals (before the generic savings branch — "savings goals")
  if (has(q, "goal", "target")) {
    return goalAnswer(snapshot);
  }

  // 5. Budgets
  if (has(q, "budget")) {
    return budgetAnswer(snapshot);
  }

  // 6. Upcoming obligations
  if (has(q, "upcoming", "coming up", "due", "owe", "reminder", "bill")) {
    return upcomingAnswer(snapshot);
  }

  // 7. Savings rate
  if (has(q, "save", "saving", "savings")) {
    return savingsAnswer(snapshot);
  }

  // 8. Balance / how much do I have
  if (has(q, "balance", "how much", "money do i have", "account")) {
    return balanceAnswer(snapshot);
  }

  // 9. Fallback: engine snapshot
  return snapshotAnswer(snapshot);
}
