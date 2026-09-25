import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, type AskSnapshot } from "../lib/finance/answers";
import type { FlowTotals } from "../lib/finance/types";

function flows(partial: Partial<FlowTotals>): FlowTotals {
  return { income: 0, expenses: 0, count: 0, incomeCount: 0, expenseCount: 0, ...partial };
}

// Fixed clock: Thursday 24 September 2026, noon
const NOW = new Date(2026, 8, 24, 12, 0, 0, 0);

function snapshot(): AskSnapshot {
  return {
    now: NOW,
    name: "Amos Banda",
    balance: {
      total: 15000,
      accounts: [
        { name: "Cash", balance: 5000 },
        { name: "Bank", balance: 10000 },
      ],
    },
    expectedIncome: 2000,
    committed: {
      total: 1500,
      items: [{ title: "Rent", amount: 1500, dueDate: new Date(2026, 9, 1) }],
    },
    periods: {
      today: flows({ expenses: 120, expenseCount: 2 }),
      yesterday: flows({ expenses: 300, expenseCount: 1 }),
      week: flows({ expenses: 900, expenseCount: 5 }),
      month: flows({ income: 5000, incomeCount: 1, expenses: 2400, expenseCount: 12 }),
    },
    prevDay: flows({ expenses: 80, expenseCount: 1 }),
    prevWeek: flows({ expenses: 600, expenseCount: 4 }),
    prevMonth: flows({ income: 4200, incomeCount: 1, expenses: 2100, expenseCount: 11 }),
    categoriesThisMonth: [
      { name: "Food", total: 900 },
      { name: "Transport", total: 500 },
    ],
    goals: [
      { name: "Trip", targetAmount: 10000, currentAmount: 2500, monthlyContribution: 500 },
    ],
    budgets: [{ name: "Groceries", amount: 1000, spent: 750 }],
    month: {
      income: 5000,
      expenses: 2400,
      dayOfMonth: 24,
      daysInMonth: 30,
      dailySpendRate: 100,
      projectedMonthEnd: 3000,
    },
  };
}

test("spending questions answer for today", () => {
  const result = answerQuestion("How much did I spend today?", snapshot());
  assert.match(result.answer, /K120 today/);
  assert.equal(result.data.period, "today");
  assert.equal(result.data.expenses, 120);
});

test("spending questions answer for yesterday", () => {
  const result = answerQuestion("What did I spend yesterday?", snapshot());
  assert.match(result.answer, /K300 yesterday/);
  assert.equal(result.data.period, "yesterday");
});

test("spending questions answer for this week", () => {
  const result = answerQuestion("What did I spend this week?", snapshot());
  assert.match(result.answer, /K900 so far this week/);
  assert.equal(result.data.period, "week");
});

test("follow-up questions inherit the previous finance topic", () => {
  const result = answerQuestion("and this week?", snapshot(), ["What did I spend today?"]);
  assert.match(result.answer, /K900 so far this week/);
  assert.equal(result.data.period, "week");
});

test("spending questions answer for this month with pace and top category", () => {
  const result = answerQuestion("What did I spend this month?", snapshot());
  assert.match(result.answer, /K2,400 so far this month/);
  assert.match(result.answer, /K100\/day/);
  assert.match(result.answer, /K3,000 by month-end/);
  assert.match(result.answer, /Food at K900/);
});

