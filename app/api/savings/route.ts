import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Account, Transaction, Goal } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/savings — savings accounts with balances, 6-month trend, and goals
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const accounts = await Account.find({ userId, type: "savings" })
      .sort({ createdAt: 1 })
      .lean();

    const ids = accounts.map((a) => a._id);
    const monthStart = (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    })();

    let txs: Array<{
      type: string;
      amount: number;
      date: Date;
      accountId?: Types.ObjectId;
      toAccountId?: Types.ObjectId;
    }> = [];

    if (ids.length > 0) {
      txs = await Transaction.find({
        userId,
        $or: [
          { accountId: { $in: ids } },
          { toAccountId: { $in: ids } },
          { "payments.accountId": { $in: ids } },
        ],
      })
        .sort({ date: 1 })
        .lean();
    }

    // Net effect of all transactions on one account
    const effectOn = (list: typeof txs, id: Types.ObjectId) => {
      let net = 0;
      for (const t of list) {
        const sameAccount = t.accountId && String(t.accountId) === String(id);
        const toAccount = t.toAccountId && String(t.toAccountId) === String(id);
        if (t.type === "income" && sameAccount) net += t.amount;
        else if (t.type === "expense") {
          const payment = (t as any).payments?.find((item: any) => String(item.accountId) === String(id));
          net -= payment?.amount ?? (sameAccount ? t.amount : 0);
        }
        else if (t.type === "transfer" && sameAccount) net -= t.amount;
        else if (t.type === "transfer" && toAccount) net += t.amount;
      }
      return net;
    };

    const accountBalances = accounts.map((a) => ({
      _id: a._id,
      name: a.name,
      type: a.type,
      openingBalance: a.openingBalance,
      balance: a.openingBalance + effectOn(txs, a._id),
    }));

    const total = accountBalances.reduce((s, a) => s + a.balance, 0);

    // This month's net movement across savings accounts
    let monthNet = 0;
    for (const t of txs) {
      if (new Date(t.date) < monthStart) continue;
      for (const a of accounts) {
        const sameAccount = t.accountId && String(t.accountId) === String(a._id);
        const toAccount = t.toAccountId && String(t.toAccountId) === String(a._id);
        if (t.type === "income" && sameAccount) monthNet += t.amount;
        else if (t.type === "expense") {
          const payment = (t as any).payments?.find((item: any) => String(item.accountId) === String(a._id));
          monthNet -= payment?.amount ?? (sameAccount ? t.amount : 0);
        }
        else if (t.type === "transfer" && sameAccount) monthNet -= t.amount;
        else if (t.type === "transfer" && toAccount) monthNet += t.amount;
      }
    }

    // 6-month balance trend (cumulative up to each month end)
    const openingTotal = accounts.reduce((s, a) => s + a.openingBalance, 0);
    const now = new Date();
    const cutoffs: { label: string; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const label = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-GB", {
        month: "short",
      });
      cutoffs.push({ label, end: d });
    }

    const trend = cutoffs.map(({ label, end }) => {
      let balance = openingTotal;
      for (const t of txs) {
        if (new Date(t.date) > end) continue;
        for (const a of accounts) {
          const sameAccount = t.accountId && String(t.accountId) === String(a._id);
          const toAccount = t.toAccountId && String(t.toAccountId) === String(a._id);
          if (t.type === "income" && sameAccount) balance += t.amount;
          else if (t.type === "expense") {
            const payment = (t as any).payments?.find((item: any) => String(item.accountId) === String(a._id));
            balance -= payment?.amount ?? (sameAccount ? t.amount : 0);
          }
          else if (t.type === "transfer" && sameAccount) balance -= t.amount;
          else if (t.type === "transfer" && toAccount) balance += t.amount;
        }
      }
      return { label, balance: Math.round(balance) };
    });

    const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      data: { accounts: accountBalances, total, monthNet, trend, goals },
    });
  } catch (error) {
    console.error("Savings fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load savings" },
      { status: 500 }
    );
  }
}
