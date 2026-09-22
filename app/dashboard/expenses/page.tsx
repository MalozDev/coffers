"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpCircle, Plus, X } from "lucide-react";

interface Category { _id: string; name: string; color: string; icon?: string; type: string }
interface Account { _id: string; name: string; type: string; currentBalance?: number }
interface Transaction { _id: string; amount: number; description: string; date: string; categoryId?: { name: string; color: string; icon?: string }; accountId?: { name: string } }

function formatK(n: number) { return `K${n.toLocaleString()}`; }

export default function ExpensesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const availableAcrossAccounts = accounts.reduce((sum, account) => sum + Math.max(account.currentBalance || 0, 0), 0);
  const selectedAccount = accounts.find((account) => account._id === accountId);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?type=expense").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/transactions?type=expense&limit=20").then((r) => r.json()),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !categoryId || !accountId) return;
    const requestedAmount = parseFloat(amount);
    if (!splitPayment && selectedAccount && requestedAmount > (selectedAccount.currentBalance || 0)) {
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
          .map((account) => ({ accountId: account._id, amount: parseFloat(paymentAmounts[account._id] || "0") }))
          .filter((payment) => payment.amount > 0)
      : undefined;
    if (splitPayment && (payments?.length === 0 || Math.abs((payments || []).reduce((sum, payment) => sum + payment.amount, 0) - parseFloat(amount)) > 0.005)) {
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
        const txs = await fetch("/api/transactions?type=expense&limit=20").then((r) => r.json());
        if (txs.success) setTransactions(txs.data.transactions);
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
        <Button size="sm" onClick={() => { setError(null); setShowForm(!showForm); }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Amount (K)</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="h-12 text-lg font-mono" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">What was it?</Label>
                <Input placeholder="e.g. Lunch, Transport fare"
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  className="h-11" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Category</Label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm" required>
                    <option value="">Select</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account</Label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                    className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm" required disabled={splitPayment}>
                    {accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              {amount && selectedAccount && !splitPayment && parseFloat(amount) > (selectedAccount.currentBalance || 0) && availableAcrossAccounts >= parseFloat(amount) && (
                <p className="text-xs rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                  {selectedAccount.name} cannot cover this alone, but your accounts can cover it together. Enable split payment to choose cash, mobile money, or bank amounts.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={splitPayment} onChange={(e) => setSplitPayment(e.target.checked)} />
                Split this payment across accounts
              </label>
              {splitPayment && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  {accounts.map((account) => (
                    <div key={account._id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{account.name}</span>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" value={paymentAmounts[account._id] || ""} onChange={(e) => setPaymentAmounts((current) => ({ ...current, [account._id]: e.target.value }))} className="h-9 w-32 font-mono" />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Enter the exact amount paid from each account. The total must equal {amount ? `K${amount}` : "the expense"}.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Note (optional)</Label>
                  <Input placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
                </div>
              </div>
              <Button type="submit" className="w-full h-12" disabled={saving}>
                {saving ? "Saving..." : "Save Expense"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : transactions.length === 0 ? (
        <Card><CardContent><p className="text-center text-muted-foreground py-8">No expenses recorded yet</p></CardContent></Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {transactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg bg-red-50 shrink-0">
                  <ArrowUpCircle className="h-4 w-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx.categoryId?.name} · {new Date(tx.date).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-red-500 shrink-0">
                  − {formatK(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
