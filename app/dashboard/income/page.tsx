"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, Plus, X } from "lucide-react";

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
}

interface Transaction {
  _id: string;
  amount: number;
  description: string;
  date: string;
  categoryId?: { name: string; color: string; icon?: string };
  accountId?: { name: string };
}

function formatK(n: number) { return `K${n.toLocaleString()}`; }

export default function IncomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?type=income").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/transactions?type=income&limit=20").then((r) => r.json()),
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
    setSaving(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "income",
          amount: parseFloat(amount),
          description,
          categoryId,
          accountId,
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
        // Refresh list
        const txs = await fetch("/api/transactions?type=income&limit=20").then((r) => r.json());
        if (txs.success) setTransactions(txs.data.transactions);
        const accs = await fetch("/api/accounts").then((r) => r.json());
        if (accs.success) setAccounts(accs.data.accounts);
      } else {
        const details = data.details
          ? Object.values(data.details).flat().join(" ")
          : "";
        setError(details || data.error || "Failed to save income. Please try again.");
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
          <h1 className="text-xl font-bold text-foreground">Income</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track your income sources</p>
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

      {/* Add Income Form */}
      {showForm && (
        <Card>
          <CardContent>
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
                <Label className="text-sm">Source / Description</Label>
                <Input
                  placeholder="e.g. Salary, Freelance work"
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
                  >
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

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
                    placeholder="Optional note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-12" disabled={saving}>
                {saving ? "Saving..." : "Save Income"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Income List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">No income recorded yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {transactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg bg-green-50 shrink-0">
                  <ArrowDownCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx.categoryId?.name} · {new Date(tx.date).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-green-600 shrink-0">
                  + {formatK(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
