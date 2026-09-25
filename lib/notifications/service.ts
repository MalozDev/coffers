import { Types } from "mongoose";
import { Account, Budget, ExpectedIncome, Goal, Notification, Reminder, Transaction } from "@/lib/models";
import { getAccountBalances } from "@/lib/utils/balances";

type NotificationType = "info" | "warning" | "success" | "reminder";

interface NotificationDraft {
  sourceKey: string;
  type: NotificationType;
  title: string;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function money(value: number): string {
  return `K${Math.round(value).toLocaleString()}`;
}

function dayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export async function buildNotificationDrafts(userId: string, now = new Date()): Promise<NotificationDraft[]> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const userIdOid = new Types.ObjectId(userId);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [expectedIncome, reminders, budgets, goals, monthFlows, accounts, accountBalances] = await Promise.all([
    ExpectedIncome.find({ userId, status: "pending", expectedDate: { $gte: today, $lte: weekEnd } }).lean(),
    Reminder.find({ userId, isCompleted: false, dueDate: { $lte: weekEnd } }).sort({ dueDate: 1 }).lean(),
    Budget.find({ userId }).populate("categoryId", "name").lean(),
    Goal.find({ userId, status: "active" }).lean(),
    Transaction.aggregate([
      { $match: { userId: userIdOid, date: { $gte: monthStart, $lte: now }, type: { $in: ["income", "expense"] } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
    Account.find({ userId }).lean(),
    getAccountBalances(userId),
  ]);

  const drafts: NotificationDraft[] = [];
  const flowMap = new Map(monthFlows.map((row) => [row._id, row.total]));
  const income = flowMap.get("income") || 0;
  const expenses = flowMap.get("expense") || 0;

  for (const item of expectedIncome) {
    const days = Math.ceil((new Date(item.expectedDate).getTime() - now.getTime()) / DAY_MS);
    drafts.push({
      sourceKey: `expected-income:${item._id}:${new Date(item.expectedDate).toISOString().slice(0, 10)}`,
      type: "info",
      title: `${item.source} expected`,
      message: `${money(item.amount)} expected ${dayLabel(days)}.`,
    });
  }

  for (const reminder of reminders) {
    const days = Math.ceil((new Date(reminder.dueDate).getTime() - now.getTime()) / DAY_MS);
    const overdue = days < 0;
    drafts.push({
      sourceKey: `reminder:${reminder._id}:${new Date(reminder.dueDate).toISOString().slice(0, 10)}`,
      type: overdue || days <= 1 ? "warning" : "reminder",
      title: overdue ? `Overdue: ${reminder.title}` : reminder.title,
      message: `${money(reminder.amount)} ${overdue ? `was due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` : `due ${dayLabel(days)}`}.`,
    });
  }

  for (const goal of goals) {
    const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
    const daysUntil = Math.ceil((new Date(goal.targetDate).getTime() - now.getTime()) / DAY_MS);
    if (remaining > 0 && daysUntil >= 0 && daysUntil <= 30) {
      drafts.push({
        sourceKey: `goal:deadline:${goal._id}:${new Date(goal.targetDate).toISOString().slice(0, 10)}`,
        type: "info",
        title: `${goal.name} target date is near`,
        message: `${money(remaining)} to go — ${daysUntil === 0 ? "today" : `${daysUntil} days`} left.`,
      });
    }
  }

  for (const budget of budgets) {
    if (!budget.amount || !budget.categoryId) continue;
    const spentRows = await Transaction.aggregate([
      { $match: { userId: userIdOid, type: "expense", categoryId: budget.categoryId, date: { $gte: monthStart, $lte: now } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const spent = spentRows[0]?.total || 0;
    const percentage = (spent / budget.amount) * 100;
    const categoryName = (budget.categoryId as { name?: string }).name || "this category";
    if (percentage >= 100) {
      drafts.push({
        sourceKey: `budget:over:${budget._id}:${monthKey}`,
        type: "warning",
        title: `${budget.name} limit reached`,
        message: `${money(spent)} of ${money(budget.amount)} ${budget.period} budget spent on ${categoryName}.`,
      });
    } else if (percentage >= 80) {
      drafts.push({
        sourceKey: `budget:near:${budget._id}:${monthKey}`,
        type: "warning",
        title: `${budget.name} is nearly used`,
        message: `${Math.round(percentage)}% of the ${categoryName} budget used — ${money(budget.amount - spent)} left.`,
      });
    }
  }

  const dayOfMonth = now.getDate();
  const daysInMonth = monthEnd.getDate();
  const projectedExpenses = dayOfMonth > 0 ? (expenses / dayOfMonth) * daysInMonth : 0;
  if (income > 0 && projectedExpenses > income * 1.1) {
    drafts.push({
      sourceKey: `cash-flow:overspending:${monthKey}`,
      type: "warning",
      title: "Spending is running high",
      message: `Spending may reach ${money(projectedExpenses)} this month against ${money(income)} income.`,
    });
  }

  for (const account of accounts) {
    const balance = accountBalances.get(String(account._id)) ?? account.openingBalance;
    if (account.type !== "savings" && balance < 100) {
      drafts.push({
        sourceKey: `balance:low:${account._id}:${monthKey}`,
        type: "warning",
        title: `Low balance: ${account.name}`,
        message: `${account.name} has ${money(balance)} available.`,
      });
    }
  }

  if (income > 0 && dayOfMonth >= 15) {
    const savingsRate = ((income - expenses) / income) * 100;
    if (savingsRate >= 20) {
      drafts.push({
        sourceKey: `savings:milestone:${monthKey}`,
        type: "success",
        title: "You are on a strong savings pace",
        message: `You've kept ${Math.round(savingsRate)}% of income this month.`,
      });
    }
  }

  return drafts;
}

export async function syncSmartNotifications(userId: string, now = new Date()) {
  const drafts = await buildNotificationDrafts(userId, now);
  if (drafts.length === 0) return;
  const userIdOid = new Types.ObjectId(userId);

  await Notification.bulkWrite(
    drafts.map((draft) => ({
      updateOne: {
        filter: { userId: userIdOid, sourceKey: draft.sourceKey },
        update: {
          $set: { type: draft.type, title: draft.title, message: draft.message },
          $setOnInsert: { userId: userIdOid, sourceKey: draft.sourceKey },
        },
        upsert: true,
      },
    }))
  );
}
