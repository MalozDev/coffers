import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account, Goal, Reminder, ExpectedIncome } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// POST /api/intelligence/simulate — simulate a financial decision
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, description, categoryId } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid amount is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get current financial position
    const accounts = await Account.find({ userId }).lean();
    const totalBalance = accounts.reduce((sum, a) => sum + a.openingBalance, 0);

    // Get current month data
    const monthTransactions = await Transaction.find({
      userId,
      date: { $gte: monthStart },
    }).lean();

    const monthIncome = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthExpenses = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Get expected income
    const expectedIncome = await ExpectedIncome.find({
      userId,
      status: "pending",
      expectedDate: { $gte: now },
    }).lean();

    const totalExpected = expectedIncome.reduce((sum, e) => sum + e.amount, 0);

    // Get upcoming commitments
    const upcomingReminders = await Reminder.find({
      userId,
      isCompleted: false,
      dueDate: { $gte: now, $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
    }).lean();

    const totalCommitted = upcomingReminders.reduce((sum, r) => sum + r.amount, 0);

    // Get active goals
    const activeGoals = await Goal.find({ userId, status: "active" }).lean();

    // Calculate simulation
    const balanceAfterPurchase = totalBalance - amount;
    const availableAfterPurchase = balanceAfterPurchase + totalExpected - totalCommitted;

    // Impact on savings rate
    const currentSavings = monthIncome - monthExpenses;
    const savingsAfterPurchase = currentSavings - amount;
    const currentSavingsRate = monthIncome > 0 ? (currentSavings / monthIncome) * 100 : 0;
    const savingsRateAfter = monthIncome > 0 ? (savingsAfterPurchase / monthIncome) * 100 : 0;

    // Impact on goals
    const goalImpacts = activeGoals.map((goal) => {
      const remaining = goal.targetAmount - goal.currentAmount;
      const monthsAtCurrentRate =
        goal.monthlyContribution > 0
          ? remaining / goal.monthlyContribution
          : Infinity;

      // If user reduces goal contribution to afford this purchase
      const reducedContribution = Math.max(0, goal.monthlyContribution - amount / 3);
      const monthsAtReduced =
        reducedContribution > 0 ? remaining / reducedContribution : Infinity;

      const delayMonths =
        monthsAtReduced > monthsAtCurrentRate
          ? Math.ceil(monthsAtReduced - monthsAtCurrentRate)
          : 0;

      return {
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        monthlyContribution: goal.monthlyContribution,
        delayMonths,
        message:
          delayMonths > 0
            ? `This purchase would delay "${goal.name}" by ~${delayMonths} months if you reduce contributions.`
            : `No significant impact on "${goal.name}" savings.`,
      };
    });

    // Determine if affordable
    const affordabilityScore = (() => {
      if (amount > totalBalance) return { level: "critical", label: "Cannot afford" };
      if (amount > totalBalance * 0.5) return { level: "high", label: "Significant impact" };
      if (amount > totalBalance * 0.25) return { level: "moderate", label: "Manageable" };
      return { level: "low", label: "Affordable" };
    })();

    // Generate simulation report
    const simulation = {
      purchase: {
        amount,
        description: description || "Unnamed purchase",
        categoryId,
      },
      before: {
        availableBalance: totalBalance,
        expectedIncome: totalExpected,
        committedExpenses: totalCommitted,
        netPosition: totalBalance + totalExpected - totalCommitted,
        monthlySavings: currentSavings,
        savingsRate: Math.round(currentSavingsRate),
      },
      after: {
        availableBalance: balanceAfterPurchase,
        expectedIncome: totalExpected,
        committedExpenses: totalCommitted,
        netPosition: availableAfterPurchase,
        monthlySavings: savingsAfterPurchase,
        savingsRate: Math.round(savingsRateAfter),
      },
      impact: {
        balanceReduction: amount,
        savingsRateChange: Math.round(savingsRateAfter - currentSavingsRate),
        wouldOverspend: balanceAfterPurchase < 0,
        monthsOfExpensesCovered:
          monthExpenses > 0
            ? Math.round((balanceAfterPurchase / (monthExpenses / now.getDate())) * 10) / 10
            : 0,
      },
      goalImpacts,
      affordabilityScore,
      recommendation: generateRecommendation(
        amount,
        totalBalance,
        totalExpected,
        totalCommitted,
        currentSavingsRate,
        savingsRateAfter,
        goalImpacts
      ),
    };

    return NextResponse.json({ success: true, data: simulation });
  } catch (error) {
    console.error("Simulation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to run simulation" },
      { status: 500 }
    );
  }
}

function generateRecommendation(
  amount: number,
  balance: number,
  expected: number,
  committed: number,
  currentRate: number,
  newRate: number,
  goalImpacts: Array<{ delayMonths: number }>
): string {
  if (amount > balance) {
    return `You don't have enough available balance for this purchase. You'd need K${amount - balance} more.`;
  }

  if (newRate < 0) {
    return `This purchase would put you in a deficit this month. Consider waiting until you have more income.`;
  }

  if (newRate < 10 && currentRate >= 10) {
    return `This purchase would drop your savings rate from ${Math.round(currentRate)}% to ${Math.round(newRate)}%. Consider if this is the right time.`;
  }

  const totalDelay = goalImpacts.reduce((sum, g) => sum + g.delayMonths, 0);
  if (totalDelay > 0) {
    return `This is affordable, but it would delay your savings goals by ~${totalDelay} months. Make sure the trade-off is worth it.`;
  }

  if (newRate >= 20) {
    return `Great news! You can afford this and still maintain a healthy ${Math.round(newRate)}% savings rate.`;
  }

  return `This purchase is within your means. Your savings rate would be ${Math.round(newRate)}% after the purchase.`;
}
