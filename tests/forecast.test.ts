import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast, type ForecastInput } from "../lib/finance/forecast";

// Fixed clock: 15 September 2026, noon — exactly mid-month
const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);

function baseInput(): ForecastInput {
  return {
    now: NOW,
    transactions: [
      { date: new Date(2026, 8, 1, 9), type: "income", amount: 3000 },
      { date: new Date(2026, 8, 5, 12), type: "expense", amount: 500 },
      { date: new Date(2026, 8, 12, 12), type: "expense", amount: 500 },
      { date: new Date(2026, 8, 15, 9), type: "expense", amount: 500 },
    ],
    accounts: [
      { name: "Cash", type: "cash", currentBalance: 10000, monthIncome: 3000, monthExpense: 1500 },
    ],
    categories: [{ categoryId: "food", name: "Food", currentSpend: 1500 }],
    prevMonthExpenses: 2500,
  };
}

test("projects the month from the elapsed-day burn rate", () => {
  const output = buildForecast(baseInput());
  assert.equal(output.current.dayOfMonth, 15);
  assert.equal(output.current.daysInMonth, 30);
  assert.equal(output.current.daysRemaining, 15);
  assert.equal(output.current.income, 3000);
  assert.equal(output.current.expenses, 1500);
  assert.equal(output.current.dailySpendRate, 100); // 1500 ÷ 15
  assert.equal(output.current.dailyIncomeRate, 200);
  assert.equal(output.projected.expenses, 3000); // 100 × 30
  assert.equal(output.projected.income, 6000);
  assert.equal(output.projected.savings, 3000);
  assert.equal(output.projected.savingsRate, 50);
});

test("projects accounts from their real balance and their own pace", () => {
  const output = buildForecast(baseInput());
  const account = output.accountProjections[0];
  assert.equal(account.currentBalance, 10000);
  assert.equal(account.projectedMonthEnd, 11500); // +K150/day × 15 days left
});

test("weekly buckets clip to now and cover the whole month", () => {
  const output = buildForecast(baseInput());
  assert.equal(output.weeklyBreakdown.length, 5); // Sep starts on a Tuesday
  assert.deepEqual(output.weeklyBreakdown[0], { week: "Week 1", spending: 500, income: 3000 });
  assert.deepEqual(output.weeklyBreakdown[1], { week: "Week 2", spending: 500, income: 0 });
  assert.deepEqual(output.weeklyBreakdown[2], { week: "Week 3", spending: 500, income: 0 });
  assert.deepEqual(output.weeklyBreakdown[3], { week: "Week 4", spending: 0, income: 0 });
  assert.deepEqual(output.weeklyBreakdown[4], { week: "Week 5", spending: 0, income: 0 });
});

test("category projections sort by month-end size", () => {
  const output = buildForecast({
    ...baseInput(),
    categories: [
      { categoryId: "food", name: "Food", currentSpend: 600 },
      { categoryId: "rent", name: "Rent", currentSpend: 1200 },
    ],
  });
  assert.equal(output.categoryProjections[0].name, "Rent");
  assert.equal(output.categoryProjections[0].projectedMonthEnd, 2400); // K80/day × 30
  assert.equal(output.categoryProjections[0].dailyRate, 80);
  assert.equal(output.categoryProjections[1].projectedMonthEnd, 1200);
});

test("insights cover pace, projection vs last month and top category", () => {
  const output = buildForecast(baseInput());
  const ids = output.insightsDetailed.map((insight) => insight.id);
  assert.ok(ids.includes("pace"));
  assert.ok(ids.includes("projected-savings"));
  assert.ok(ids.includes("vs-last-month")); // 3000 projected vs 2500 last month = +20%
  assert.ok(ids.includes("top-projection"));

  const vs = output.insightsDetailed.find((insight) => insight.id === "vs-last-month");
  assert.match(vs!.text, /20%/);
  assert.match(vs!.text, /August 2026/);
  assert.deepEqual(output.insights, output.insightsDetailed.map((insight) => insight.text));
});

test("burning money produces an overspend warning and a runway", () => {
  const output = buildForecast({
    ...baseInput(),
    transactions: [{ date: new Date(2026, 8, 5, 12), type: "expense", amount: 1500 }],
    prevMonthExpenses: undefined,
  });

  assert.ok(output.projected.savings < 0);
  assert.equal(output.projected.savings, -3000);
  assert.equal(output.runwayDays, 100); // K10,000 ÷ K100/day burn

  const ids = output.insightsDetailed.map((insight) => insight.id);
  assert.ok(ids.includes("projected-overspend"));
  assert.ok(ids.includes("runway"));
  const runway = output.insightsDetailed.find((insight) => insight.id === "runway");
  assert.equal(runway!.tone, "neutral"); // 100 days of buffer is informative, not alarming
  assert.match(runway!.text, /100 day/);
});

test("a short runway turns into a warning", () => {
  const output = buildForecast({
    ...baseInput(),
    transactions: [{ date: new Date(2026, 8, 5, 12), type: "expense", amount: 1500 }],
    accounts: [
      { name: "Cash", type: "cash", currentBalance: 2000, monthIncome: 0, monthExpense: 1500 },
    ],
    prevMonthExpenses: undefined,
  });

  assert.equal(output.runwayDays, 20); // K2,000 ÷ K100/day burn
  const runway = output.insightsDetailed.find((insight) => insight.id === "runway");
  assert.equal(runway!.tone, "warning"); // inside 30 days
  assert.match(runway!.text, /20 day/);
});

test("a healthy balance with positive flow has no runway warning", () => {
  const output = buildForecast(baseInput());
  assert.equal(output.runwayDays, null);
  assert.equal(
    output.insightsDetailed.some((insight) => insight.id === "runway"),
    false
  );
});

test("day one of the month projects from the full month length", () => {
  const output = buildForecast({
    ...baseInput(),
    now: new Date(2026, 8, 1, 0, 30, 0, 0),
    transactions: [{ date: new Date(2026, 8, 1, 0), type: "expense", amount: 300 }],
    categories: [{ categoryId: "food", name: "Food", currentSpend: 300 }],
    prevMonthExpenses: undefined,
  });
  assert.equal(output.current.dayOfMonth, 1);
  assert.equal(output.current.dailySpendRate, 300);
  assert.equal(output.projected.expenses, 9000); // 300 × 30
  assert.equal(output.current.daysRemaining, 29);
});