test("an empty day reads naturally instead of showing zeros", () => {
  const empty = snapshot();
  empty.periods.today = flows({});
  const result = answerQuestion("What did I spend today?", empty);
  assert.match(result.answer, /haven't recorded any spending today/);
});

test('"how much did I spend" routes to spending, not balance', () => {
  // Regression: the balance branch used to swallow this question first.
  const result = answerQuestion("How much did I spend today?", snapshot());
  assert.equal(result.data.period, "today");
  assert.doesNotMatch(result.answer, /expected income/);
});

test("balance questions report balance, expected income and commitments", () => {
  const result = answerQuestion("How much do I have?", snapshot());
  assert.match(result.answer, /K15,000/);
  assert.match(result.answer, /K2,000 in expected income/);
  assert.match(result.answer, /K1,500 in upcoming committed expenses/);
  assert.equal(result.data.balance, 15000);
});

test("affordability questions parse amounts with thousands separators", () => {
  const yes = answerQuestion("Can I afford K5,000?", snapshot());
  assert.match(yes.answer, /Yes, you can afford K5,000/);
  assert.match(yes.answer, /K15,000 to K10,000/);
  assert.equal(yes.data.afterPurchase, 10000);

  const no = answerQuestion("Can I afford K20,000?", snapshot());
  assert.match(no.answer, /You don't have enough/);
  assert.match(no.answer, /by K5,000/);
  assert.equal(no.data.afterPurchase, -5000);
});

test("a missing amount asks for clarification instead of guessing", () => {
  const result = answerQuestion("Can I afford a holiday?", snapshot());
  assert.match(result.answer, /couldn't detect an amount/);
});

test("goal questions list progress and timeline", () => {
  const result = answerQuestion("How are my savings goals?", snapshot());
  assert.match(result.answer, /1 active goal/);
  assert.match(result.answer, /Trip/);
  assert.match(result.answer, /25% complete/);
  assert.match(result.answer, /~15 months to go/);
});

test("budget questions report spent versus limit", () => {
  const result = answerQuestion("What's my budget status?", snapshot());
  assert.match(result.answer, /K750 of K1,000 \(75%\)/);
});

test("upcoming questions list obligations with totals", () => {
  const result = answerQuestion("What's coming up?", snapshot());
  assert.match(result.answer, /totalling K1,500/);
  assert.match(result.answer, /Rent/);
  assert.match(result.answer, /due in 7 days/);
});

test("savings questions report the rate with a verdict", () => {
  const result = answerQuestion("What's my savings rate?", snapshot());
  assert.match(result.answer, /52%/); // (5000 − 2400) ÷ 5000
  assert.match(result.answer, /healthy rate/);
});

test("income questions answer this month's earnings", () => {
  const result = answerQuestion("How much did I make?", snapshot());
  assert.match(result.answer, /K5,000 this month/);
  assert.match(result.answer, /K2,000 in expected income/);
  assert.equal(result.data.monthIncome, 5000);
});

test("general financial questions receive a snapshot", () => {
  const result = answerQuestion("How is my financial situation?", snapshot());
  assert.match(result.answer, /Balance: K15,000/);
  assert.match(result.answer, /September 2026/);
});

test("spending questions without a period ask for clarification", () => {
  const result = answerQuestion("How much did I spend?", snapshot());
  assert.match(result.answer, /Which period/);
  assert.equal(result.data.status, "needs_input");
});

test("unrelated questions are explicitly out of scope", () => {
  const result = answerQuestion("What's the weather like?", snapshot());
  assert.match(result.answer, /Coffers finances/);
  assert.equal(result.data.status, "out_of_scope");
});

test("answers are deterministic for the same snapshot", () => {
  const first = answerQuestion("What did I spend today?", snapshot());
  const second = answerQuestion("What did I spend today?", snapshot());
  assert.deepEqual(first, second);
});

test("greetings are greeted back with time, name and a live number", () => {
  const result = answerQuestion("Hi", snapshot());
  assert.match(result.answer, /Afternoon, Amos/); // fixed clock is noon
  assert.match(result.answer, /K15,000 available/);
  assert.match(result.answer, /K120 spent today/);
});

test("a greeting without a name still reads naturally", () => {
  const anonymous = snapshot();
  delete anonymous.name;
  const result = answerQuestion("Hello", anonymous);
  assert.match(result.answer, /^Afternoon 👋/);
});

test("thank-you messages get a friendly reply", () => {
  const result = answerQuestion("Thanks!", snapshot());
  assert.match(result.answer, /Happy to help/);
  assert.notEqual(result.data.intent, "out_of_scope");
});

test("small talk answers with real numbers, not out-of-scope", () => {
  const result = answerQuestion("How are you?", snapshot());
  assert.match(result.answer, /K15,000 available/);
  assert.match(result.answer, /52% savings rate/);
  assert.doesNotMatch(result.answer, /Coffers finances/);
});

test("farewells are answered warmly", () => {
  const result = answerQuestion("Bye", snapshot());
  assert.match(result.answer, /See you/);
});

test("comparisons measure the window against the one before it", () => {
  const result = answerQuestion("Did I spend more this week than last week?", snapshot());
  assert.match(result.answer, /K900/);
  assert.match(result.answer, /K300 more than the week before/);
  assert.match(result.answer, /50% up/);
});

test("comparisons can be answered for income too", () => {
  const result = answerQuestion("Did I earn more this month than last month?", snapshot());
  assert.match(result.answer, /earned K5,000/);
});

test("category questions break spending down by category", () => {
  const top = answerQuestion("Where did I spend the most?", snapshot());
  assert.match(top.answer, /Food K900 \(38%\)/);

  const named = answerQuestion("How much did I spend on food?", snapshot());
  assert.match(named.answer, /Food: K900 this month/);
  assert.match(named.answer, /38%/);
});

test("health checks return a short report card", () => {
  const result = answerQuestion("How am I doing?", snapshot());
  assert.match(result.answer, /Balance: K15,000/);
  assert.match(result.answer, /you kept 52%/);
  assert.match(result.answer, /On track/);
});

test("a bare period still answers as spending after small talk", () => {
  const result = answerQuestion("and this week?", snapshot(), ["Thanks!"]);
  assert.match(result.answer, /K900 so far this week/);
});
