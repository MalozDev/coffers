import { NextRequest, NextResponse } from "next/server";
import { Account, Budget, Goal, Transaction, User } from "@/lib/models";
import { getAdminUserId } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const [users, accounts, transactions, budgets, goals] = await Promise.all([
      User.find({}).select("name email phoneNumber isAdmin createdAt").sort({ createdAt: -1 }).lean(),
      Account.countDocuments({}),
      Transaction.countDocuments({}),
      Budget.countDocuments({}),
      Goal.countDocuments({}),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users,
        stats: { users: users.length, accounts, transactions, budgets, goals },
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json({ success: false, error: "Failed to load admin overview" }, { status: 500 });
  }
}
