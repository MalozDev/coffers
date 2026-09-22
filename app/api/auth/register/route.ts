import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db/connect";
import { User, Account, Category, Notification } from "@/lib/models";
import { registerSchema } from "@/lib/validation/auth";

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Groceries", color: "#E85D04", icon: "🍔" },
  { name: "Transport", color: "#3066BE", icon: "🚗" },
  { name: "Housing", color: "#090C9B", icon: "🏠" },
  { name: "Utilities", color: "#3C3744", icon: "⚡" },
  { name: "Health", color: "#2D6A4F", icon: "🏥" },
  { name: "Education", color: "#7B2CBF", icon: "📚" },
  { name: "Entertainment", color: "#9B5DE5", icon: "🎮" },
  { name: "Family & Giving", color: "#F15BB5", icon: "👨‍👩‍👧" },
  { name: "Shopping", color: "#FEE440", icon: "🛒" },
  { name: "Personal Care", color: "#00BBF9", icon: "💇" },
  { name: "Financial", color: "#00F5D4", icon: "💰" },
  { name: "Other", color: "#9B9B9B", icon: "📦" },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary", color: "#2D6A4F", icon: "💼" },
  { name: "Freelance", color: "#3066BE", icon: "💻" },
  { name: "Business", color: "#090C9B", icon: "🏪" },
  { name: "Credit/Loan", color: "#F15BB5", icon: "🏦" },
  { name: "Gift", color: "#9B5DE5", icon: "🎁" },
  { name: "Other", color: "#9B9B9B", icon: "📦" },
];

const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "cash" as const },
  { name: "Mobile Money", type: "mobile_money" as const },
  { name: "Bank", type: "bank" as const },
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, phoneNumber, password } = result.data;

    await connectToDatabase();

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email,
      phoneNumber,
      passwordHash,
      defaultCurrency: "ZMK",
    });

    // Create default accounts
    const accounts = DEFAULT_ACCOUNTS.map((account) => ({
      userId: user._id,
      ...account,
      openingBalance: 0,
      currency: "ZMK" as const,
    }));
    await Account.insertMany(accounts);

    // Create default categories
    const expenseCategories = DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
      userId: user._id,
      ...cat,
      type: "expense" as const,
      isDefault: true,
    }));
    const incomeCategories = DEFAULT_INCOME_CATEGORIES.map((cat) => ({
      userId: user._id,
      ...cat,
      type: "income" as const,
      isDefault: true,
    }));
    await Category.insertMany([...expenseCategories, ...incomeCategories]);

    await Notification.create({
      userId: user._id,
      type: "welcome",
      title: "Welcome to Coffers",
      message: "Your account is ready. Add your first income or expense to start understanding your money.",
    });

    // Create session token
    const token = Buffer.from(
      JSON.stringify({
        userId: user._id,
        email: user.email,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      })
    ).toString("base64");

    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            defaultCurrency: user.defaultCurrency,
          },
        },
      },
      { status: 201 }
    );

    // Set auth cookie
    response.cookies.set("coffers-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
