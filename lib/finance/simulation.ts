/*
 * Finance Engine — purchase simulation (pure).
 *
 * Per docs/ask-engine.md §3.5 a simulation runs on a read-only snapshot of
 * the user's state. This module is a pure function: it cannot reach the
 * database, which makes the read-only guarantee structural, not a promise.
 */

import { formatK, round } from "./format";

export interface SimulationGoal {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
}

export interface SimulationInput {
  amount: number;
  description?: string;
  categoryId?: string;
  /** Combined balance across all accounts. */
  totalBalance: number;
  expectedIncome: number;
  /** Reminders/commitments due before month end. */
  committedExpenses: number;
  monthIncome: number;
  monthExpenses: number;
  /** Day of month at simulation time (1-based). */
  dayOfMonth: number;
  goals: SimulationGoal[];
  /**
   * Human label of the money being reasoned about, e.g. "this month",
   * "this week", "today". Defaults to "this month" — wording in warnings
   * and the recommendation adapts to it.
   */
  scopeLabel?: string;
}

export interface GoalImpact {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  delayMonths: number;
  message: string;
}

export interface SimulationOutput {
  purchase: { amount: number; description: string; categoryId?: string };
  /** The window the simulation reasoned over. */
  scopeLabel: string;
  before: {
    availableBalance: number;
    expectedIncome: number;
    committedExpenses: number;
    netPosition: number;
    monthlySavings: number;
    savingsRate: number;
  };
  after: {
    availableBalance: number;
    expectedIncome: number;
    committedExpenses: number;
    netPosition: number;
    monthlySavings: number;
    savingsRate: number;
  };
  impact: {
    balanceReduction: number;
    savingsRateChange: number;
    wouldOverspend: boolean;
    monthsOfExpensesCovered: number;
  };
  goalImpacts: GoalImpact[];
  affordabilityScore: { level: "low" | "moderate" | "high" | "critical"; label: string };
  recommendation: string;
  warnings: string[];
  /** Pace/figure fallback explanation, when the selected window was empty. */
  scopeNote?: string;
}

/** Same thresholds the dashboard has always shown. */
export function affordabilityFor(
  amount: number,
  balance: number
): SimulationOutput["affordabilityScore"] {
  if (amount > balance) return { level: "critical", label: "Cannot afford" };
  if (amount > balance * 0.5) return { level: "high", label: "Significant impact" };
  if (amount > balance * 0.25) return { level: "moderate", label: "Manageable" };
  return { level: "low", label: "Affordable" };
}

function goalImpact(goal: SimulationGoal, amount: number): GoalImpact {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const monthsAtCurrentRate =
    goal.monthlyContribution > 0 ? remaining / goal.monthlyContribution : Infinity;

  // Modelled behaviour: the user trims contributions to free up cash for
  // this purchase (contribution - amount/3, floored at 0).
  const reducedContribution = Math.max(0, goal.monthlyContribution - amount / 3);
  const monthsAtReduced =
    reducedContribution > 0 ? remaining / reducedContribution : Infinity;

  let delayMonths = 0;
  let message: string;
  if (goal.monthlyContribution > 0 && reducedContribution <= 0) {
    // Cutting this purchase's share out of contributions stops them entirely —
    // never render "~Infinity months" to the user.
    message = `This purchase would pause contributions to "${goal.name}" — the goal would be postponed indefinitely.`;
  } else if (monthsAtReduced > monthsAtCurrentRate) {
    delayMonths = Math.ceil(monthsAtReduced - monthsAtCurrentRate);
    message = `This purchase would delay "${goal.name}" by ~${delayMonths} months if you reduce contributions.`;
  } else {
    message = `No significant impact on "${goal.name}" savings.`;
  }

  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    monthlyContribution: goal.monthlyContribution,
    delayMonths,
    message,
  };
}

