import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { ExpectedIncome, Transaction, Account } from "@/lib/models";
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
      const expected = await ExpectedIncome.findOne({ _id: id, userId });
      if (!expected) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }

      // Create income transaction
      const accounts = await Account.find({ userId }).sort({ createdAt: 1 });
      const accountId = accounts[0]?._id;

      if (accountId) {
        await Transaction.create({
          userId,
          type: "income",
          amount: expected.amount,
          accountId,
          description: `Expected income: ${expected.source}`,
          date: new Date(),
        });
      }

      expected.status = "received";
      await expected.save();

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
