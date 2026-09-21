import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExpectedIncome extends Document {
  userId: mongoose.Types.ObjectId;
  source: string;
  amount: number;
  expectedDate: Date;
  status: "pending" | "received" | "cancelled";
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExpectedIncomeSchema = new Schema<IExpectedIncome>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: [true, "Source is required"],
      trim: true,
      maxlength: [100, "Source cannot exceed 100 characters"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    expectedDate: {
      type: Date,
      required: [true, "Expected date is required"],
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "received", "cancelled"],
      default: "pending",
    },
    note: {
      type: String,
      trim: true,
      maxlength: [300, "Note cannot exceed 300 characters"],
    },
  },
  {
    timestamps: true,
  }
);

ExpectedIncomeSchema.index({ userId: 1, status: 1, expectedDate: 1 });

const ExpectedIncome: Model<IExpectedIncome> =
  mongoose.models.ExpectedIncome ||
  mongoose.model<IExpectedIncome>("ExpectedIncome", ExpectedIncomeSchema);

export default ExpectedIncome;
