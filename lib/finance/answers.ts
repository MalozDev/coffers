/*
 * Finance Engine — Ask Coffers answer router (pure).
 *
 * The keyword router lives here so answers are deterministic, testable and
 * fed by the same engine numbers the analysis page shows. The route's only
 * job is to build the snapshot and call this function.
 *
 * Smarts (all deterministic, all tested):
 *  - typo-tolerant period parsing ("yestadays", "todays", "this mnth")
 *  - a LIST intent that itemises real transactions, not just totals
 *  - conversation context: follow-ups inherit the previous turn's intent
 *    and period ("What did I spend today?" → "and this week?")
 *  - every answer carries suggested follow-up chips (GPT-style)
 */

import type { FlowTotals } from "./types";
import { formatDayMonth, formatK, monthLabel, round } from "./format";
import { resolvePeriod } from "./periods";

/** A transaction as exposed to the answer router (for list answers). */
export interface AskTx {
  type: "income" | "expense" | "transfer";
  amount: number;
  date: Date | string;
  description?: string;
  category?: string;
  account?: string;
}

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
  /** Active analysis-page period filter (Ask answers against it too). */
  filter?: {
    key: string;
    label: string;
    start: Date | string;
    end: Date | string;
    flows: FlowTotals;
  };
  /** Recent transactions backing list/detail answers. */
  recent?: AskTx[];
}

export interface AskAnswer {
  answer: string;
  data: Record<string, unknown>;
  /** Follow-up chips rendered under the reply (GPT-style). */
  suggestions?: string[];
}

export interface QuestionAnalysis {
  intent: Intent | null;
  period: PeriodKey | null;
  amount: number;
  financial: boolean;
}

type Intent =
  | "greeting"
  | "help"
  | "affordability"
  | "list"
  | "spending"
  | "income"
  | "goals"
  | "budgets"
  | "upcoming"
  | "savings"
  | "balance";

type PeriodKey = "today" | "yesterday" | "week" | "month" | "day";

/* ── text helpers ─────────────────────────────────────────── */

function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function has(q: string, ...words: string[]): boolean {
  return words.some((word) => q.includes(word));
}

function parseAmount(q: string): number {
  // "2k" / "2,000k" style first…
  const withSuffix = q.match(/(\d[\d,]*)\s*k\b/);
  if (withSuffix) return parseInt(withSuffix[1].replace(/,/g, ""), 10) * 1000;
  // …then plain "K5,000" / "5000".
  const plain = q.match(/k?\s*(\d[\d,]*)/);
  return plain ? parseInt(plain[1].replace(/,/g, ""), 10) : 0;
}