function recommendationFor(
  amount: number,
  balance: number,
  expected: number,
  committed: number,
  currentRate: number,
  newRate: number,
  goalImpacts: GoalImpact[],
  scopeLabel: string
): string {
  if (amount > balance) {
    return `You don't have enough available balance for this purchase. You'd need ${formatK(amount - balance)} more.`;
  }
  if (newRate < 0) {
    return `This purchase would put you in a deficit ${scopeLabel}. Consider waiting until you have more income.`;
  }
  if (newRate < 10 && currentRate >= 10) {
    return `This purchase would drop your savings rate from ${Math.round(currentRate)}% to ${Math.round(newRate)}%. Consider if this is the right time.`;
  }
  const totalDelay = goalImpacts.reduce((sum, goal) => sum + goal.delayMonths, 0);
  if (totalDelay > 0) {
    return `This is affordable, but it would delay your savings goals by ~${totalDelay} months. Make sure the trade-off is worth it.`;
  }
  if (newRate >= 20) {
    return `Great news! You can afford this and still maintain a healthy ${Math.round(newRate)}% savings rate.`;
  }
  return `This purchase is within your means. Your savings rate would be ${Math.round(newRate)}% after the purchase.`;
}

export function simulatePurchase(input: SimulationInput): SimulationOutput {
  const {
    amount,
    description,
    categoryId,
    totalBalance,
    expectedIncome,
    committedExpenses,
    monthIncome,
    monthExpenses,
    dayOfMonth,
    goals,
  } = input;
  const scopeLabel = input.scopeLabel || "this month";

  const balanceAfterPurchase = totalBalance - amount;
  const netPositionAfter = balanceAfterPurchase + expectedIncome - committedExpenses;

  const currentSavings = monthIncome - monthExpenses;
  const savingsAfterPurchase = currentSavings - amount;
  const currentSavingsRate = monthIncome > 0 ? (currentSavings / monthIncome) * 100 : 0;
  const savingsRateAfter = monthIncome > 0 ? (savingsAfterPurchase / monthIncome) * 100 : 0;

  const goalImpacts = goals.map((goal) => goalImpact(goal, amount));

  const affordabilityScore = affordabilityFor(amount, totalBalance);

  const dailySpend =
    monthExpenses > 0 && dayOfMonth > 0 ? monthExpenses / dayOfMonth : 0;

  const warnings: string[] = [];
  if (amount > totalBalance) {
    warnings.push(
      `This purchase exceeds your available balance by ${formatK(amount - totalBalance)}.`
    );
  }
  if (netPositionAfter < 0) {
    warnings.push(
      `Even with expected income, you'd be ${formatK(netPositionAfter)} short once commitments are paid.`
    );
  }
  if (monthIncome > 0 && savingsAfterPurchase < 0) {
    warnings.push(`This would wipe out ${scopeLabel}'s savings entirely.`);
  }
  const totalGoalDelay = goalImpacts.reduce((sum, goal) => sum + goal.delayMonths, 0);
  if (totalGoalDelay > 0) {
    warnings.push(`Your savings goals would slip by up to ${totalGoalDelay} month(s).`);
  }

  return {
    purchase: {
      amount,
      description: description || "Unnamed purchase",
      categoryId,
    },
    scopeLabel,
    before: {
      availableBalance: totalBalance,
      expectedIncome,
      committedExpenses,
      netPosition: totalBalance + expectedIncome - committedExpenses,
      monthlySavings: currentSavings,
      savingsRate: Math.round(currentSavingsRate),
    },
    after: {
      availableBalance: balanceAfterPurchase,
      expectedIncome,
      committedExpenses,
      netPosition: netPositionAfter,
      monthlySavings: savingsAfterPurchase,
      savingsRate: Math.round(savingsRateAfter),
    },
    impact: {
      balanceReduction: amount,
      savingsRateChange: Math.round(savingsRateAfter - currentSavingsRate),
      wouldOverspend: balanceAfterPurchase < 0,
      monthsOfExpensesCovered:
        dailySpend > 0 ? round(balanceAfterPurchase / dailySpend, 1) : 0,
    },
    goalImpacts,
    affordabilityScore,
    recommendation: recommendationFor(
      amount,
      totalBalance,
      expectedIncome,
      committedExpenses,
      currentSavingsRate,
      savingsRateAfter,
      goalImpacts,
      scopeLabel
    ),
    warnings,
  };
}
