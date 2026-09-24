import mongoose, { Schema, Document, Model } from "mongoose";

export type TransactionSource =
  | "manual"
  | "reminder"
  | "budget"
  | "saving"
  | "expected_income";

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: "income" | "expense" | "transfer";
  /* Which feature moved the money — shown as the activity source */
  source?: TransactionSource;
  amount: number;
  categoryId?: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  toAccountId?: mongoose.Types.ObjectId;
  payments?: Array<{
    accountId: mongoose.Types.ObjectId;
    amount: number;
  }>;
  description: string;
  note?: string;
  date: Date;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["income", "expense", "transfer"],
      required: [true, "Transaction type is required"],
    },
    /* What touched the balance. Legacy documents predate the field, so it
       defaults to "manual" and the API infers older rows from their
       description. */
    source: {
      type: String,
      enum: ["manual", "reminder", "budget", "saving", "expected_income"],
      default: "manual",
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: function (this: ITransaction) {
        return this.type !== "transfer";
      },
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "Source account is required"],
    },
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: function (this: ITransaction) {
        return this.type === "transfer";
      },
    },
    payments: [{
      accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
      amount: { type: Number, required: true, min: 0.01 },
    }],
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, type: 1 });
TransactionSchema.index({ userId: 1, categoryId: 1 });
TransactionSchema.index({ userId: 1, accountId: 1 });

const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default Transaction;
