import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Budget, Transaction, Account, Category } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

/*
 * PATCH /api/budgets/[id] — budget detail actions
 *   { action: "add_item", name, price }
 *   { action: "toggle_item", itemId, bought }
 *   { action: "close", accountId? }   ← deducts the total of all ticked
 *                                      items from the chosen account by
 *                                      creating one expense transaction.
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
    if (action === "add_item") {
      const name = String(body.name || "").trim();
      const price = Number(body.price);
      if (!name || !(price > 0)) {
        return NextResponse.json(
          { success: false, error: "Item name and a price greater than 0 are required" },
          { status: 400 }
        );
      }
      if (budget.status === "closed") {
        return NextResponse.json(
          { success: false, error: "Cannot add items to a closed budget" },
          { status: 400 }
        );
      }
      budget.items.push({
        name: name.slice(0, 100),
        price,
        bought: false,
        addedAt: new Date(),
      } as never);
      await budget.save();
      const added = budget.items[budget.items.length - 1];
      return NextResponse.json({ success: true, data: { item: added, budget } });
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
      item.bought = !!bought;
      item.boughtAt = item.bought ? new Date() : undefined;
      await budget.save();
      return NextResponse.json({ success: true, data: { item, budget } });
    }

    // ── Close the budget ────────────────────────────────────
    if (action === "close") {
      const t0 = Date.now();
      const step = (m: string) => console.log(`[close ${Date.now() - t0}ms] ${m}`);
      step("start");
      if (budget.status === "closed") {
        return NextResponse.json(
          { success: false, error: "Budget is already closed" },
          { status: 400 }
        );
      }

      const marked = budget.items.filter((i) => i.bought);
      const deducted = marked.reduce((s, i) => s + i.price, 0);

      let deductedFrom: string | null = null;

      if (deducted > 0) {
        // Pick target account: explicit choice → first cash → first account
        step("picking account (accountId=" + (body.accountId || "none") + ")");
        let account = null as null | { _id: Types.ObjectId; name: string };
        if (body.accountId) {
          account = await Account.findOne({ _id: body.accountId, userId }).lean();
          if (!account) {
            return NextResponse.json(
              { success: false, error: "Account not found" },
              { status: 404 }
            );
          }
        } else {
          const cash = await Account.findOne({ userId, type: "cash" }).lean();
          account = cash || (await Account.findOne({ userId }).lean());
        }
        if (!account) {
          return NextResponse.json(
            { success: false, error: "No account found to deduct from" },
            { status: 400 }
          );
        }

        // Category: budget's own → first expense category
        step("account picked, resolving category");
        let categoryId = budget.categoryId || null;
        if (!categoryId) {
          const cat = await Category.findOne({ userId, type: "expense" }).lean();
          categoryId = cat?._id || null;
        }
        if (!categoryId) {
          return NextResponse.json(
            { success: false, error: "No expense category found. Create one first." },
            { status: 400 }
          );
        }

        step("creating expense transaction");
        await Transaction.create({
          userId,
          type: "expense",
          amount: deducted,
          description: `Budget closed: ${budget.name}`,
          categoryId,
          accountId: account._id,
          date: new Date(),
          note: `${marked.length} item${marked.length === 1 ? "" : "s"} ticked`,
        });
        deductedFrom = account.name;
      }

      budget.status = "closed";
      budget.closedAt = new Date();
      await budget.save();
      step("done");

      return NextResponse.json({
        success: true,
        data: { budget, deducted, deductedFrom },
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
