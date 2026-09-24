import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCategoryShares,
  buildOverviewInsights,
  buildPeriodAnalysis,
  metricsFrom,
  percentChange,
  type OverviewInsightInput,
} from "../lib/finance/analysis";
import type { FlowTotals, PeriodInsight, PeriodRange } from "../lib/finance/types";

function flows(partial: Partial<FlowTotals>): FlowTotals {
  return { income: 0, expenses: 0, count: 0, incomeCount: 0, expenseCount: 0, ...partial };
}

function input(overrides: Partial<OverviewInsightInput>): OverviewInsightInput {
  return {
    label: "This week",
    prevLabel: "Last week",
    current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 400, expenseCount: 4 }), 200),
    previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 400, expenseCount: 4 }), 100),
    categories: [],
    progress: 1,
    totalBalance: null,
    committedSoon: 0,
    ...overrides,
  };
}

function find(insights: PeriodInsight[], id: string): PeriodInsight | undefined {
  return insights.find((insight) => insight.id === id);
}

test("metrics derive net, savings rate and average transaction", () => {
  const metrics = metricsFrom(
    flows({ income: 1000, incomeCount: 2, expenses: 400, expenseCount: 4 }),
    250
  );
  assert.equal(metrics.net, 600);
  assert.equal(metrics.savingsRate, 25);
  assert.equal(metrics.avgTransaction, 100);
});

test("percent change returns 0 without a meaningful baseline", () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(10, 0), 0);
  assert.equal(percentChange(10, -5), 0);
});

test("category shares are sorted and total 100%", () => {
  const shares = buildCategoryShares([
    { categoryId: "b", name: "Transport", total: 25, count: 1 },
    { categoryId: "a", name: null, total: 75, count: 3 },
  ]);
  assert.equal(shares[0].name, "Other"); // unnamed categories become "Other"
  assert.equal(shares[0].percentage, 75);
  assert.equal(shares[1].name, "Transport");
  assert.equal(shares[1].percentage, 25);
});

test("an empty period produces the no-activity insight", () => {
  const insights = buildOverviewInsights(
    input({
      current: metricsFrom(flows({}), 0),
      previous: metricsFrom(flows({}), 0),
    })
  );
  assert.equal(insights[0].id, "no-activity");
});

test("spending changes against the previous window are called out", () => {
  const up = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1200, expenseCount: 5 }), 0),
      previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1000, expenseCount: 5 }), 0),
    })
  );
  const upInsight = find(up, "expense-up");
  assert.ok(upInsight, "expected expense-up");
  assert.equal(upInsight!.tone, "negative");
  assert.match(upInsight!.text, /20%/);
  assert.match(upInsight!.text, /Last week/);

  const down = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 800, expenseCount: 4 }), 0),
      previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1000, expenseCount: 5 }), 0),
    })
  );
  const downInsight = find(down, "expense-down");
  assert.ok(downInsight, "expected expense-down");
  assert.equal(downInsight!.tone, "positive");
});

test("a deficit beats the savings-rate rule", () => {
  const insights = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 500, incomeCount: 1, expenses: 800, expenseCount: 3 }), 0),
      previous: metricsFrom(flows({}), 0),
    })
  );
  assert.ok(find(insights, "deficit"));
  assert.equal(find(insights, "savings-good"), undefined);
  assert.equal(find(insights, "savings-low"), undefined);
});

test("savings rate thresholds sit at 20% and below 10%", () => {
  const good = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 400, expenseCount: 2 }), 250),
      previous: metricsFrom(flows({}), 0),
    })
  );
  assert.equal(find(good, "savings-good")?.tone, "positive");

  const low = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 950, expenseCount: 5 }), 50),
      previous: metricsFrom(flows({}), 0),
    })
  );
  assert.equal(find(low, "savings-low")?.tone, "warning");
});

test("commitments larger than the balance raise the buffer warning", () => {
  const insights = buildOverviewInsights(input({ totalBalance: 3000, committedSoon: 5000 }));
  const buffer = find(insights, "balance-buffer");
  assert.ok(buffer, "expected balance-buffer");
  assert.equal(buffer!.tone, "warning");
  assert.match(buffer!.text, /K5,000/);
  assert.match(buffer!.text, /K3,000/);
});

