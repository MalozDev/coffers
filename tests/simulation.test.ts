import { test } from "node:test";
import assert from "node:assert/strict";
import { affordabilityFor, simulatePurchase, type SimulationInput } from "../lib/finance/simulation";

function input(overrides: Partial<SimulationInput>): SimulationInput {
  return {
    amount: 500,
    totalBalance: 10000,
    expectedIncome: 1000,
    committedExpenses: 500,
    monthIncome: 5000,
    monthExpenses: 2000,
    dayOfMonth: 15,
    goals: [],
    ...overrides,
  };
}

test("an affordable purchase shifts rates without breaking anything", () => {
  const result = simulatePurchase(input({}));

  assert.equal(result.before.availableBalance, 10000);
  assert.equal(result.before.savingsRate, 60); // (5000 − 2000) ÷ 5000
  assert.equal(result.after.availableBalance, 9500);
  assert.equal(result.after.savingsRate, 50);
  assert.equal(result.impact.balanceReduction, 500);
  assert.equal(result.impact.savingsRateChange, -10);
  assert.equal(result.impact.wouldOverspend, false);
  // K9,500 ÷ (K2,000 ÷ 15 days) ≈ 71.3 days of spending covered
  assert.equal(result.impact.monthsOfExpensesCovered, 71.3);
  assert.equal(result.affordabilityScore.level, "low");
  assert.equal(result.affordabilityScore.label, "Affordable");
  assert.equal(result.warnings.length, 0);
  assert.match(result.recommendation, /Great news/);
});

test("a purchase above the balance is blocked with a clear shortfall", () => {
  const result = simulatePurchase(input({ amount: 12000 }));

  assert.equal(result.affordabilityScore.level, "critical");
  assert.equal(result.after.availableBalance, -2000);
  assert.equal(result.impact.wouldOverspend, true);
  assert.match(result.recommendation, /You don't have enough available balance/);
  assert.match(result.warnings[0], /exceeds your available balance by K2,000/);
});

test("affordability thresholds are exact", () => {
  assert.equal(affordabilityFor(2500, 10000).level, "low"); // exactly 25%
  assert.equal(affordabilityFor(2501, 10000).level, "moderate");
  assert.equal(affordabilityFor(5000, 10000).level, "moderate"); // exactly 50%
  assert.equal(affordabilityFor(5001, 10000).level, "high");
  assert.equal(affordabilityFor(10000, 10000).level, "high"); // equal is still affordable
  assert.equal(affordabilityFor(10001, 10000).level, "critical");
});

test("a purchase that wipes out the month raises deficit warnings", () => {
  const result = simulatePurchase(
    input({ amount: 1500, monthIncome: 1000, monthExpenses: 800 })
  );

  assert.equal(result.after.savingsRate, -130);
  assert.equal(result.impact.savingsRateChange, -150); // 20% → −130%
  assert.match(result.recommendation, /deficit/);
  assert.ok(result.warnings.some((warning) => /wipe out this month's savings/.test(warning)));
});

test("a shortfall after commitments is flagged", () => {
  const result = simulatePurchase(
    input({ amount: 500, totalBalance: 1000, expectedIncome: 0, committedExpenses: 800 })
  );
  assert.ok(result.warnings.some((warning) => /K300 short/.test(warning)));
});

test("goal delays are finite and explained", () => {
  const result = simulatePurchase(
    input({
      amount: 600,
      goals: [
        { name: "Trip", targetAmount: 12000, currentAmount: 0, monthlyContribution: 1000 },
      ],
    })
  );

  const impact = result.goalImpacts[0];
  // contribution 1000 → 800: 12 months → 15 months = 3 month delay
  assert.equal(impact.delayMonths, 3);
  assert.match(impact.message, /3 months/);
  assert.match(result.recommendation, /delay your savings goals by ~3 months/);
  assert.ok(result.warnings.some((warning) => /up to 3 month/.test(warning)));
});

test("a purchase that stops contributions never says Infinity", () => {
  const result = simulatePurchase(
    input({
      amount: 3600, // amount/3 = 1200 > contribution 1000
      goals: [
        { name: "Trip", targetAmount: 12000, currentAmount: 0, monthlyContribution: 1000 },
      ],
    })
  );

  const impact = result.goalImpacts[0];
  assert.equal(impact.delayMonths, 0);
  assert.match(impact.message, /pause contributions/);
  assert.ok(!impact.message.includes("Infinity"));
  assert.ok(!result.recommendation.includes("Infinity"));
});

test("goals without contributions are reported as unaffected", () => {
  const result = simulatePurchase(
    input({
      amount: 1000,
      goals: [
        { name: "Rainy day", targetAmount: 5000, currentAmount: 1000, monthlyContribution: 0 },
      ],
    })
  );
  assert.equal(result.goalImpacts[0].delayMonths, 0);
  assert.match(result.goalImpacts[0].message, /No significant impact/);
});

test("the simulation is a pure function of its input", () => {
  const first = simulatePurchase(input({ amount: 750 }));
  const second = simulatePurchase(input({ amount: 750 }));
  assert.deepEqual(first, second);
});
