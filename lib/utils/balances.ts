import { Account, Transaction } from "@/lib/models";

/**
 * Current balance for every account of a user: opening balance plus the
 * effect of each transaction (income in, expenses/splits out, transfers
 * either way). Routes use this BEFORE moving money so an account is never
 * silently overdrawn.
 */
export async function getAccountBalances(
  userId: string
): Promise<Map<string, number>> {
  const accounts = await Account.find({ userId })
    .select("openingBalance")
    .lean();
  const transactions = await Transaction.find({ userId })
    .select("type amount accountId toAccountId payments")
    .lean();

  const balances = new Map<string, number>(
    accounts.map((account) => [String(account._id), account.openingBalance])
  );

  for (const transaction of transactions) {
    if (transaction.type === "income") {
      const key = String(transaction.accountId);
      if (balances.has(key)) {
        balances.set(key, (balances.get(key) || 0) + transaction.amount);
      }
    } else if (transaction.type === "expense") {
      if (transaction.payments && transaction.payments.length > 0) {
        for (const payment of transaction.payments) {
          const key = String(payment.accountId);
          if (balances.has(key)) {
            balances.set(key, (balances.get(key) || 0) - payment.amount);
          }
        }
      } else {
        const key = String(transaction.accountId);
        if (balances.has(key)) {
          balances.set(key, (balances.get(key) || 0) - transaction.amount);
        }
      }
    } else if (transaction.type === "transfer") {
      const from = String(transaction.accountId);
      const to = String(transaction.toAccountId);
      if (balances.has(from)) {
        balances.set(from, (balances.get(from) || 0) - transaction.amount);
      }
      if (balances.has(to)) {
        balances.set(to, (balances.get(to) || 0) + transaction.amount);
      }
    }
  }

  return balances;
}

/** Balance of a single account, or null when it does not belong to the user. */
export async function getAccountBalance(
  userId: string,
  accountId: unknown
): Promise<number | null> {
  const balances = await getAccountBalances(userId);
  const key = String(accountId);
  return balances.has(key) ? (balances.get(key) as number) : null;
}