test("mid-window pace projects against the previous window", () => {
  const worse = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 600, expenseCount: 3 }), 0),
      previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1000, expenseCount: 5 }), 0),
      progress: 0.5,
    })
  );
  const pace = find(worse, "pace-up");
  assert.ok(pace, "expected pace-up");
  assert.match(pace!.text, /K1,200/); // 600 ÷ 0.5
  assert.match(pace!.text, /Last week/);

  const better = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 400, expenseCount: 2 }), 0),
      previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1000, expenseCount: 5 }), 0),
      progress: 0.5,
    })
  );
  assert.ok(find(better, "pace-down"), "expected pace-down"); // projects 800 vs 1000
  assert.equal(find(worse, "pace-down"), undefined);
});

test("a concentrated category is called out", () => {
  const insights = buildOverviewInsights(
    input({
      categories: buildCategoryShares([
        { categoryId: "a", name: "Rent", total: 40, count: 1 },
        { categoryId: "b", name: "Food", total: 60, count: 3 },
      ]),
    })
  );
  const top = find(insights, "top-category");
  assert.ok(top, "expected top-category");
  assert.match(top!.text, /Food/);
  assert.match(top!.text, /60%/);
});

test("the insight list stays capped and warnings come first", () => {
  const insights = buildOverviewInsights(
    input({
      current: metricsFrom(flows({ income: 500, incomeCount: 1, expenses: 4000, expenseCount: 10 }), 0),
      previous: metricsFrom(flows({ income: 1000, incomeCount: 1, expenses: 1000, expenseCount: 5 }), 500),
      categories: buildCategoryShares([
        { categoryId: "a", name: "Rent", total: 3500, count: 1 },
        { categoryId: "b", name: "Food", total: 500, count: 9 },
      ]),
      progress: 0.5,
      totalBalance: 1000,
      committedSoon: 8000,
    })
  );

  assert.ok(insights.length <= 6, `got ${insights.length} insights`);
  const ids = insights.map((insight) => insight.id);
  assert.ok(ids.includes("expense-up"));
  assert.ok(ids.includes("deficit"));
  assert.ok(ids.includes("balance-buffer"));
  // Balance risk must never be squeezed out by trivia
  assert.ok(
    ids.indexOf("balance-buffer") < ids.indexOf("top-category"),
    "balance warning should rank above concentration trivia"
  );
});

function fixtureRange(): PeriodRange {
  return {
    key: "month",
    requested: "month",
    label: "September 2026",
    prevLabel: "August 2026",
    start: new Date(2026, 8, 1),
    end: new Date(2026, 8, 30, 23, 59, 59, 999),
    prevStart: new Date(2026, 7, 1),
    prevEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    progress: 0.75,
  };
}

test("buildPeriodAnalysis wires metrics, changes and insights together", () => {
  const analysis = buildPeriodAnalysis({
    range: fixtureRange(),
    current: flows({ income: 4000, incomeCount: 1, expenses: 3000, expenseCount: 10 }),
    previous: flows({ income: 5000, incomeCount: 1, expenses: 2500, expenseCount: 8 }),
    currentSavings: 800,
    previousSavings: 1000,
    categories: [{ categoryId: "a", name: "Food", total: 3000, count: 10 }],
    totalBalance: 20000,
    committedSoon: 1500,
  });

  assert.equal(analysis.period.label, "September 2026");
  assert.equal(analysis.current.savings, 800);
  assert.equal(analysis.current.savingsRate, 20);
  assert.equal(analysis.changes.income, -20);
  assert.equal(analysis.changes.expenses, 20);
  assert.equal(analysis.categoryBreakdown[0].percentage, 100);
  assert.deepEqual(analysis.insights, analysis.insightsDetailed.map((insight) => insight.text));
  assert.ok(find(analysis.insightsDetailed, "expense-up")); // +20% vs August
  assert.ok(find(analysis.insightsDetailed, "savings-good")); // exactly 20%
});
