import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/db/connect";
import { Budget, Transaction, Account, Category } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";
import { getAccountBalance } from "@/lib/utils/balances";

/*
 * PATCH /api/budgets/[id] — budget detail actions
 *   { action: "add_items", items: [{ name, price? }] }
 *   { action: "toggle_item", itemId, bought }
 *   { action: "close", accountId?, prices?: [{ itemId, price }] }
 *
 * DELETE /api/budgets/[id] — delete a budget that is already closed
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
      // Price is optional: an item can be added before its price is known
      // and priced later (at checkout).
      const cleanItems = rawItems.map((entry: { name?: string; price?: number | string }) => {
        const price =
          entry.price === undefined || entry.price === null || entry.price === ""
            ? NaN
            : Number(entry.price);
        return {
          name: String(entry.name || "").trim().slice(0, 100),
          ...(Number.isFinite(price) && price > 0 ? { price } : {}),
          bought: false,
          addedAt: new Date(),
        };
      });
      if (cleanItems.some((entry) => !entry.name)) {
        return NextResponse.json({ success: false, error: "Every item needs a name" }, { status: 400 });
      }
      budget.items.push(...cleanItems as never[]);
      await budget.save();
      return NextResponse.json({ success: true, data: { budget } });
    }

    // ── Tick / untick an item (no money moves yet) ──────────
    if (action === "toggle_item") {
      const { itemId, bought } = body;
      if (!Types.ObjectId.isValid(itemId)) {
        return NextResponse.json({ success: false, error: "Invalid item id" }, { status: 400 });
      }
      if (budget.status === "closed") {
        return NextResponse.json({ success: false, error: "This budget is already closed" }, { status: 400 });
      }
      const item = budget.items.find((i) => String(i._id) === String(itemId));
      if (!item) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      if (!!bought === item.bought) {
        return NextResponse.json({ success: true, data: { item, budget } });
      }

      // Legacy budgets recorded expenses at tick time — unticking still
      // reverses that old transaction so balances stay correct.
      if (!bought && item.transactionId) {
        await Transaction.deleteOne({ _id: item.transactionId, userId });
        item.transactionId = undefined;
      }
      item.bought = !!bought;
      item.boughtAt = item.bought ? new Date() : undefined;
      await budget.save();
      return NextResponse.json({ success: true, data: { item, budget } });
    }

    // ── Close the budget ────────────────────────────────────
    // Only checked items count: their total is deducted from the budget's
    // payment account, then the budget is closed. Transactions are created
    // first and rolled back on any failure so account + budget never drift.
    if (action === "close") {
      if (budget.status === "closed") {
        return NextResponse.json(
          { success: false, error: "Budget is already closed" },
          { status: 400 }
        );
      }

      // Only checked items count as spending; items recorded by the old
      // tick-time flow already sit in the ledger and are not charged twice.
      const checked = budget.items.filter((i) => i.bought && !i.transactionId);

      // Checkout price confirmation: the price you estimate when adding an
      // item often differs from what you actually pay, so the close dialog
      // lets you confirm/edit each price first. Persisted before the money
      // moves so an edit is never lost if the close then fails.
      const confirmedPrices = Array.isArray(body.prices) ? body.prices : [];
      if (confirmedPrices.length > 0) {
        for (const entry of confirmedPrices as { itemId?: string; price?: number | string }[]) {
          const price =
            entry.price === undefined || entry.price === null || entry.price === ""
              ? NaN
              : Number(entry.price);
          if (!entry.itemId || !Types.ObjectId.isValid(entry.itemId)) {
            return NextResponse.json({ success: false, error: "Invalid item id" }, { status: 400 });
          }
          if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json(
              { success: false, error: "Every checked item needs a price greater than 0" },
              { status: 400 }
            );
          }
          const item = budget.items.find((i) => String(i._id) === String(entry.itemId));
          if (!item) {
            return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
          }
          if (item.price !== price) item.price = price;
        }
        await budget.save();
      }

      // Every checked item must carry a real price before money can move —
      // unpriced items are confirmed during checkout.
      const unpriced = checked.find((i) => !(Number(i.price) > 0));
      if (unpriced) {
        return NextResponse.json(
          {
            success: false,
            error: `Confirm the price of "${unpriced.name}" before closing this budget.`,
          },
          { status: 400 }
        );
      }

      const checkedTotal = checked.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

      const paymentAccountId = body.accountId || budget.accountId;
      const createdTransactionIds: string[] = [];

      try {
        if (checked.length > 0) {
          if (!paymentAccountId) {
            return NextResponse.json(
              { success: false, error: "Choose the payment account before closing" },
              { status: 400 }
            );
          }
          const account = await Account.findOne({ _id: paymentAccountId, userId }).lean();
          if (!account) {
            return NextResponse.json({ success: false, error: "Payment account not found" }, { status: 404 });
          }

          // Never overdraw: the payment account must cover the checked items.
          const available = (await getAccountBalance(userId, paymentAccountId)) ?? 0;
          if (checkedTotal > available) {
            return NextResponse.json(
              {
                success: false,
                error: `Not enough balance in ${account.name}. Available: K${Math.max(available, 0).toLocaleString()}, but the checked items total K${checkedTotal.toLocaleString()}. Choose another payment account or add funds first.`,
                availableBalance: available,
                required: checkedTotal,
              },
              { status: 409 }
            );
          }

          let categoryId = budget.categoryId || null;
          if (!categoryId) {
            const category = await Category.findOne({ userId, type: "expense" })
              .sort({ createdAt: 1 })
              .lean();
            categoryId = category?._id || null;
          }
          if (!categoryId) {
            return NextResponse.json(
              { success: false, error: "Create an expense category before closing this budget" },
              { status: 400 }
            );
          }

          for (const item of checked) {
            const transaction = await Transaction.create({
              userId,
              type: "expense",
              source: "budget",
              amount: Number(item.price),
              categoryId,
              accountId: paymentAccountId,
              description: `Budget item: ${item.name}`,
              date: new Date(),
            });
            createdTransactionIds.push(String(transaction._id));
            item.transactionId = transaction._id;
          }

          budget.accountId = paymentAccountId;
        }

        budget.status = "closed";
        budget.closedAt = new Date();
        await budget.save();
      } catch (closeError) {
        // Compensate: undo anything we already wrote before reporting failure
        if (createdTransactionIds.length > 0) {
          await Transaction.deleteMany({
            _id: { $in: createdTransactionIds },
            userId,
          });
          checked.forEach((item) => {
            item.transactionId = undefined;
          });
        }
        throw closeError;
      }

      return NextResponse.json({
        success: true,
        data: {
          budget,
          deducted: checkedTotal,
          deductedFrom: checked.length > 0 ? paymentAccountId : null,
        },
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

    const budget = await Budget.findOne({ _id: id, userId });
    if (!budget) {
      return NextResponse.json({ success: false, error: "Budget not found" }, { status: 404 });
    }
    if (budget.status !== "closed") {
      return NextResponse.json(
        { success: false, error: "Only closed budgets can be deleted" },
        { status: 400 }
      );
    }

    // Recorded expense transactions stay — they already happened.
    await budget.deleteOne();
    return NextResponse.json({ success: true, data: { message: "Budget deleted" } });
  } catch (error) {
    console.error("Budget delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}