function tokens(q: string): string[] {
  return q.split(/[^a-z0-9]+/).filter(Boolean);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** Typo-tolerant word match: "yestadays" ≈ "yesterday", "mnth" ≈ "month". */
function fuzzyWord(token: string, word: string): boolean {
  if (token === word) return true;
  const tolerance = word.length >= 7 ? 2 : word.length >= 5 ? 1 : 1;
  return (
    token.length >= 3 &&
    Math.abs(token.length - word.length) <= tolerance &&
    editDistance(token, word) <= tolerance
  );
}

/**
 * Period from the question, typo-tolerant: today | yesterday | week | month.
 * Possessives ("yesterday's") tokenize cleanly because apostrophes split.
 */
export function periodOf(question: string): PeriodKey | null {
  for (const token of tokens(normalize(question))) {
    // "last night" means yesterday — check before the fuzzy tonight match,
    // which would otherwise pull "night" toward "tonight" → today.
    if (token === "night") return "yesterday";
    if (fuzzyWord(token, "today") || fuzzyWord(token, "tonight")) return "today";
    if (fuzzyWord(token, "yesterday")) return "yesterday";
    if (fuzzyWord(token, "week") || fuzzyWord(token, "weekend")) return "week";
    if (fuzzyWord(token, "month")) return "month";
    if (fuzzyWord(token, "daily")) return "today";
  }
  return null;
}

function intentOf(question: string): Intent | null {
  const q = question;
  const words = q.split(" ").length;

  if (has(q, "what can you ask", "what can i ask", "what should i ask", "who are you", "what do you do") ||
      (q === "help" || q === "menu")) {
    return "help";
  }
  if (has(q, "can i afford", "can i buy", "should i buy", "can i purchase", "afford")) {
    return "affordability";
  }
  if (
    has(
      q,
      "list",
      "show me",
      "show my",
      "show us",
      "break down",
      "breakdown",
      "itemise",
      "itemize",
      "which ones",
      "each transaction",
      "every transaction",
      "what did i buy",
      "what have i bought",
      "go through",
      "detail"
    ) &&
    // "show my balance" is a balance question, not an itemised list.
    !has(q, "balance", "money do i have", "net worth")
  ) {
    return "list";
  }
  if (has(q, "spend", "spent", "spending", "expense", "buy", "bought", "purchased", "cost me", "outgoing")) {
    return "spending";
  }
  if (has(q, "income", "earn", "earning", "salary", "made", "make", "revenue", "money in")) {
    return "income";
  }
  if (has(q, "goal", "target")) return "goals";
  if (has(q, "budget")) return "budgets";
  if (has(q, "upcoming", "coming up", "due", "owe", "reminder", "bill")) return "upcoming";
  if (has(q, "save", "saving", "savings")) return "savings";
  if (has(q, "balance", "how much", "money do i have", "account", "how rich")) return "balance";
  // Greetings only win when nothing else matched — "hey, list my spending"
  // must still be a list request.
  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b/.test(q) && words <= 4) {
    return "greeting";
  }
  return null;
}

function isFinancialQuestion(question: string): boolean {
  return has(
    question,
    "money",
    "finance",
    "financial",
    "spend",
    "spent",
    "expense",
    "income",
    "salary",
    "budget",
    "saving",
    "savings",
    "goal",
    "balance",
    "account",
    "bill",
    "owe",
    "cash flow",
    "net worth",
    "afford"
  );
}

export function classifyQuestion(question: string): QuestionAnalysis {
  const normalized = normalize(question);
  return {
    intent: intentOf(normalized),
    period: periodOf(normalized),
    amount: parseAmount(normalized),
    financial: isFinancialQuestion(normalized),
  };
}

/** Suggested follow-up chips per intent (rendered under the reply). */
const SUGGESTIONS: Record<Intent, string[]> = {
  greeting: ["What did I spend today?", "What's my balance?", "What's coming up?"],
  help: ["What did I spend today?", "Can I afford K5,000?", "How are my goals?"],
  affordability: ["What's coming up?", "How are my goals?", "What's my balance?"],
  list: ["What about this week?", "What's my balance?", "What's coming up?"],
  spending: ["List yesterday's spending", "What about this week?", "What's my balance?"],
  income: ["What did I spend this month?", "What's my balance?", "How are my goals?"],
  goals: ["What's my savings rate?", "What's my balance?", "What's coming up?"],
  budgets: ["What did I spend this month?", "What's my balance?", "How are my goals?"],
  upcoming: ["What's my balance?", "Can I afford K1,000?", "What did I spend this week?"],
  savings: ["What did I spend this month?", "How are my goals?", "What's my balance?"],
  balance: ["What did I spend today?", "What's coming up?", "How are my goals?"],
};

const MENU = [
  "What did I spend today?",
  "List my spending yesterday",
  "Can I afford K5,000?",
  "How are my savings goals?",
  "What's my budget status?",
  "What's coming up?",
];

/* ── period-scoped answers ────────────────────────────────── */

interface ResolvedWindow {
  key: PeriodKey;
  label: string;
  start: Date;
  end: Date;
  flows: FlowTotals;
  /** True when the window is the current month (pace math is valid). */
  isCurrentMonth: boolean;
}

/**
 * The window an answer should speak about:
 *  1. an explicit period in the question (or one inherited from history),
 *  2. else the page's active filter — with its real referenced window,
 *  3. else this month.
 * When the explicit period matches the filter's key the filter wins, so
 * "this week" means the week the user actually has selected.
 */
