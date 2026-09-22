import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Budget, Transaction, Account, Category } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

/*
 * PATCH /api/budgets/[id] — budget detail actions
 *   { action: "add_items", items: [{ name, price }] }
 *   { action: "toggle_item", itemId, bought, accountId }
 *   { action: "close" }
 */
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
    const action = body.action;

    await connectToDatabase();

    const budget = await Budget.findOne({ _id: id, userId });
    if (!budget) {
      return NextResponse.json({ success: false, error: "Budget not found" }, { status: 404 });
    }

    // ── Add an item ─────────────────────────────────────────
    if (action === "add_items" || action === "add_item") {
      const rawItems = action === "add_items" ? body.items : [{ name: body.name, price: body.price }];
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return NextResponse.json({ success: false, error: "Add at least one item" }, { status: 400 });
      }
      if (budget.status === "closed") {
        return NextResponse.json({ success: false, error: "Cannot add items to a closed budget" }, { status: 400 });
      }
      const cleanItems = rawItems.map((entry: { name?: string; price?: number }) => ({
        name: String(entry.name || "").trim().slice(0, 100),
        price: Number(entry.price),
        bought: false,
        addedAt: new Date(),
      }));
      if (cleanItems.some((entry) => !entry.name || !(entry.price > 0))) {
        return NextResponse.json({ success: false, error: "Every item needs a name and a price greater than 0" }, { status: 400 });
      }
      budget.items.push(...cleanItems as never[]);
      await budget.save();
      return NextResponse.json({ success: true, data: { budget } });
    }

    // ── Mark item bought / not bought ───────────────────────
    if (action === "toggle_item") {
      const { itemId, bought } = body;
      if (!Types.ObjectId.isValid(itemId)) {
        return NextResponse.json({ success: false, error: "Invalid item id" }, { status: 400 });
      }
      const item = budget.items.find((i) => String(i._id) === String(itemId));
      if (!item) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      if (!!bought === item.bought) {
        return NextResponse.json({ success: true, data: { item, budget } });
      }

      let categoryId = budget.categoryId || null;
      if (!categoryId) {
        const category = await Category.findOne({ userId, type: "expense" }).sort({ createdAt: 1 }).lean();
        categoryId = category?._id || null;
      }
      if (!categoryId) {
        return NextResponse.json({ success: false, error: "Create an expense category before marking an item bought" }, { status: 400 });
      }

      if (bought) {
        if (!body.accountId) {
          return NextResponse.json({ success: false, error: "Choose the account used to pay for this item" }, { status: 400 });
        }
        const account = await Account.findOne({ _id: body.accountId, userId }).lean();
        if (!account) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
        const transaction = await Transaction.create({
          userId,
          type: "expense",
          amount: item.price,
          categoryId,
          accountId: account._id,
          description: `Budget item: ${item.name}`,
          date: new Date(),
        });
        item.transactionId = transaction._id;
      } else if (item.transactionId) {
        await Transaction.deleteOne({ _id: item.transactionId, userId });
        item.transactionId = undefined;
      }
      item.bought = !!bought;
      item.boughtAt = item.bought ? new Date() : undefined;
      await budget.save();
      return NextResponse.json({ success: true, data: { item, budget } });
    }

    // ── Close the budget ────────────────────────────────────
    if (action === "close") {
      if (budget.status === "closed") {
        return NextResponse.json(
          { success: false, error: "Budget is already closed" },
          { status: 400 }
        );
      }

      budget.status = "closed";
      budget.closedAt = new Date();
      await budget.save();

      return NextResponse.json({
        success: true,
        data: { budget, deducted: 0, deductedFrom: null },
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Budget update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update budget" },
      { status: 500 }
    );
  }
}
