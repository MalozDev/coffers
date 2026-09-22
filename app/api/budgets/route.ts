import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Budget, Transaction } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// GET /api/budgets — list budgets with spending progress
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const budgets = await Budget.find({ userId })
      .populate("categoryId", "name color icon")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate spending for each budget
    const now = new Date();
    const budgetsInProgress = await Promise.all(
      budgets.map(async (budget) => {
        // Shopping-list budgets: item totals + status (legacy docs have no status)
        const items = budget.items || [];
        const itemsTotal = items.reduce((s, it) => s + it.price, 0);
        const markedItems = items.filter((it) => it.bought);
        const markedTotal = markedItems.reduce((s, it) => s + it.price, 0);
        const status = budget.status || "active";

        // Legacy category-limit budgets: spending progress
        if (!budget.categoryId || !budget.amount) {
          return {
            ...budget,
            status,
            items,
            itemsTotal,
            markedCount: markedItems.length,
            markedTotal,
            spentAmount: 0,
            percentage: 0,
            remaining: budget.amount || 0,
          };
        }

        // Determine date range based on period
        let startDate = new Date(budget.startDate);
        if (budget.period === "daily") {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (budget.period === "weekly") {
          const day = startDate.getDay();
          startDate = new Date(now);
          startDate.setDate(now.getDate() - day);
          startDate.setHours(0, 0, 0, 0);
        } else if (budget.period === "monthly") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const spent = await Transaction.aggregate([
          {
            $match: {
              userId: budget.userId,
              type: "expense",
              categoryId: budget.categoryId?._id || budget.categoryId,
              date: { $gte: startDate, $lte: now },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);

        const spentAmount = spent[0]?.total || 0;
        const percentage = Math.min((spentAmount / budget.amount) * 100, 100);

        return {
          ...budget,
          status,
          items,
          itemsTotal,
          markedCount: markedItems.length,
          markedTotal,
          spentAmount,
          percentage,
          remaining: Math.max(budget.amount - spentAmount, 0),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { budgets: budgetsInProgress },
    });
  } catch (error) {
    console.error("Budgets fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

// POST /api/budgets — create a budget
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, categoryId, amount, period, startDate, items } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Budget name is required" },
        { status: 400 }
      );
    }
    // Legacy category budgets still need amount + period
    if (categoryId && (!amount || !period)) {
      return NextResponse.json(
        { success: false, error: "Amount and period are required for category budgets" },
        { status: 400 }
      );
    }

    // Optional starting items: [{ name, price }]
    const cleanItems = Array.isArray(items)
      ? items
          .filter((i: { name?: string; price?: number }) => i?.name && Number(i?.price) > 0)
          .map((i: { name: string; price: number }) => ({
            name: String(i.name).trim().slice(0, 100),
            price: Number(i.price),
            addedAt: new Date(),
          }))
      : [];

    await connectToDatabase();

    const budget = await Budget.create({
      userId,
      name: name.trim(),
      categoryId: categoryId || undefined,
      amount: amount ? Number(amount) : undefined,
      period: period || undefined,
      startDate: startDate ? new Date(startDate) : new Date(),
      items: cleanItems,
      status: "active",
    });

    return NextResponse.json(
      { success: true, data: { budget } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Budget creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create budget",
        details: process.env.NODE_ENV !== "production" ? (error as Error).message : undefined,
      },
      { status: 500 }
    );
  }
}
