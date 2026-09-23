import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReminder extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  dueDate: Date;
  amount: number;
  categoryId?: mongoose.Types.ObjectId;
  recurrence: "none" | "daily" | "weekly" | "monthly" | "yearly";
  isCompleted: boolean;
  /* Once-off reminders become "closed" after they are completed */
  status: "active" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Reminder title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    recurrence: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly", "yearly"],
      default: "none",
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

ReminderSchema.index({ userId: 1, dueDate: 1, isCompleted: 1 });

const Reminder: Model<IReminder> =
  mongoose.models.Reminder ||
  mongoose.model<IReminder>("Reminder", ReminderSchema);

export default Reminder;
