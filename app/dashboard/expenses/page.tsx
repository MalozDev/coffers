"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterGroup } from "@/components/ui/filter-group";
import {
  DateFilterGroup,
  boundsFor,
  dateKey,
  humanDayLabel,
  isWithinBounds,
  type DateFilterValue,
} from "@/components/ui/date-filter";
import { ArrowUpCircle, Plus } from "lucide-react";

interface Category {
  _id: string;
  name: string;
  color: string;
  icon?: string;
  type: string;
}
interface Account {
  _id: string;
  name: string;
  type: string;
  currentBalance?: number;
}
interface Transaction {
  _id: string;
  amount: number;
  description: string;
  date: string;
  createdAt?: string;
  categoryId?: { name: string; color: string; icon?: string; _id?: string };
  accountId?: { name: string };
}

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

export default function ExpensesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters — defaults show everything (Category: All, Date: All)
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [splitPayment, setSplitPayment] = useState(false);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableAcrossAccounts = accounts.reduce(
    (sum, account) => sum + Math.max(account.currentBalance || 0, 0),
    0
  );
  const selectedAccount = accounts.find((account) => account._id === accountId);

  const loadExpenses = () =>
    fetch("/api/transactions?type=expense&limit=200")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setTransactions(res.data.transactions);
      });

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?type=expense").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/transactions?type=expense&limit=200").then((r) => r.json()),
    ]).then(([cats, accs, txs]) => {
      if (cats.success) setCategories(cats.data.categories);
      if (accs.success) {
        setAccounts(accs.data.accounts);
        if (accs.data.accounts[0]) setAccountId(accs.data.accounts[0]._id);
      }
      if (txs.success) setTransactions(txs.data.transactions);
      setLoading(false);
    });
  }, []);

  const bounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  // Category + date filtering, ordered most recent → oldest
  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => isWithinBounds(tx.date, bounds))
        .filter((tx) =>
          categoryFilter === "all"
            ? true
            : String(tx.categoryId?._id || tx.categoryId?.name || "") ===
              categoryFilter
        )
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime() ||
            new Date(b.createdAt || b.date).getTime() -
              new Date(a.createdAt || a.date).getTime()
        ),
    [transactions, bounds, categoryFilter]
  );

  // Group by calendar day — newest day first — so every day (today and past
  // days) shows its own spending total at a glance.
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    visibleTransactions.forEach((tx) => {
      const key = dateKey(tx.date);
      groups.set(key, [...(groups.get(key) || []), tx]);
    });
    return Array.from(groups.entries())
      .map(
        ([day, rows]): [string, Transaction[]] => [
          day,
          rows.sort(
            (a, b) =>
              new Date(b.createdAt || b.date).getTime() -
              new Date(a.createdAt || a.date).getTime()
          ),
        ]
      )
      .sort(([a], [b]) => b.localeCompare(a));
  }, [visibleTransactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !categoryId || !accountId) return;
    const requestedAmount = parseFloat(amount);
    if (
      !splitPayment &&
      selectedAccount &&
      requestedAmount > (selectedAccount.currentBalance || 0)
    ) {
      setError(
        availableAcrossAccounts >= requestedAmount
          ? "This account cannot cover the expense. Enable split payment and assign the amount across accounts."
          : "Your accounts do not have enough available balance for this expense."
      );
      return;
    }
    setSaving(true);

    const payments = splitPayment
      ? accounts
          .map((account) => ({
            accountId: account._id,
            amount: parseFloat(paymentAmounts[account._id] || "0"),
          }))
          .filter((payment) => payment.amount > 0)
      : undefined;
    if (
      splitPayment &&
      (payments?.length === 0 ||
        Math.abs(
          (payments || []).reduce((sum, payment) => sum + payment.amount, 0) -
            parseFloat(amount)
        ) > 0.005)
    ) {
      setError("Split payment amounts must add up exactly to the expense amount.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: requestedAmount,
          description,
          categoryId,
          accountId,
          payments,
          note: note || undefined,
          date: new Date(date).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setError(null);
        setShowForm(false);
        setAmount("");
        setDescription("");
        setNote("");
        setSplitPayment(false);
        setPaymentAmounts({});
        window.dispatchEvent(new Event("coffers:data-updated"));
        await loadExpenses();
      } else {
        const details = data.details
          ? Object.values(data.details).flat().join(" ")
          : "";
        setError(details || data.error || "Failed to save expense. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection and try again.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track your spending</p>
        </div>
        <Button size="sm" onClick={() => { setError(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters — separated groups */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <FilterGroup
          label="CATEGORY"
          options={[
            { value: "all", label: "All" },
            ...categories.map((c) => ({
              value: c._id,
              label: `${c.icon ? `${c.icon} ` : ""}${c.name}`,
            })),
          ]}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <DateFilterGroup
          value={dateFilter}
          onChange={setDateFilter}
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
      </div>

      {/* Add expense modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>Record what you spent.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Amount (K)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">What was it?</Label>
              <Input
                placeholder="e.g. Lunch, Transport fare"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Category</Label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
                  required
                >
                  <option value="">Select</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Account</Label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
                  required
                  disabled={splitPayment}
                >
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {amount &&
              selectedAccount &&
              !splitPayment &&
              parseFloat(amount) > (selectedAccount.currentBalance || 0) &&
              availableAcrossAccounts >= parseFloat(amount) && (
                <p className="text-xs rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                  {selectedAccount.name} cannot cover this alone, but your accounts
                  can cover it together. Enable split payment to choose cash, mobile
                  money, or bank amounts.
                </p>
              )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={splitPayment}
                onChange={(e) => setSplitPayment(e.target.checked)}
              />
              Split this payment across accounts
            </label>
            {splitPayment && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                {accounts.map((account) => (
                  <div key={account._id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm">{account.name}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={paymentAmounts[account._id] || ""}
                      onChange={(e) =>
                        setPaymentAmounts((current) => ({
                          ...current,
                          [account._id]: e.target.value,
                        }))
                      }
                      className="h-9 w-32 font-mono"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Enter the exact amount paid from each account. The total must equal{" "}
                  {amount ? `K${amount}` : "the expense"}.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Note (optional)</Label>
                <Input
                  placeholder="Optional"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visibleTransactions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              No expenses match these filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedTransactions.map(([day, dayTransactions]) => {
            const dayTotal = dayTransactions.reduce(
              (sum, tx) => sum + tx.amount,
              0
            );
            return (
              <Card key={day}>
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {humanDayLabel(`${day}T12:00:00`)}
                  </p>
                  <p className="text-xs font-mono font-semibold text-foreground">
                    {dayTransactions.length}{" "}
                    {dayTransactions.length === 1 ? "entry" : "entries"} · total{" "}
                    {formatK(dayTotal)}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {dayTransactions.map((tx) => (
                    <div key={tx._id} className="flex items-center gap-3 px-4 py-3">
                      <div className="p-2 rounded-lg bg-red-50 shrink-0">
                        <ArrowUpCircle className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.categoryId?.name} ·{" "}
                          {humanDayLabel(tx.date)} · logged{" "}
                          {new Date(tx.createdAt || tx.date).toLocaleTimeString("en-ZM", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className="text-sm font-mono font-semibold text-red-500 shrink-0">
                        − {formatK(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
