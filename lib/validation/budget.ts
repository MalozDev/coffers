import { z } from "zod";

export const budgetSchema = z.object({
  name: z
    .string()
    .min(1, "Budget name is required")
    .max(100, "Budget name cannot exceed 100 characters")
    .trim(),
  categoryId: z.string().min(1, "Category is required"),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount cannot exceed 10,000,000"),
  period: z.enum(["daily", "weekly", "monthly"]),
  startDate: z.date({
    error: "Start date is required",
  }),
  endDate: z.date().optional(),
});

export const goalSchema = z.object({
  name: z
    .string()
    .min(1, "Goal name is required")
    .max(100, "Goal name cannot exceed 100 characters")
    .trim(),
  targetAmount: z
    .number()
    .positive("Target amount must be greater than 0")
    .max(100000000, "Target amount cannot exceed 100,000,000"),
  targetDate: z.date({
    error: "Target date is required",
  }),
  monthlyContribution: z
    .number()
    .min(0, "Monthly contribution cannot be negative")
    .max(10000000, "Monthly contribution cannot exceed 10,000,000"),
});

export const reminderSchema = z.object({
  title: z
    .string()
    .min(1, "Reminder title is required")
    .max(100, "Title cannot exceed 100 characters")
    .trim(),
  dueDate: z.date({
    error: "Due date is required",
  }),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount cannot exceed 10,000,000"),
  categoryId: z.string().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
});

export const expectedIncomeSchema = z.object({
  source: z
    .string()
    .min(1, "Source is required")
    .max(100, "Source cannot exceed 100 characters")
    .trim(),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount cannot exceed 10,000,000"),
  expectedDate: z.date({
    error: "Expected date is required",
  }),
  note: z
    .string()
    .max(300, "Note cannot exceed 300 characters")
    .trim()
    .optional(),
});

export type BudgetInput = z.infer<typeof budgetSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type ReminderInput = z.infer<typeof reminderSchema>;
export type ExpectedIncomeInput = z.infer<typeof expectedIncomeSchema>;
