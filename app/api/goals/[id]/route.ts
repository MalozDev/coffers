import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Goal, Account, Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

async function getAccountBalance(userId: string, accountId: unknown) {
  const account = await Account.findOne({ _id: accountId, userId }).lean();
  if (!account) return null;

  const transactions = await Transaction.find({ userId })
    .select("type amount accountId toAccountId payments")
    .lean();
  let balance = account.openingBalance;

  for (const transaction of transactions) {
    const isSource = String(transaction.accountId) === String(accountId);
    const isDestination = String(transaction.toAccountId) === String(accountId);
    if (transaction.type === "income" && isSource) balance += transaction.amount;
    if (transaction.type === "expense") {
      const payment = transaction.payments?.find((item) => String(item.accountId) === String(accountId));
      balance -= payment?.amount ?? (isSource ? transaction.amount : 0);
    }
    if (transaction.type === "transfer") {
      if (isSource) balance -= transaction.amount;
      if (isDestination) balance += transaction.amount;
    }
  }

  return balance;
}

// PATCH /api/goals/[id] — update goal (name, amounts, contribute)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    await connectToDatabase();

    // Move money into the goal's savings account and update progress.
    if (body.contribution) {
      const goal = await Goal.findOne({ _id: id, userId });
      if (!goal) {
        return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
      }

      if (!body.accountId) {
        return NextResponse.json({ success: false, error: "Choose the account to fund this goal from" }, { status: 400 });
      }

      const sourceAccount = await Account.findOne({ _id: body.accountId, userId });
      if (!sourceAccount) {
        return NextResponse.json({ success: false, error: "Funding account not found" }, { status: 400 });
      }
      const contribution = Number(body.contribution);
      if (!Number.isFinite(contribution) || contribution <= 0) {
        return NextResponse.json({ success: false, error: "Contribution must be greater than zero" }, { status: 400 });
      }
      const sourceBalance = await getAccountBalance(userId, sourceAccount._id);
      if (sourceBalance === null || contribution > sourceBalance) {
        return NextResponse.json({ success: false, error: `Not enough balance in the funding account. Available: K${Math.max(sourceBalance || 0, 0).toLocaleString()}` }, { status: 409 });
      }

      let savingsAccount = goal.fundingAccountId
        ? await Account.findOne({ _id: goal.fundingAccountId, userId })
        : null;
      if (!savingsAccount) {
        savingsAccount = await Account.create({
          userId,
          name: `Goal: ${goal.name}`,
          type: "savings",
          openingBalance: 0,
          currency: "ZMK",
        });
      }
      if (String(sourceAccount._id) === String(savingsAccount._id)) {
        return NextResponse.json({ success: false, error: "Choose a different source account" }, { status: 400 });
      }

      await Transaction.create({
        userId,
        type: "transfer",
        source: "saving",
        amount: contribution,
        accountId: sourceAccount._id,
        toAccountId: savingsAccount._id,
        description: `Contribution to goal: ${goal.name}`,
        date: new Date(),
      });

      goal.fundingAccountId = savingsAccount._id;
      goal.currentAmount += contribution;
      if (goal.currentAmount >= goal.targetAmount) {
        goal.status = "completed";
      }
      await goal.save();

      return NextResponse.json({ success: true, data: { goal } });
    }

    if (body.status === "cancelled") {
      const goal = await Goal.findOne({ _id: id, userId });
      if (!goal) return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });

      if (goal.currentAmount > 0 && goal.fundingAccountId) {
        const savingsAccount = await Account.findOne({ _id: goal.fundingAccountId, userId });
        if (savingsAccount) {
          const savingsBalance = await getAccountBalance(userId, savingsAccount._id);
          const returnAccountId = body.returnAccountId;
          if ((savingsBalance || 0) > 0) {
            const returnAccount = await Account.findOne({ _id: returnAccountId, userId });
            if (!returnAccount || String(returnAccount._id) === String(savingsAccount._id)) {
              return NextResponse.json({ success: false, error: "Choose an account to return the saved funds to" }, { status: 400 });
            }
            await Transaction.create({
              userId,
              type: "transfer",
              source: "saving",
              amount: savingsBalance,
              accountId: savingsAccount._id,
              toAccountId: returnAccount._id,
              description: `Returned funds from cancelled goal: ${goal.name}`,
              date: new Date(),
            });
          }
          goal.currentAmount = 0;
        }
      }
      goal.status = "cancelled";
      await goal.save();
      return NextResponse.json({ success: true, data: { goal } });
    }

    if (body.action === "return") {
      const goal = await Goal.findOne({ _id: id, userId });
      if (!goal) return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
      if (!goal.fundingAccountId || goal.currentAmount <= 0) {
        return NextResponse.json({ success: false, error: "There is no saved balance to return" }, { status: 400 });
      }

      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > goal.currentAmount) {
        return NextResponse.json({ success: false, error: "Enter a valid amount up to the saved balance" }, { status: 400 });
      }

      const savingsAccount = await Account.findOne({ _id: goal.fundingAccountId, userId });
      const returnAccount = await Account.findOne({ _id: body.accountId, userId });
      const savingsBalance = savingsAccount ? await getAccountBalance(userId, savingsAccount._id) : null;
      if (!savingsAccount || !returnAccount || String(returnAccount._id) === String(savingsAccount._id)) {
        return NextResponse.json({ success: false, error: "Choose a valid account to return the money to" }, { status: 400 });
      }
      if (savingsBalance === null || amount > savingsBalance) {
        return NextResponse.json({ success: false, error: `Only K${Math.max(savingsBalance || 0, 0).toLocaleString()} is available to return` }, { status: 409 });
      }

      await Transaction.create({
        userId,
        type: "transfer",
        source: "saving",
        amount,
        accountId: savingsAccount._id,
        toAccountId: returnAccount._id,
        description: `Returned money from saving: ${goal.name}`,
        date: new Date(),
      });
      goal.currentAmount -= amount;
      if (goal.status === "completed" && goal.currentAmount < goal.targetAmount) goal.status = "active";
      await goal.save();
      return NextResponse.json({ success: true, data: { goal } });
    }

    // Regular update
    const goal = await Goal.findOneAndUpdate(
      { _id: id, userId },
      { $set: body },
      { new: true }
    );

    if (!goal) {
      return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { goal } });
  } catch (error) {
    console.error("Goal update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update goal" },
      { status: 500 }
    );
  }
}

// DELETE /api/goals/[id] — delete goal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await connectToDatabase();

    const goal = await Goal.findOneAndDelete({ _id: id, userId });
    if (!goal) {
      return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { message: "Goal deleted" } });
  } catch (error) {
    console.error("Goal delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete goal" },
      { status: 500 }
    );
  }
}
