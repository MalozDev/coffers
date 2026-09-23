import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account, ExpectedIncome } from "@/lib/models";
import { transactionSchema } from "@/lib/validation/transaction";

// Helper: extract userId from token cookie
function getUserId(request: NextRequest): string | null {
  const token = request.cookies.get("coffers-token")?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    return payload.userId;
  } catch {
    return null;
  }
}

// GET /api/transactions — list transactions
export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const categoryId = searchParams.get("categoryId");
    const accountId = searchParams.get("accountId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Build query
    const query: Record<string, unknown> = { userId };
    if (type) query.type = type;
    if (categoryId) query.categoryId = categoryId;
    if (accountId) query.accountId = accountId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) (query.date as Record<string, Date>).$gte = new Date(startDate);
      if (endDate) {
        // Day-granularity end dates ("2026-09-23") must include the whole day
        const end = new Date(endDate);
        if (end.toString().indexOf(":") === -1) end.setHours(23, 59, 59, 999);
        (query.date as Record<string, Date>).$lte = end;
      }
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("categoryId", "name color icon")
        .populate("accountId", "name type")
        .populate("toAccountId", "name type")
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Transactions fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

// POST /api/transactions — create transaction
export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // Validate input
    const result = transactionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const { type, amount, categoryId, accountId, toAccountId, description, note, date, payments } =
      result.data;

    // A future-dated income has not arrived yet, so keep it in the expected-income flow.
    if (type === "income") {
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      if (date > todayEnd) {
        const expectedIncome = await ExpectedIncome.create({
          userId,
          source: description,
          amount,
          expectedDate: date,
          note,
          status: "pending",
        });
        return NextResponse.json(
          { success: true, data: { expectedIncome }, convertedToExpected: true },
          { status: 201 }
        );
      }
    }

    const normalizedPayments = type === "expense"
      ? (payments?.length ? payments : [{ accountId, amount }])
      : undefined;

    const accountIds = type === "expense"
      ? normalizedPayments?.map((payment) => payment.accountId) || []
      : [accountId, ...(toAccountId ? [toAccountId] : [])];
    const ownedAccounts = await Account.countDocuments({ userId, _id: { $in: accountIds } });
    if (ownedAccounts !== new Set(accountIds).size) {
      return NextResponse.json({ success: false, error: "One or more accounts are invalid" }, { status: 400 });
    }

    if (type === "expense" && normalizedPayments) {
      const accounts = await Account.find({ userId }).lean();
      const transactions = await Transaction.find({ userId }).select("type amount accountId toAccountId payments").lean();
      const balances = new Map(accounts.map((account) => [String(account._id), account.openingBalance]));
      transactions.forEach((transaction) => {
        if (transaction.type === "income") {
          const key = String(transaction.accountId);
          balances.set(key, (balances.get(key) || 0) + transaction.amount);
        } else if (transaction.type === "expense") {
          if (transaction.payments?.length) {
            transaction.payments.forEach((payment) => {
              const key = String(payment.accountId);
              if (balances.has(key)) balances.set(key, (balances.get(key) || 0) - payment.amount);
            });
          } else {
            const key = String(transaction.accountId);
            if (balances.has(key)) balances.set(key, (balances.get(key) || 0) - transaction.amount);
          }
        } else if (transaction.type === "transfer") {
          const from = String(transaction.accountId);
          const to = String(transaction.toAccountId);
          if (balances.has(from)) balances.set(from, (balances.get(from) || 0) - transaction.amount);
          if (balances.has(to)) balances.set(to, (balances.get(to) || 0) + transaction.amount);
        }
      });

      const shortPayment = normalizedPayments.find((payment) => payment.amount > (balances.get(String(payment.accountId)) || 0));
      if (shortPayment) {
        const totalAvailable = normalizedPayments.reduce((sum, payment) => sum + Math.max(balances.get(String(payment.accountId)) || 0, 0), 0);
        return NextResponse.json({
          success: false,
          error: totalAvailable >= amount
            ? "This account cannot cover its payment share. Split the expense across accounts using their available balances."
            : "The selected accounts do not have enough available balance for this expense.",
          suggestSplit: totalAvailable >= amount,
        }, { status: 409 });
      }
    }

    if (type === "transfer") {
      const sourceAccount = await Account.findOne({ _id: accountId, userId }).lean();
      const transactions = await Transaction.find({ userId }).select("type amount accountId toAccountId payments").lean();
      let sourceBalance = sourceAccount?.openingBalance || 0;
      transactions.forEach((transaction) => {
        if (String(transaction.accountId) === String(accountId)) {
          if (transaction.type === "income") sourceBalance += transaction.amount;
          if (transaction.type === "expense") {
            const payment = transaction.payments?.find((item) => String(item.accountId) === String(accountId));
            sourceBalance -= payment?.amount ?? transaction.amount;
          }
          if (transaction.type === "transfer") sourceBalance -= transaction.amount;
        }
        if (transaction.type === "transfer" && String(transaction.toAccountId) === String(accountId)) {
          sourceBalance += transaction.amount;
        }
      });
      if (amount > sourceBalance) {
        return NextResponse.json({ success: false, error: `Not enough balance in the source account. Available: K${Math.max(sourceBalance, 0).toLocaleString()}` }, { status: 409 });
      }
    }

    // Create transaction
    const transaction = await Transaction.create({
      userId,
      type,
      amount,
      categoryId,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      payments: normalizedPayments,
      description,
      note,
      date,
    });

    return NextResponse.json(
      { success: true, data: { transaction } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Transaction creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