function resolveWindow(period: PeriodKey | null, snapshot: AskSnapshot): ResolvedWindow {
  const filter = snapshot.filter;
  if (filter && (period === null || filter.key === period)) {
    return {
      key: filter.key as PeriodKey,
      label: filter.label,
      start: new Date(filter.start),
      end: new Date(filter.end),
      flows: filter.flows,
      isCurrentMonth:
        filter.key === "month" && filter.label === monthLabel(snapshot.now),
    };
  }
  const key = period === "day" || period === null ? "month" : period;
  const range = resolvePeriod(key, null, snapshot.now);
  return {
    key,
    label: range.label,
    start: range.start,
    end: range.end,
    flows: snapshot.periods[key],
    isCurrentMonth: key === "month",
  };
}

/** Natural phrasing for a resolved window ("today" / "in Week of 1 Sep"). */
function spendPhrase(win: ResolvedWindow): string {
  if (win.key === "today") return "today";
  if (win.key === "yesterday") return "yesterday";
  if (win.key === "week") return win.label === "This week" ? "this week" : `in ${win.label}`;
  if (win.key === "month") return win.isCurrentMonth ? "this month" : `in ${win.label}`;
  if (win.key === "day") return `on ${win.label}`;
  return `in ${win.label}`;
}

function spendAnswer(period: PeriodKey | null, snapshot: AskSnapshot): AskAnswer {
  const win = resolveWindow(period, snapshot);
  const { month } = snapshot;
  const flows = win.flows;
  const total = flows.expenses;

  if (win.key === "yesterday") {
    return {
      answer:
        total > 0
          ? `You spent ${formatK(total)} yesterday across ${flows.expenseCount} expense(s).`
          : "You didn't record any spending yesterday.",
      data: { period: "yesterday", expenses: total },
      suggestions: SUGGESTIONS.spending,
    };
  }

  if (win.key === "today") {
    return {
      answer:
        total > 0
          ? `You've spent ${formatK(total)} today across ${flows.expenseCount} expense(s).`
          : "You haven't recorded any spending today.",
      data: { period: "today", expenses: total },
      suggestions: SUGGESTIONS.spending,
    };
  }

  if (win.key === "week") {
    const isCurrent = win.label === "This week";
    return {
      answer:
        total > 0
          ? `You've spent ${formatK(total)} ${isCurrent ? "so far this week" : `in ${win.label}`}.`
          : `You haven't recorded any spending ${isCurrent ? "this week" : `in ${win.label}`}.`,
      data: { period: "week", expenses: total },
      suggestions: SUGGESTIONS.spending,
    };
  }

  if (win.key === "month" && win.isCurrentMonth) {
    const top = [...snapshot.categoriesThisMonth].sort((a, b) => b.total - a.total)[0];
    const topText = top ? ` Your biggest category is ${top.name} at ${formatK(top.total)}.` : "";
    if (period === null && !snapshot.filter) {
      // No period mentioned and no active filter — keep the light phrasing.
      return {
        answer: `You've spent ${formatK(total)} this month.${topText}`,
        data: { period: "month", expenses: total },
        suggestions: SUGGESTIONS.spending,
      };
    }
    return {
      answer: `You've spent ${formatK(total)} so far this month. At your current rate of K${Math.round(month.dailySpendRate)}/day, you'll spend about ${formatK(month.projectedMonthEnd)} by month-end.${topText}`,
      data: {
        period: "month",
        expenses: total,
        dailyRate: month.dailySpendRate,
        projected: month.projectedMonthEnd,
        categorySpending: Object.fromEntries(
          snapshot.categoriesThisMonth.map((c) => [c.name, c.total])
        ),
      },
      suggestions: SUGGESTIONS.spending,
    };
  }

  // Past month or an arbitrary window — plain totals for that window.
  return {
    answer: `You've spent ${formatK(total)} ${spendPhrase(win)}.`,
    data: { period: win.key, expenses: total },
    suggestions: SUGGESTIONS.spending,
  };
}

