import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGoal extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  monthlyContribution: number;
  fundingAccountId?: mongoose.Types.ObjectId;
  status: "active" | "completed" | "paused" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const GoalSchema = new Schema<IGoal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Goal name is required"],
      trim: true,
      maxlength: [100, "Goal name cannot exceed 100 characters"],
    },
    targetAmount: {
      type: Number,
      required: [true, "Target amount is required"],
      min: [1, "Target amount must be greater than 0"],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, "Current amount cannot be negative"],
    },
    targetDate: {
      type: Date,
      required: [true, "Target date is required"],
    },
    monthlyContribution: {
      type: Number,
      default: 0,
      min: [0, "Monthly contribution cannot be negative"],
    },
    fundingAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
    },
    status: {
      type: String,
      enum: ["active", "completed", "paused", "cancelled"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

GoalSchema.index({ userId: 1, status: 1 });

const Goal: Model<IGoal> =
  mongoose.models.Goal || mongoose.model<IGoal>("Goal", GoalSchema);

export default Goal;
