import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex).trim();
  const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in .env.local");
  process.exit(1);
}

// Schemas inline to avoid import issues
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  phoneNumber: String,
  passwordHash: { type: String, select: false },
  defaultCurrency: { type: String, default: "ZMK" },
}, { timestamps: true });

const AccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  type: { type: String, enum: ["cash", "mobile_money", "bank", "other"] },
  openingBalance: { type: Number, default: 0 },
  currency: { type: String, default: "ZMK" },
}, { timestamps: true });

const CategorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  type: { type: String, enum: ["income", "expense"] },
  color: String,
  icon: String,
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["income", "expense", "transfer"] },
  amount: Number,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  toAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  description: String,
  note: String,
  date: Date,
}, { timestamps: true });

const BudgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  amount: Number,
  period: { type: String, enum: ["daily", "weekly", "monthly"] },
  startDate: Date,
}, { timestamps: true });

const GoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  targetAmount: Number,
  currentAmount: { type: Number, default: 0 },
  targetDate: Date,
  monthlyContribution: { type: Number, default: 0 },
  status: { type: String, default: "active" },
}, { timestamps: true });

const ReminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  dueDate: Date,
  amount: Number,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  recurrence: { type: String, default: "none" },
  isCompleted: { type: Boolean, default: false },
}, { timestamps: true });

const ExpectedIncomeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  source: String,
  amount: Number,
  expectedDate: Date,
  status: { type: String, default: "pending" },
  note: String,
}, { timestamps: true });

