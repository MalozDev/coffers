import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { ExpectedIncome, Transaction, Account, Category } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

// PATCH — mark as received (creates income transaction) or update
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

    if (body.status === "received") {
      // Atomically claim the pending → received transition so a double tap
      // (or a second device) can never process the same income twice.
      const expected = await ExpectedIncome.findOneAndUpdate(
        { _id: id, userId, status: "pending" },
        { $set: { status: "received" } },
        { new: true }
      );
      if (!expected) {
        const existing = await ExpectedIncome.findOne({ _id: id, userId });
        if (existing && existing.status === "received") {
          return NextResponse.json(
            { success: false, error: "This income has already been marked as received." },
            { status: 409 }
          );
        }
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }

      const accountId = body.accountId;
      if (!accountId) {
        // Roll the claim back so the user can retry with an account.
        expected.status = "pending";
        await expected.save();
        return NextResponse.json({ success: false, error: "Choose the account where this income was received" }, { status: 400 });
      }

      const account = await Account.findOne({ _id: accountId, userId });
      const category = await Category.findOne({ userId, type: "income" }).sort({ createdAt: 1 });
      if (!account || !category) {
        expected.status = "pending";
        await expected.save();
        return NextResponse.json({ success: false, error: "A valid account and income category are required" }, { status: 400 });
      }

      try {
        await Transaction.create({
          userId,
          type: "income",
          source: "expected_income",
          amount: expected.amount,
          accountId,
          categoryId: category._id,
          description: `Expected income: ${expected.source}`,
          date: new Date(),
        });
      } catch (transactionError) {
        // Never leave the record claimed without the money landing.
        expected.status = "pending";
        await expected.save();
        throw transactionError;
      }

      return NextResponse.json({ success: true, data: { expectedIncome: expected } });
    }

    const expected = await ExpectedIncome.findOneAndUpdate(
      { _id: id, userId },
      { $set: body },
      { new: true }
    );
    if (!expected) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { expectedIncome: expected } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update" },
      { status: 500 }
    );
  }
}

// DELETE
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
    const expected = await ExpectedIncome.findOneAndDelete({ _id: id, userId });
    if (!expected) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { message: "Deleted" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete" },
      { status: 500 }
    );
  }
}
