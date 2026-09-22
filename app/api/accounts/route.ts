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
    const transactions = await Transaction.find({ userId }).select("type amount accountId toAccountId payments").lean();

    // Calculate current balance for each account from transactions
    const accountsWithBalance = accounts.map((account) => {
        let currentBalance = account.openingBalance;
        transactions.forEach((transaction) => {
          if (transaction.type === "income" && String(transaction.accountId) === String(account._id)) {
            currentBalance += transaction.amount;
          } else if (transaction.type === "expense") {
            const payment = transaction.payments?.find((item) => String(item.accountId) === String(account._id));
            currentBalance -= payment?.amount ?? (String(transaction.accountId) === String(account._id) ? transaction.amount : 0);
          } else if (transaction.type === "transfer") {
            if (String(transaction.accountId) === String(account._id)) currentBalance -= transaction.amount;
            if (String(transaction.toAccountId) === String(account._id)) currentBalance += transaction.amount;
          }
        });

        return {
          ...account,
          currentBalance,
        };
      });

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