/**
 * LIST intent: itemise real transactions for the resolved window.
 * "list my yesterday's spendings" → per-entry lines + total, not a flat total.
 */
function listAnswer(
  question: string,
  snapshot: AskSnapshot,
  period: PeriodKey | null
): AskAnswer {
  const win = resolveWindow(period, snapshot);
  const phrase = spendPhrase(win);

  const wantIncome = has(question, "income", "earn", "salary", "received", "money in", "deposited");
  const kind = wantIncome ? "income" : "expense";

  const entries = (snapshot.recent || [])
    .filter((tx) => {
      if (tx.type !== kind) return false;
      const time = new Date(tx.date).getTime();
      return time >= win.start.getTime() && time <= win.end.getTime();
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = entries.reduce((sum, tx) => sum + tx.amount, 0);

  if (entries.length === 0) {
    const noun = wantIncome ? "income" : "spending";
    return {
      answer: `You don't have any ${noun} recorded ${phrase}.`,
      data: { mode: "list", period: win.key, count: 0, total: 0 },
      suggestions: SUGGESTIONS.list,
    };
  }

  const shown = entries.slice(0, 10);
  const lines = shown.map((tx) => {
    const name = (tx.description || "").trim() || tx.category || tx.account || "Untitled";
    const bracket =
      tx.category && tx.description && tx.category.toLowerCase() !== name.toLowerCase()
        ? ` (${tx.category})`
        : "";
    return `• ${formatK(tx.amount)} — ${name}${bracket} · ${formatDayMonth(new Date(tx.date))}`;
  });

  const heading = wantIncome
    ? `Here's your income ${phrase} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"} totalling ${formatK(total)}:`
    : `Here's your spending ${phrase} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"} totalling ${formatK(total)}:`;

  const more =
    entries.length > shown.length
      ? `\n…and ${entries.length - shown.length} more (not shown).`
      : "";

  return {
    answer: `${heading}\n${lines.join("\n")}${more}`,
    data: {
      mode: "list",
      period: win.key,
      count: entries.length,
      total,
      entries: shown.map((tx) => ({
        amount: tx.amount,
        date: new Date(tx.date).toISOString(),
        description: tx.description || null,
        category: tx.category || null,
      })),
    },
    suggestions: SUGGESTIONS.list,
  };
}

/* ── fixed-topic answers ──────────────────────────────────── */

function goalAnswer(snapshot: AskSnapshot): AskAnswer {
  if (snapshot.goals.length === 0) {
    return {
      answer: "You don't have any active savings goals yet. Would you like to create one?",
      data: { goals: 0 },
      suggestions: SUGGESTIONS.goals,
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
    suggestions: SUGGESTIONS.goals,
  };
}

function budgetAnswer(snapshot: AskSnapshot): AskAnswer {
  if (snapshot.budgets.length === 0) {
    return {
      answer:
        "You don't have any budgets set up yet. Create one to start tracking spending limits.",
      data: { budgetCount: 0 },
      suggestions: SUGGESTIONS.budgets,
    };
  }

  const withLimits = snapshot.budgets.filter((budget) => !!budget.amount);

  if (withLimits.length === 0) {
    return {
      answer: `You have ${snapshot.budgets.length} shopping-list budget(s) with checked items tracked against them. No category-limit budgets yet.`,
      data: { budgetCount: snapshot.budgets.length },
      suggestions: SUGGESTIONS.budgets,
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
    suggestions: SUGGESTIONS.budgets,
  };
}

function upcomingAnswer(snapshot: AskSnapshot): AskAnswer {
  const { items, total } = snapshot.committed;
  if (items.length === 0) {
    return {
      answer: "You have no upcoming obligations. You're all clear!",
      data: { reminderCount: 0 },
      suggestions: SUGGESTIONS.upcoming,
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
    suggestions: SUGGESTIONS.upcoming,
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
    suggestions: SUGGESTIONS.savings,
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
    suggestions: SUGGESTIONS.balance,
  };
}

function incomeAnswer(snapshot: AskSnapshot): AskAnswer {
  return {
    answer: `You've earned ${formatK(snapshot.month.income)} this month. You also have ${formatK(
      snapshot.expectedIncome
    )} in expected income.`,
    data: { monthIncome: snapshot.month.income, expected: snapshot.expectedIncome },
    suggestions: SUGGESTIONS.income,
  };
}

/** A ready-to-render welcome reply (also used by the chat UI on mount). */
export function greetingAnswer(): AskAnswer {
  return {
    answer:
      "Ask me anything — spending, balances, bills, or goals.",
    data: { intent: "greeting" },
    suggestions: SUGGESTIONS.greeting,
  };
}

function helpAnswer(): AskAnswer {
  return {
    answer: `Here's what I can answer:\n${MENU.map((item) => `• ${item}`).join("\n")}\n\nI follow this conversation — you can follow up with things like "and this week?" or "list them instead".`,
    data: { intent: "help", menu: MENU },
    suggestions: SUGGESTIONS.help,
  };
}

function clarificationAnswer(): AskAnswer {
  return {
    answer: "Which period should I use: today, this week, or this month?",
    data: { intent: "spending", status: "needs_input", missing: "period" },
    suggestions: ["What did I spend today?", "What did I spend this week?", "What did I spend this month?"],
  };
}

function outOfScopeAnswer(): AskAnswer {
  return {
    answer:
      "I can help with your Coffers finances, but I can't answer general-world questions. Try asking about spending, income, balances, budgets, goals, savings, upcoming bills, or affordability.",
    data: { intent: "out_of_scope", status: "out_of_scope" },
    suggestions: SUGGESTIONS.help,
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
    suggestions: MENU,
  };
}

/* ── router ───────────────────────────────────────────────── */

/**
 * Route a natural-language question to an engine-built answer.
 *
 * @param history Previous user questions, oldest first. Used when the new
 *                question is a follow-up with no intent of its own — so
 *                "What did I spend today?" → "and this week?" keeps
 *                answering about spending.
 *
 * Branch order matters: spending questions must beat the generic
 * "how much …" balance match ("How much did I spend today?" is spending).
 */
export function answerQuestion(
  question: string,
  snapshot: AskSnapshot,
  history: string[] = []
): AskAnswer {
  const q = normalize(question);

  const analysis = classifyQuestion(q);
  let intent = analysis.intent;
  let period = analysis.period;

  // Conversation context: a bare follow-up inherits the previous turn.
  const previous = history.length > 0 ? normalize(history[history.length - 1]) : null;
  if (previous) {
    if (intent === null) intent = intentOf(previous);
    if (period === null) period = periodOf(previous);
  }

  if (intent === "greeting") return greetingAnswer();
  if (intent === "help") return helpAnswer();

  if (intent === null && !analysis.financial) return outOfScopeAnswer();

  switch (intent) {
    case "affordability": {
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
              suggestions: SUGGESTIONS.affordability,
            }
          : {
              answer: `You don't have enough. That purchase of ${formatK(amount)} exceeds your available balance of ${formatK(
                total
              )} by ${formatK(Math.abs(afterPurchase))}.`,
              data: { amount, afterPurchase, netPosition },
              suggestions: SUGGESTIONS.affordability,
            };
      }
      return {
        answer:
          "I couldn't detect an amount in your question. Try asking 'Can I afford K5,000?'",
        data: {},
        suggestions: SUGGESTIONS.affordability,
      };
    }

    case "list":
      return listAnswer(q, snapshot, period);

    case "spending":
      if (period === null && !snapshot.filter) return clarificationAnswer();
      return spendAnswer(period, snapshot);

    case "income":
      return incomeAnswer(snapshot);

    case "goals":
      return goalAnswer(snapshot);

    case "budgets":
      return budgetAnswer(snapshot);

    case "upcoming":
      return upcomingAnswer(snapshot);

    case "savings":
      return savingsAnswer(snapshot);

    case "balance":
      return balanceAnswer(snapshot);

    default:
      return snapshotAnswer(snapshot);
  }
}
