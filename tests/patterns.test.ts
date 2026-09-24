import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPatterns, type PatternTransaction } from "../lib/finance/patterns";

// Fixed clock: 24 September 2026, noon
const NOW = new Date(2026, 8, 24, 12, 0, 0, 0);

const transactions: PatternTransaction[] = [
  // Income — two paydays for the payday pattern
  { type: "income", amount: 3000, date: new Date(2026, 8, 1, 8), description: "Salary" },
  { type: "income", amount: 3000, date: new Date(2026, 7, 1, 8), description: "Salary" },
  // Recurring rent (monthly, 31-day gaps)
  { type: "expense", amount: 800, date: new Date(2026, 6, 25, 10), description: "Rent" },
  { type: "expense", amount: 800, date: new Date(2026, 7, 25, 10), description: "Rent" },
  // Recurring electricity (weekly) — last paid long ago, so overdue
  { type: "expense", amount: 100, date: new Date(2026, 6, 1, 10), description: "Electricity" },
  { type: "expense", amount: 100, date: new Date(2026, 6, 8, 10), description: "Electricity" },
  // Food: last month vs this month → category change
  {
    type: "expense",
    amount: 300,
    date: new Date(2026, 7, 3, 12),
    description: "Groceries",
    categoryId: { _id: "cat-food", name: "Food" },
  },
  {
    type: "expense",
    amount: 500,
    date: new Date(2026, 8, 2, 12),
    description: "Groceries",
    categoryId: { _id: "cat-food", name: "Food" },
  },
  // Spend just after payday + mid-month
  { type: "expense", amount: 400, date: new Date(2026, 8, 20, 12), description: "Transport" },
];

const result = detectPatterns(transactions, NOW);

test("detects recurring expenses with frequency, average and next date", () => {
  const rent = result.recurringExpenses.find((entry) => entry.description === "rent");
  assert.ok(rent, "expected rent to be recurring");
  assert.equal(rent!.count, 2);
  assert.equal(rent!.avgAmount, 800);
  assert.equal(rent!.frequency, "monthly");
  assert.equal(rent!.avgDaysBetween, 31);
  assert.ok(rent!.isUpcoming); // 25 Aug + 31d = 25 Sep, inside 7 days

  const electricity = result.recurringExpenses.find(
    (entry) => entry.description === "electricity"
  );
  assert.ok(electricity, "expected electricity to be recurring");
  assert.equal(electricity!.frequency, "weekly");
  assert.equal(electricity!.categoryName, "Unknown"); // no category set
});

test("the payday pattern quantifies early-month spending", () => {
  assert.equal(result.paydayPattern.detected, true);
  // 500 (2 Sep) + 300 (3 Aug) ÷ 2 paydays
  assert.equal(result.paydayPattern.avgFirst5Days, 400);
  // (400 transport + 800 rent) ÷ 2 paydays, ÷ 3 to normalise to ~5 days
  assert.equal(result.paydayPattern.avgRestOfMonth, 200);
  assert.match(result.paydayPattern.insight!, /100% more/);
});

test("spending trend compares the two most recent months", () => {
  assert.equal(result.spendingTrend.direction, "decreasing"); // Sep 900 < Aug 1100
  assert.deepEqual(
    result.spendingTrend.monthlyData.map((month) => month.month),
    ["2026-07", "2026-08", "2026-09"]
  );
  assert.deepEqual(
    result.spendingTrend.monthlyData.map((month) => month.total),
    [1000, 1100, 900]
  );
});

test("category changes flag the biggest riser versus last month", () => {
  assert.equal(result.categoryChanges.length, 1); // only Food has a category
  assert.equal(result.categoryChanges[0].name, "Food");
  assert.equal(result.categoryChanges[0].current, 500);
  assert.equal(result.categoryChanges[0].previous, 300);
  assert.equal(result.categoryChanges[0].change, 67);
});

test("overdue recurring expenses surface as forgotten", () => {
  assert.equal(result.forgottenExpenses.length, 1);
  assert.equal(result.forgottenExpenses[0].description, "electricity");
  assert.ok(result.forgottenExpenses[0].daysOverdue > 0);
});

test("health indicators summarise the tracked window", () => {
  // income 6000, expenses 3000 → 50% kept
  assert.equal(result.healthIndicators.savingsRate, 50);
  assert.equal(result.healthIndicators.spendingConsistency, "Improving");
  assert.equal(result.healthIndicators.categoryDiversification, "Concentrated");
  assert.equal(result.healthIndicators.recurringAwareness, "Tracking");
});

test("engine insights run in priority order with a stable text mirror", () => {
  assert.deepEqual(
    result.insightsDetailed.map((insight) => insight.id),
    ["savings-good", "trend-down", "forgotten", "recurring", "category-riser"]
  );
  assert.deepEqual(
    result.insights,
    result.insightsDetailed.map((insight) => insight.text)
  );
  // 3 recurring: rent 800/mo + electricity (weekly ≈ 400/mo) + groceries 400/mo
  assert.match(result.insights.join(" "), /K1,600/);
  assert.match(result.insights.join(" "), /overdue/);
});

test("detection is deterministic for the same input and clock", () => {
  const again = detectPatterns(transactions, NOW);
  assert.deepEqual(again, result);
});

test("a single transaction produces no false patterns", () => {
  const sparse = detectPatterns(
    [{ type: "expense", amount: 50, date: new Date(2026, 8, 20), description: "Snack" }],
    NOW
  );
  assert.equal(sparse.recurringExpenses.length, 0);
  assert.equal(sparse.paydayPattern.detected, false);
  assert.equal(sparse.spendingTrend.direction, "insufficient_data");
  assert.equal(sparse.forgottenExpenses.length, 0);
});
