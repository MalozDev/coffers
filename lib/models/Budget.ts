import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBudget extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  categoryId: mongoose.Types.ObjectId;
  amount: number;
  period: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
}

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
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    amount: {
      type: Number,
      required: [true, "Budget amount is required"],
      min: [0.01, "Budget amount must be greater than 0"],
    },
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: [true, "Budget period is required"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

BudgetSchema.index({ userId: 1, categoryId: 1, period: 1 });

const Budget: Model<IBudget> =
  mongoose.models.Budget || mongoose.model<IBudget>("Budget", BudgetSchema);

export default Budget;
