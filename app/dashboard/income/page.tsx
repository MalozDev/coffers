"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowDownCircle, ArrowRightLeft, CalendarDays, Clock3, Filter, Plus, X } from "lucide-react";

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
  categoryId?: { name: string; color: string; icon?: string };
  accountId?: { name: string };
  toAccountId?: { name: string };
}
interface ExpectedIncome {
  _id: string;
  source: string;
  amount: number;
  expectedDate: string;
  status: string;
}

function formatK(n: number) { return `K${n.toLocaleString()}`; }

type IncomeView = "all" | "recorded" | "expected";

function dateKey(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-ZM", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function loggedTime(value: string) {
  return new Date(value).toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit" });
}

export default function IncomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transaction[]>([]);
  const [expectedIncome, setExpectedIncome] = useState<ExpectedIncome[]>([]);
  const [receivedAccount, setReceivedAccount] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [showExpectedForm, setShowExpectedForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [view, setView] = useState<IncomeView>("all");
  const [dateRange, setDateRange] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
  const [expectedSource, setExpectedSource] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedNote, setExpectedNote] = useState("");
  const [expectedSaving, setExpectedSaving] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferFromAccount, setTransferFromAccount] = useState("");
  const [transferToAccount, setTransferToAccount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [transferSaving, setTransferSaving] = useState(false);
  const { showToast } = useToast();

  const movementAccounts = accounts.filter((account) => ["cash", "mobile_money", "bank", "savings"].includes(account.type));

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?type=income").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/transactions?type=income&limit=100").then((r) => r.json()),
      fetch("/api/transactions?type=transfer&limit=100").then((r) => r.json()),
      fetch("/api/expected-income").then((r) => r.json()),
    ]).then(([cats, accs, txs, transferResults, expected]) => {
      if (cats.success) setCategories(cats.data.categories);
      if (accs.success) {
        setAccounts(accs.data.accounts);
        if (accs.data.accounts[0]) setAccountId(accs.data.accounts[0]._id);
        const movementAccountIds = accs.data.accounts.filter((account: Account) => ["cash", "mobile_money", "bank", "savings"].includes(account.type)).map((account: Account) => account._id);
        if (movementAccountIds[0]) setTransferFromAccount(movementAccountIds[0]);
        if (movementAccountIds[1]) setTransferToAccount(movementAccountIds[1]);
      }
      if (txs.success) setTransactions(txs.data.transactions);
      if (transferResults.success) setTransfers(transferResults.data.transactions);
      if (expected.success) setExpectedIncome(expected.data.expected.filter((item: ExpectedIncome) => item.status === "pending"));
      setLoading(false);
    });
  }, []);

  const dateBounds = useMemo(() => {
    if (dateRange === "custom") return { from: fromDate, to: toDate };
    if (dateRange === "all") return { from: "", to: "" };
    const from = new Date();
    from.setDate(from.getDate() - Number(dateRange) + 1);
    return { from: dateKey(from.toISOString()), to: dateKey(new Date().toISOString()) };
  }, [dateRange, fromDate, toDate]);

  const inDateRange = (value: string) => {
    const key = dateKey(value);
    return (!dateBounds.from || key >= dateBounds.from) && (!dateBounds.to || key <= dateBounds.to);
  };

  const visibleTransactions = useMemo(
    () => transactions.filter((transaction) => inDateRange(transaction.date)),
    [transactions, dateBounds]
  );
  const visibleExpected = useMemo(
    () => expectedIncome.filter((item) => inDateRange(item.expectedDate)),
    [expectedIncome, dateBounds]
  );
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    visibleTransactions.forEach((transaction) => {
      const key = dateKey(transaction.date);
      groups.set(key, [...(groups.get(key) || []), transaction]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [visibleTransactions]);

  const resolveExpectedIncome = async (item: ExpectedIncome) => {
    const accountId = receivedAccount[item._id];
    if (!accountId) {
      setError("Choose the account where the income was received first.");
      showToast("error", "Choose the account where the income was received first.");
      return;
    }
    const res = await fetch(`/api/expected-income/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received", accountId }),
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || "Could not resolve expected income.");
      showToast("error", data.error || "Could not resolve expected income.");
      return;
    }
    setExpectedIncome((current) => current.filter((entry) => entry._id !== item._id));
    const transactionsResponse = await fetch("/api/transactions?type=income&limit=100").then((response) => response.json());
    if (transactionsResponse.success) setTransactions(transactionsResponse.data.transactions);
    setError(null);
    showToast("success", "Expected income marked as received.");
  };

  const createExpectedIncome = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expectedSource || !expectedAmount || !expectedDate) return;
    setExpectedSaving(true);
    const response = await fetch("/api/expected-income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: expectedSource, amount: parseFloat(expectedAmount), expectedDate, note: expectedNote || undefined }),
    });
    const result = await response.json();
    if (result.success) {
      setExpectedIncome((current) => [...current, result.data.expectedIncome].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)));
      setExpectedSource("");
      setExpectedAmount("");
      setExpectedNote("");
      setShowExpectedForm(false);
      setError(null);
      showToast("success", "Expected income added.");
    } else { setError(result.error || "Could not add expected income"); showToast("error", result.error || "Could not add expected income"); }
    setExpectedSaving(false);
  };

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
        if (data.convertedToExpected && data.data?.expectedIncome) {
          setExpectedIncome((current) => [...current, data.data.expectedIncome].sort((a: ExpectedIncome, b: ExpectedIncome) => a.expectedDate.localeCompare(b.expectedDate)));
          setView("expected");
          showToast("success", "Future income added to Expected Income. Mark it received when the money arrives.");
        } else {
          showToast("success", "Income saved successfully.");
        }
        window.dispatchEvent(new Event("coffers:data-updated"));
        if (!data.convertedToExpected) {
          const txs = await fetch("/api/transactions?type=income&limit=100").then((r) => r.json());
          if (txs.success) setTransactions(txs.data.transactions);
        }
        const accs = await fetch("/api/accounts").then((r) => r.json());
        if (accs.success) setAccounts(accs.data.accounts);
      } else {
        const details = data.details
          ? Object.values(data.details).flat().join(" ")
          : "";
        setError(details || data.error || "Failed to save income. Please try again.");
        showToast("error", details || data.error || "Failed to save income. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection and try again.");
      showToast("error", "Network error. Please check your connection and try again.");
    }
    setSaving(false);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferAmount || !transferFromAccount || !transferToAccount || transferFromAccount === transferToAccount) {
      setError(transferFromAccount === transferToAccount ? "Choose different source and destination accounts." : "Complete the transfer details first.");
      return;
    }
    setTransferSaving(true);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "transfer",
          amount: parseFloat(transferAmount),
          accountId: transferFromAccount,
          toAccountId: transferToAccount,
          description: transferNote || "Account transfer",
          note: transferNote || undefined,
          date: new Date(transferDate).toISOString(),
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Could not move money.");
          showToast("error", result.error || "Could not move money.");
        return;
      }

      const [transferResponse, accountsResponse] = await Promise.all([
        fetch("/api/transactions?type=transfer&limit=100").then((r) => r.json()),
        fetch("/api/accounts").then((r) => r.json()),
      ]);
      if (transferResponse.success) setTransfers(transferResponse.data.transactions);
      if (accountsResponse.success) setAccounts(accountsResponse.data.accounts);
      setTransferAmount("");
      setTransferNote("");
      setShowTransferForm(false);
      setError(null);
      showToast("success", "Money moved between accounts.");
      window.dispatchEvent(new Event("coffers:data-updated"));
    } catch (transferError) {
      console.error(transferError);
      setError("Network error. Please check your connection and try again.");
      showToast("error", "Network error. Please check your connection and try again.");
    } finally {
      setTransferSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Income</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track your income sources</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
          <Button className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm" size="sm" variant="outline" onClick={() => { setError(null); setShowTransferForm(!showTransferForm); setShowForm(false); setShowExpectedForm(false); }}>
            <ArrowRightLeft className="h-4 w-4" /><span className="sm:hidden">Move</span><span className="hidden sm:inline">Move money</span>
          </Button>
          <Button className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm" size="sm" variant="outline" onClick={() => { setError(null); setShowExpectedForm(!showExpectedForm); setShowForm(false); }}>
            <Clock3 className="h-4 w-4" /><span className="sm:hidden">Plan</span><span className="hidden sm:inline">Expected</span>
          </Button>
          <Button className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm" size="sm" onClick={() => { setError(null); setShowForm(!showForm); setShowExpectedForm(false); }}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span className="sm:hidden">{showForm ? "Close" : "Add"}</span><span className="hidden sm:inline">{showForm ? "Cancel" : "Add income"}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="border-border/80">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"><Filter className="h-3.5 w-3.5" /> View income</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {(["all", "recorded", "expected"] as IncomeView[]).map((option) => (
              <button key={option} type="button" onClick={() => setView(option)} className={`rounded-md px-2 py-2 text-xs font-semibold capitalize ${view === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>{option}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="h-9 flex-1 rounded-lg border border-input bg-white px-2 text-xs">
              <option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option>
            </select>
          </div>
          {dateRange === "custom" && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-xs" /><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-xs" /></div>}
        </CardContent>
      </Card>

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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {showTransferForm && (
        <Card>
          <CardContent>
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Move money between accounts</h2>
                <p className="text-xs text-muted-foreground mt-1">Move cash between your cash, mobile money, and bank accounts without counting it as income.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Amount (K)</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="h-12 text-lg font-mono" required />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">From</Label>
                  <select value={transferFromAccount} onChange={(e) => setTransferFromAccount(e.target.value)} className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm" required>
                    <option value="">Select account</option>
                    {movementAccounts.map((account) => <option key={account._id} value={account._id}>{account.name} ({formatK(account.currentBalance || 0)})</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">To</Label>
                  <select value={transferToAccount} onChange={(e) => setTransferToAccount(e.target.value)} className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm" required>
                    <option value="">Select account</option>
                    {movementAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-sm">Date</Label><Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-11" required /></div>
                <div className="space-y-1.5"><Label className="text-sm">Note (optional)</Label><Input placeholder="e.g. Cash deposit" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} className="h-11" /></div>
              </div>
              <Button type="submit" className="w-full h-12" disabled={transferSaving || movementAccounts.length < 2}>{transferSaving ? "Moving..." : "Move money"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {showExpectedForm && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3"><div><h2 className="text-sm font-semibold">Add expected income</h2><p className="text-xs text-muted-foreground mt-1">Plan money that has not arrived yet.</p></div><Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowExpectedForm(false)}><X className="h-4 w-4" /></Button></div>
            <form onSubmit={createExpectedIncome} className="space-y-3">
              <Input placeholder="Source, e.g. salary or freelance" value={expectedSource} onChange={(e) => setExpectedSource(e.target.value)} className="h-11" required />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Input type="number" min="0.01" step="0.01" placeholder="Amount (K)" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} className="h-11 font-mono" required /><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="h-11" required /></div>
              <Input placeholder="Note (optional)" value={expectedNote} onChange={(e) => setExpectedNote(e.target.value)} className="h-11" />
              <Button type="submit" className="w-full h-11" disabled={expectedSaving}>{expectedSaving ? "Saving..." : "Save expected income"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {view !== "recorded" && visibleExpected.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold">Expected income</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-3">When it arrives, choose where the money actually went.</p>
            <div className="space-y-3">
              {visibleExpected.map((item) => (
                <div key={item._id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.source}</p>
                      <p className="text-xs text-muted-foreground">{formatK(item.amount)} · expected {new Date(item.expectedDate).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}</p>
                    </div>
                    <select value={receivedAccount[item._id] || ""} onChange={(e) => setReceivedAccount((current) => ({ ...current, [item._id]: e.target.value }))} className="h-9 w-full rounded-lg border border-input bg-white px-2 text-xs sm:max-w-[46%]">
                      <option value="">Received in...</option>
                      {accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
                    </select>
                  </div>
                  <Button size="sm" className="w-full mt-2 h-9" onClick={() => resolveExpectedIncome(item)}>Mark received</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {transfers.length > 0 && (
        <Card>
          <div className="border-b border-border bg-muted/30 px-4 py-2"><p className="text-xs font-semibold text-muted-foreground">Recent account movements</p></div>
          <div className="divide-y divide-border">{transfers.filter((transfer) => inDateRange(transfer.date)).map((transfer) => {
            return <div key={transfer._id} className="flex items-center gap-3 px-4 py-3"><div className="p-2 rounded-lg bg-blue-50 shrink-0"><ArrowRightLeft className="h-4 w-4 text-blue-600" /></div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{transfer.description}</p><p className="text-xs text-muted-foreground">{transfer.accountId?.name || "Account"} to {transfer.toAccountId?.name || "Account"} · {loggedTime(transfer.createdAt || transfer.date)}</p></div><span className="text-sm font-mono font-semibold text-blue-600 shrink-0">{formatK(transfer.amount)}</span></div>;
          })}</div>
        </Card>
      )}

      {/* Recorded income */}
      {view !== "expected" && (
      <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recorded income</h2><span className="text-xs text-muted-foreground">{visibleTransactions.length} entries</span></div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : groupedTransactions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">No recorded income matches these filters.</p>
          </CardContent>
        </Card>
      ) : (
        groupedTransactions.map(([day, dayTransactions]) => (
          <Card key={day}>
            <div className="border-b border-border bg-muted/30 px-4 py-2"><p className="text-xs font-semibold text-muted-foreground">{dateLabel(day)}</p></div>
            <div className="divide-y divide-border">{dayTransactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg bg-green-50 shrink-0"><ArrowDownCircle className="h-4 w-4 text-green-600" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{tx.description}</p><p className="text-xs text-muted-foreground">{tx.categoryId?.name || "Income"} · {tx.accountId?.name || "Account"} · logged {loggedTime(tx.createdAt || tx.date)}</p></div>
                <span className="text-sm font-mono font-semibold text-green-600 shrink-0">+ {formatK(tx.amount)}</span>
              </div>
            ))}</div>
          </Card>
        ))
      )}
      </div>
      )}
    </div>
  );
}
