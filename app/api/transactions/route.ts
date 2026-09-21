import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Transaction, Account } from "@/lib/models";
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
      if (endDate) (query.date as Record<string, Date>).$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate("categoryId", "name color icon")
        .populate("accountId", "name type")
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

    const { type, amount, categoryId, accountId, toAccountId, description, note, date } =
      result.data;

    // Create transaction
    const transaction = await Transaction.create({
      userId,
      type,
      amount,
      categoryId,
      accountId,
      toAccountId: type === "transfer" ? toAccountId : undefined,
      description,
      note,
      date,
    });

    // Update account balances
    if (type === "income") {
      await Account.findByIdAndUpdate(accountId, {
        $inc: { openingBalance: amount },
      });
    } else if (type === "expense") {
      await Account.findByIdAndUpdate(accountId, {
        $inc: { openingBalance: -amount },
      });
    } else if (type === "transfer" && toAccountId) {
      await Account.findByIdAndUpdate(accountId, {
        $inc: { openingBalance: -amount },
      });
      await Account.findByIdAndUpdate(toAccountId, {
        $inc: { openingBalance: amount },
      });
    }

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
