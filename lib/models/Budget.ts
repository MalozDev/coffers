import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBudgetItem {
  _id: mongoose.Types.ObjectId;
  name: string;
  price: number;
  bought: boolean;
  boughtAt?: Date;
  transactionId?: mongoose.Types.ObjectId;
  addedAt: Date;
}

export interface IBudget extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  categoryId?: mongoose.Types.ObjectId;
  amount?: number;
  period?: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate?: Date;
  /* Shopping-list style budget */
  items: IBudgetItem[];
  status: "active" | "closed";
  closedAt?: Date;
  /* Payment/account method the checked items are paid from on close */
  accountId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const BudgetItemSchema = new Schema<IBudgetItem>(
  {
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: [100, "Item name cannot exceed 100 characters"],
    },
    price: {
      type: Number,
      required: [true, "Item price is required"],
      min: [0.01, "Item price must be greater than 0"],
    },
    bought: { type: Boolean, default: false },
    boughtAt: { type: Date },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const BudgetSchema = new Schema<IBudget>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Budget name is required"],
      trim: true,
      maxlength: [100, "Budget name cannot exceed 100 characters"],
    },
    /* Legacy category-limit fields — optional so new shopping-list budgets
       (name + items + status) can be created without them. */
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: false,
    },
    amount: {
      type: Number,
      required: false,
      min: [0.01, "Budget amount must be greater than 0"],
    },
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: false,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    /* Payment method chosen when the budget is initiated — the account
       the checked items are deducted from when the budget closes. */
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: false,
    },
    /* Shopping-list budget */
    items: { type: [BudgetItemSchema], default: [] },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

BudgetSchema.index({ userId: 1, categoryId: 1, period: 1 });

const Budget: Model<IBudget> =
  mongoose.models.Budget || mongoose.model<IBudget>("Budget", BudgetSchema);

export default Budget;
