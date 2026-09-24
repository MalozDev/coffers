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
  humanDayLabel,
  isWithinBounds,
  type DateFilterValue,
} from "@/components/ui/date-filter";
import { useToast } from "@/components/ui/toast-provider";
import {
  ArrowDownCircle,
  ArrowRightLeft,
  Check,
  Clock3,
  Plus,
  Trash2,
} from "lucide-react";

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

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function loggedTime(value: string) {
  return new Date(value).toLocaleTimeString("en-ZM", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}

type StatusFilter = "all" | "saved" | "expected" | "movements";

export default function IncomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transaction[]>([]);
  const [expectedIncome, setExpectedIncome] = useState<ExpectedIncome[]>([]);
  const [receivedAccount, setReceivedAccount] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});

  // Filters — defaults show everything (Status: All, Date: All)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Modals — creation never expands inline on the page
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expectedOpen, setExpectedOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const [loading, setLoading] = useState(true);

  // Form state — income
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — expected income
  const [expectedSource, setExpectedSource] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expectedNote, setExpectedNote] = useState("");
  const [expectedSaving, setExpectedSaving] = useState(false);

  // Form state — transfer
  const [transferAmount, setTransferAmount] = useState("");
  const [transferFromAccount, setTransferFromAccount] = useState("");
  const [transferToAccount, setTransferToAccount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [transferSaving, setTransferSaving] = useState(false);

  const { showToast } = useToast();

  const movementAccounts = accounts.filter((account) =>
    ["cash", "mobile_money", "bank", "savings"].includes(account.type)
  );

  const loadIncomeTransactions = () =>
    fetch("/api/transactions?type=income&limit=200")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setTransactions(res.data.transactions);
      });

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?type=income").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/transactions?type=income&limit=200").then((r) => r.json()),
      fetch("/api/transactions?type=transfer&limit=100").then((r) => r.json()),
      fetch("/api/expected-income").then((r) => r.json()),
    ]).then(([cats, accs, txs, transferResults, expected]) => {
      if (cats.success) setCategories(cats.data.categories);
      if (accs.success) {
        setAccounts(accs.data.accounts);
        if (accs.data.accounts[0]) setAccountId(accs.data.accounts[0]._id);
        const movementAccountIds = accs.data.accounts
          .filter((account: Account) =>
            ["cash", "mobile_money", "bank", "savings"].includes(account.type)
          )
          .map((account: Account) => account._id);
        if (movementAccountIds[0]) setTransferFromAccount(movementAccountIds[0]);
        if (movementAccountIds[1]) setTransferToAccount(movementAccountIds[1]);
      }
      if (txs.success) setTransactions(txs.data.transactions);
      if (transferResults.success) setTransfers(transferResults.data.transactions);
      if (expected.success)
        setExpectedIncome(
          expected.data.expected.filter(
            (item: ExpectedIncome) => item.status === "pending"
          )
        );
      setLoading(false);
    });
  }, []);

  const bounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  const inDateRange = (value: string) => isWithinBounds(value, bounds);

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => inDateRange(transaction.date))
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime() ||
            new Date(b.createdAt || b.date).getTime() -
              new Date(a.createdAt || a.date).getTime()
        ),
    [transactions, bounds]
  );

  const visibleExpected = useMemo(
    () =>
      expectedIncome
        .filter((item) => inDateRange(item.expectedDate))
        .sort((a, b) => b._id.localeCompare(a._id)),
    [expectedIncome, bounds]
  );

  // Newest → oldest, most recent day first
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    visibleTransactions.forEach((transaction) => {
      const key = dateKey(transaction.date);
      groups.set(key, [
        ...(groups.get(key) || []),
        transaction,
      ]);
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

  // ── Mark received (idempotent — the backend guards the same way) ──
  const resolveExpectedIncome = async (item: ExpectedIncome) => {
    if (resolving[item._id]) return; // no double-taps
    const targetAccount = receivedAccount[item._id];
    if (!targetAccount) {
      const message = "Choose the account where the income was received first.";
      setError(message);
      showToast("error", message);
      return;
    }
    setResolving((current) => ({ ...current, [item._id]: true }));
    const res = await fetch(`/api/expected-income/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received", accountId: targetAccount }),
    });
    const data = await res.json();
    setResolving((current) => ({ ...current, [item._id]: false }));
    if (!data.success) {
      if (res.status === 409) {
        // Already processed elsewhere — resync rather than double count
        setExpectedIncome((current) =>
          current.filter((entry) => entry._id !== item._id)
        );
        await loadIncomeTransactions();
        showToast("success", "This income was already marked as received.");
        setError(null);
        return;
      }
      setError(data.error || "Could not resolve expected income.");
      showToast("error", data.error || "Could not resolve expected income.");
      return;
    }
    setExpectedIncome((current) =>
      current.filter((entry) => entry._id !== item._id)
    );
    await loadIncomeTransactions();
    setError(null);
    showToast("success", "Expected income marked as received.");
    window.dispatchEvent(new Event("coffers:data-updated"));
  };

  const deleteExpected = async (item: ExpectedIncome) => {
    const res = await fetch(`/api/expected-income/${item._id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) {
      showToast("error", data.error || "Could not delete this expected income.");
      return;
    }
    setExpectedIncome((current) =>
      current.filter((entry) => entry._id !== item._id)
    );
    setError(null);
    showToast("success", "Expected income deleted.");
    window.dispatchEvent(new Event("coffers:data-updated"));
  };

  const createExpectedIncome = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expectedSource || !expectedAmount || !expectedDate) return;
    setExpectedSaving(true);
    const response = await fetch("/api/expected-income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: expectedSource,
        amount: parseFloat(expectedAmount),
        expectedDate,
        note: expectedNote || undefined,
      }),
    });
    const result = await response.json();
    if (result.success) {
      setExpectedIncome((current) =>
        [result.data.expectedIncome, ...current].sort((a, b) =>
          b._id.localeCompare(a._id)
        )
      );
      setExpectedSource("");
      setExpectedAmount("");
      setExpectedNote("");
      setExpectedOpen(false);
      setError(null);
      showToast("success", "Expected income added.");
    } else {
      setError(result.error || "Could not add expected income");
      showToast("error", result.error || "Could not add expected income");
    }
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
        setIncomeOpen(false);
        setAmount("");
        setDescription("");
        setNote("");
        if (data.convertedToExpected && data.data?.expectedIncome) {
          setExpectedIncome((current) => [data.data.expectedIncome, ...current]);
          setStatusFilter("expected");
          showToast(
            "success",
            "Future income added to Expected Income. Mark it received when the money arrives."
          );
        } else {
          showToast("success", "Income saved successfully.");
        }
        window.dispatchEvent(new Event("coffers:data-updated"));
        if (!data.convertedToExpected) await loadIncomeTransactions();
        const accs = await fetch("/api/accounts").then((r) => r.json());
        if (accs.success) setAccounts(accs.data.accounts);
      } else {
        const details = data.details
          ? Object.values(data.details).flat().join(" ")
          : "";
        setError(details || data.error || "Failed to save income. Please try again.");
        showToast(
          "error",
          details || data.error || "Failed to save income. Please try again."
        );
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
    if (
      !transferAmount ||
      !transferFromAccount ||
      !transferToAccount ||
      transferFromAccount === transferToAccount
    ) {
      setError(
        transferFromAccount === transferToAccount
          ? "Choose different source and destination accounts."
          : "Complete the transfer details first."
      );
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
      setTransferOpen(false);
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

  const showExpected = statusFilter === "all" || statusFilter === "expected";
  const showRecorded = statusFilter === "all" || statusFilter === "saved";
  const showTransfers = statusFilter === "all" || statusFilter === "movements";
  const visibleTransfers = transfers.filter((t) => inDateRange(t.date));

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Income</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track your income sources
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
          <Button
            className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setTransferOpen(true);
            }}
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span className="sm:hidden">Move</span>
            <span className="hidden sm:inline">Move money</span>
          </Button>
          <Button
            className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setExpectedOpen(true);
            }}
          >
            <Clock3 className="h-4 w-4" />
            <span className="sm:hidden">Plan</span>
            <span className="hidden sm:inline">Expected</span>
          </Button>
          <Button
            className="w-full justify-center px-2 text-[11px] sm:w-auto sm:px-2.5 sm:text-sm"
            size="sm"
            onClick={() => {
              setError(null);
              setIncomeOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add income</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters — separated groups */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <FilterGroup
          label="STATUS"
          options={[
            { value: "all", label: "All" },
            { value: "saved", label: "Saved" },
            { value: "expected", label: "Expected" },
            { value: "movements", label: "Movements" },
          ]}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
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

      {/* ── Expected income ── */}
      {showExpected && visibleExpected.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold">Expected income</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              When it arrives, choose where the money actually went.
            </p>
            <div className="space-y-3">
              {visibleExpected.map((item) => {
                const busy = !!resolving[item._id];
                return (
                  <div
                    key={item._id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.source}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatK(item.amount)} · expected{" "}
                          {humanDayLabel(item.expectedDate)}
                        </p>
                      </div>
                      <select
                        value={receivedAccount[item._id] || ""}
                        onChange={(e) =>
                          setReceivedAccount((current) => ({
                            ...current,
                            [item._id]: e.target.value,
                          }))
                        }
                        disabled={busy}
                        className="h-9 w-full rounded-lg border border-input bg-white px-2 text-xs sm:max-w-[46%]"
                      >
                        <option value="">Received in...</option>
                        {accounts.map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                        <button
                          type="button"
                          aria-label={`Delete ${item.source}`}
                          onClick={() => deleteExpected(item)}
                          className="h-9 w-9 shrink-0 self-end rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:self-auto"
                        >
                          <Trash2 className="h-4 w-4 mx-auto" />
                        </button>
                      </div>
                    <Button
                      size="sm"
                      className="w-full mt-2 h-9"
                      disabled={busy}
                      onClick={() => resolveExpectedIncome(item)}
                    >
                      {busy ? (
                        "Marking..."
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Mark received
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Account movements ── */}
      {showTransfers && visibleTransfers.length > 0 && (
        <Card>
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Recent account movements
            </p>
          </div>
          <div className="divide-y divide-border">
            {visibleTransfers.map((transfer) => (
              <div key={transfer._id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg bg-blue-50 shrink-0">
                  <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {transfer.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transfer.accountId?.name || "Account"} to{" "}
                    {transfer.toAccountId?.name || "Account"} ·{" "}
                    {loggedTime(transfer.createdAt || transfer.date)}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-blue-600 shrink-0">
                  {formatK(transfer.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Recorded income ── */}
      {showRecorded && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recorded income</h2>
            <span className="text-xs text-muted-foreground">
              {visibleTransactions.length} entries
            </span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : groupedTransactions.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-center text-muted-foreground py-8">
                  No recorded income matches these filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            groupedTransactions.map(([day, dayTransactions]) => {
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
                      <div className="p-2 rounded-lg bg-green-50 shrink-0">
                        <ArrowDownCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.categoryId?.name || "Income"} ·{" "}
                          {tx.accountId?.name || "Account"} · logged{" "}
                          {loggedTime(tx.createdAt || tx.date)}
                        </p>
                      </div>
                      <span className="text-sm font-mono font-semibold text-green-600 shrink-0">
                        + {formatK(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              );
            })
          )}
        </div>
      )}

      {/* ══ Add income modal ══ */}
      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add income</DialogTitle>
            <DialogDescription>Record money that has arrived.</DialogDescription>
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
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
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

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setIncomeOpen(false)}
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

      {/* ══ Move money modal ══ */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move money</DialogTitle>
            <DialogDescription>
              Move cash between your cash, mobile money, and bank accounts
              without counting it as income.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Amount (K)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="h-12 text-lg font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">From</Label>
                <select
                  value={transferFromAccount}
                  onChange={(e) => setTransferFromAccount(e.target.value)}
                  className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
                  required
                >
                  <option value="">Select account</option>
                  {movementAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name} ({formatK(account.currentBalance || 0)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">To</Label>
                <select
                  value={transferToAccount}
                  onChange={(e) => setTransferToAccount(e.target.value)}
                  className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
                  required
                >
                  <option value="">Select account</option>
                  {movementAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Date</Label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Note (optional)</Label>
                <Input
                  placeholder="e.g. Cash deposit"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setTransferOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 h-11"
                disabled={transferSaving || movementAccounts.length < 2}
              >
                {transferSaving ? "Moving..." : "Move money"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══ Expected income modal ══ */}
      <Dialog open={expectedOpen} onOpenChange={setExpectedOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add expected income</DialogTitle>
            <DialogDescription>Plan money that has not arrived yet.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createExpectedIncome} className="space-y-3">
            <Input
              placeholder="Source, e.g. salary or freelance"
              value={expectedSource}
              onChange={(e) => setExpectedSource(e.target.value)}
              className="h-11"
              required
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount (K)"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="h-11 font-mono"
                required
              />
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <Input
              placeholder="Note (optional)"
              value={expectedNote}
              onChange={(e) => setExpectedNote(e.target.value)}
              className="h-11"
            />
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setExpectedOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11" disabled={expectedSaving}>
                {expectedSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