async function seed() {
  console.log("🌱 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!, { serverSelectionTimeoutMS: 30000, socketTimeoutMS: 45000 });
  console.log("✅ Connected");

  const User = mongoose.model("User", UserSchema);
  const Account = mongoose.model("Account", AccountSchema);
  const Category = mongoose.model("Category", CategorySchema);
  const Transaction = mongoose.model("Transaction", TransactionSchema);
  const Budget = mongoose.model("Budget", BudgetSchema);
  const Goal = mongoose.model("Goal", GoalSchema);
  const Reminder = mongoose.model("Reminder", ReminderSchema);
  const ExpectedIncome = mongoose.model("ExpectedIncome", ExpectedIncomeSchema);

  // Clear existing data
  console.log("🗑️  Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Account.deleteMany({}),
    Category.deleteMany({}),
    Transaction.deleteMany({}),
    Budget.deleteMany({}),
    Goal.deleteMany({}),
    Reminder.deleteMany({}),
    ExpectedIncome.deleteMany({}),
  ]);

  // Create test user
  console.log("👤 Creating test user...");
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await User.create({
    name: "Mwila Banda",
    email: "test@coffers.com",
    phoneNumber: "+260 97 123 4567",
    passwordHash,
    defaultCurrency: "ZMK",
  });
  console.log(`   ✅ User: ${user.email} (password: password123)`);

  // Create accounts
  console.log("🏦 Creating accounts...");
  const [cash, mobileMoney, bank] = await Account.create([
    { userId: user._id, name: "Cash", type: "cash", openingBalance: 2500, currency: "ZMK" },
    { userId: user._id, name: "Mobile Money", type: "mobile_money", openingBalance: 8500, currency: "ZMK" },
    { userId: user._id, name: "Bank", type: "bank", openingBalance: 45000, currency: "ZMK" },
  ]);
  console.log(`   ✅ Cash: K2,500 | Mobile Money: K8,500 | Bank: K45,000`);

  // Create categories
  console.log("📂 Creating categories...");
  const expenseCategories = await Category.create([
    { userId: user._id, name: "Food & Groceries", type: "expense", color: "#E85D04", icon: "🍔", isDefault: true },
    { userId: user._id, name: "Transport", type: "expense", color: "#3066BE", icon: "🚗", isDefault: true },
    { userId: user._id, name: "Housing", type: "expense", color: "#090C9B", icon: "🏠", isDefault: true },
    { userId: user._id, name: "Utilities", type: "expense", color: "#3C3744", icon: "⚡", isDefault: true },
    { userId: user._id, name: "Entertainment", type: "expense", color: "#9B5DE5", icon: "🎮", isDefault: true },
    { userId: user._id, name: "Shopping", type: "expense", color: "#FEE440", icon: "🛒", isDefault: true },
  ]);

  const incomeCategories = await Category.create([
    { userId: user._id, name: "Salary", type: "income", color: "#2D6A4F", icon: "💼", isDefault: true },
    { userId: user._id, name: "Freelance", type: "income", color: "#3066BE", icon: "💻", isDefault: true },
    { userId: user._id, name: "Business", type: "income", color: "#090C9B", icon: "🏪", isDefault: true },
  ]);

  const [foodCat, transportCat, housingCat, utilitiesCat, entertainmentCat, shoppingCat] = expenseCategories;
  const [salaryCat, freelanceCat] = incomeCategories;
  console.log(`   ✅ ${expenseCategories.length} expense + ${incomeCategories.length} income categories`);

  // Create transactions
  console.log("💸 Creating transactions...");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (d: number) => new Date(today.getTime() - d * 24 * 60 * 60 * 1000);

  await Transaction.create([
    // Income
    { userId: user._id, type: "income", amount: 15000, categoryId: salaryCat._id, accountId: bank._id, description: "Monthly Salary", date: daysAgo(1) },
    { userId: user._id, type: "income", amount: 3500, categoryId: freelanceCat._id, accountId: mobileMoney._id, description: "Website Design Project", date: daysAgo(3) },
    { userId: user._id, type: "income", amount: 800, categoryId: freelanceCat._id, accountId: mobileMoney._id, description: "Logo Design", date: daysAgo(10) },

    // Expenses - this month
    { userId: user._id, type: "expense", amount: 450, categoryId: foodCat._id, accountId: mobileMoney._id, description: "Shoprite Groceries", date: today },
    { userId: user._id, type: "expense", amount: 120, categoryId: transportCat._id, accountId: cash._id, description: "Bus fare to town", date: today },
    { userId: user._id, type: "expense", amount: 250, categoryId: foodCat._id, accountId: mobileMoney._id, description: "Lunch at Wimpy", date: daysAgo(1) },
    { userId: user._id, type: "expense", amount: 3500, categoryId: housingCat._id, accountId: bank._id, description: "House Rent", date: daysAgo(2) },
    { userId: user._id, type: "expense", amount: 450, categoryId: utilitiesCat._id, accountId: mobileMoney._id, description: "ZESCO Electricity", date: daysAgo(3) },
    { userId: user._id, type: "expense", amount: 200, categoryId: transportCat._id, accountId: cash._id, description: "Fuel", date: daysAgo(4) },
    { userId: user._id, type: "expense", amount: 180, categoryId: foodCat._id, accountId: mobileMoney._id, description: "Chicken Inn", date: daysAgo(5) },
    { userId: user._id, type: "expense", amount: 890, categoryId: shoppingCat._id, accountId: bank._id, description: "Clothes at Shoprite", date: daysAgo(6) },
    { userId: user._id, type: "expense", amount: 150, categoryId: entertainmentCat._id, accountId: mobileMoney._id, description: "Movie Night", date: daysAgo(7) },
    { userId: user._id, type: "expense", amount: 350, categoryId: foodCat._id, accountId: cash._id, description: "Market Vegetables", date: daysAgo(8) },

    // Last month expenses
    { userId: user._id, type: "expense", amount: 3500, categoryId: housingCat._id, accountId: bank._id, description: "House Rent", date: daysAgo(32) },
    { userId: user._id, type: "expense", amount: 420, categoryId: utilitiesCat._id, accountId: mobileMoney._id, description: "ZESCO Electricity", date: daysAgo(33) },
    { userId: user._id, type: "expense", amount: 2800, categoryId: foodCat._id, accountId: mobileMoney._id, description: "Monthly Groceries", date: daysAgo(34) },
  ]);
  console.log("   ✅ 16 transactions created");

  // Create budgets
  console.log("📊 Creating budgets...");
  await Budget.create([
    { userId: user._id, name: "Food Budget", categoryId: foodCat._id, amount: 3000, period: "monthly", startDate: today },
    { userId: user._id, name: "Transport Budget", categoryId: transportCat._id, amount: 1500, period: "monthly", startDate: today },
    { userId: user._id, name: "Entertainment Budget", categoryId: entertainmentCat._id, amount: 800, period: "monthly", startDate: today },
  ]);
  console.log("   ✅ 3 budgets created");

  // Create goals
  console.log("🎯 Creating goals...");
  const futureDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  const yearDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  await Goal.create([
    { userId: user._id, name: "Emergency Fund", targetAmount: 50000, currentAmount: 12000, targetDate: yearDate, monthlyContribution: 3000, status: "active" },
    { userId: user._id, name: "New Laptop", targetAmount: 25000, currentAmount: 8000, targetDate: futureDate, monthlyContribution: 3000, status: "active" },
    { userId: user._id, name: "Holiday Trip", targetAmount: 15000, currentAmount: 2500, targetDate: yearDate, monthlyContribution: 1500, status: "active" },
  ]);
  console.log("   ✅ 3 goals created");

  // Create reminders
  console.log("⏰ Creating reminders...");
  const nextWeek = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  await Reminder.create([
    { userId: user._id, title: "Pay electricity bill", dueDate: nextWeek, amount: 450, recurrence: "monthly" },
    { userId: user._id, title: "Internet subscription", dueDate: nextMonth, amount: 200, recurrence: "monthly" },
    { userId: user._id, title: "Pay house rent", dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1), amount: 3500, recurrence: "monthly" },
  ]);
  console.log("   ✅ 3 reminders created");

  // Create expected income
  console.log("💰 Creating expected income...");
  const nextPayday = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  await ExpectedIncome.create([
    { userId: user._id, source: "Monthly Salary", amount: 15000, expectedDate: nextPayday, status: "pending" },
    { userId: user._id, source: "Freelance Project", amount: 5000, expectedDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), status: "pending" },
  ]);
  console.log("   ✅ 2 expected income items created");

  console.log("\n🎉 Seed complete!");
  console.log("\n📋 Test credentials:");
  console.log("   Email: test@coffers.com");
  console.log("   Password: password123");
  console.log("\n📊 Summary:");
  console.log("   1 user | 3 accounts | 9 categories");
  console.log("   16 transactions | 3 budgets | 3 goals");
  console.log("   3 reminders | 2 expected income");

  await mongoose.disconnect();
  console.log("\n👋 Disconnected from MongoDB");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
