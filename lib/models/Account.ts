import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccount extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: "cash" | "bank" | "mobile_money" | "savings" | "custom";
  openingBalance: number;
  currency: "ZMK";
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
      maxlength: [50, "Account name cannot exceed 50 characters"],
    },
    type: {
      type: String,
      enum: ["cash", "bank", "mobile_money", "savings", "custom"],
      required: [true, "Account type is required"],
    },
    openingBalance: {
      type: Number,
      default: 0,
      min: [0, "Opening balance cannot be negative"],
    },
    currency: {
      type: String,
      enum: ["ZMK"],
      default: "ZMK",
    },
  },
  {
    timestamps: true,
  }
);

AccountSchema.index({ userId: 1, type: 1 });

const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);

export default Account;
