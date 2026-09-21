import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Account, Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/accounts — list accounts with calculated balances
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const accounts = await Account.find({ userId }).sort({ createdAt: 1 }).lean();

    // Calculate current balance for each account from transactions
    const accountsWithBalance = await Promise.all(
      accounts.map(async (account) => {
        const txAgg = await Transaction.aggregate([
          {
            $match: {
              userId: account.userId,
              $or: [
                { accountId: account._id, type: "income" },
                { accountId: account._id, type: "expense" },
                { toAccountId: account._id, type: "transfer" },
                { accountId: account._id, type: "transfer" },
              ],
            },
          },
          {
            $group: {
              _id: null,
              income: {
                $sum: {
                  $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                },
              },
              expense: {
                $sum: {
                  $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                },
              },
              transferIn: {
                $sum: {
                  $cond: [
                    { $eq: ["$toAccountId", account._id] },
                    "$amount",
                    0,
                  ],
                },
              },
              transferOut: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "transfer"] },
                        { $eq: ["$accountId", account._id] },
                      ],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]);

        const agg = txAgg[0] || {
          income: 0,
          expense: 0,
          transferIn: 0,
          transferOut: 0,
        };

        const currentBalance =
          account.openingBalance +
          agg.income -
          agg.expense +
          agg.transferIn -
          agg.transferOut;

        return {
          ...account,
          currentBalance,
        };
      })
    );

    const totalBalance = accountsWithBalance.reduce(
      (sum, acc) => sum + acc.currentBalance,
      0
    );

    return NextResponse.json({
      success: true,
      data: { accounts: accountsWithBalance, totalBalance },
    });
  } catch (error) {
    console.error("Accounts fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

// POST /api/accounts — create a new account
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type, openingBalance = 0 } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: "Name and type are required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const account = await Account.create({
      userId,
      name,
      type,
      openingBalance,
      currency: "ZMK",
    });

    return NextResponse.json(
      { success: true, data: { account } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Account creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
