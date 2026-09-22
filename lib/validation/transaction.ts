import { z } from "zod";

export const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount cannot exceed 10,000,000"),
  categoryId: z.string().min(1, "Category is required").optional(),
  accountId: z.string().min(1, "Account is required"),
  toAccountId: z.string().optional(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(200, "Description cannot exceed 200 characters")
    .trim(),
  note: z
    .string()
    .max(500, "Note cannot exceed 500 characters")
    .trim()
    .optional(),
  // coerce: the client sends an ISO string over JSON, not a Date instance
  date: z.coerce.date({
    error: "Date is required",
  }),
  payments: z.array(z.object({
    accountId: z.string().min(1),
    amount: z.number().positive(),
  })).min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.type !== "transfer" && !data.categoryId) {
    ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Category is required" });
  }
  if (data.type === "expense" && data.payments) {
    const total = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(total - data.amount) > 0.005) {
      ctx.addIssue({ code: "custom", path: ["payments"], message: "Payment amounts must equal the expense amount" });
    }
  }
});

export const quickExpenseSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount cannot exceed 10,000,000"),
  categoryId: z.string().min(1, "Category is required"),
  accountId: z.string().min(1, "Account is required"),
});

export const transferSchema = z
  .object({
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .max(10000000, "Amount cannot exceed 10,000,000"),
    accountId: z.string().min(1, "From account is required"),
    toAccountId: z.string().min(1, "To account is required"),
    description: z
      .string()
      .max(200, "Description cannot exceed 200 characters")
      .trim()
      .optional(),
    date: z.coerce.date({
      error: "Date is required",
    }),
  })
  .refine((data) => data.accountId !== data.toAccountId, {
    message: "Cannot transfer to the same account",
    path: ["toAccountId"],
  });

export type TransactionInput = z.infer<typeof transactionSchema>;
export type QuickExpenseInput = z.infer<typeof quickExpenseSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
