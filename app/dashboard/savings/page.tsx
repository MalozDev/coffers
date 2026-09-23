"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DateFilterGroup,
  boundsFor,
  isWithinBounds,
  type DateFilterValue,
} from "@/components/ui/date-filter";
import { FilterGroup } from "@/components/ui/filter-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { Coins, Landmark, Plus, Trash2, Undo2, X } from "lucide-react";

interface SavingsAccount {
  _id: string;
  name: string;
  type: string;
  balance: number;
}

interface Account {
  _id: string;
  name: string;
  type: string;
  currentBalance?: number;
}

interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  createdAt?: string;
  status: "active" | "completed" | "paused" | "cancelled";
}

interface SavingsData {
  accounts: SavingsAccount[];
  total: number;
  monthNet: number;
  trend: { label: string; balance: number }[];
  goals: Goal[];
}

type SavingsFilter = "active" | "completed" | "cancelled";

function formatK(value: number) {
  return `K${Math.round(value || 0).toLocaleString()}`;
}

function GoalStatusBadge({ status }: { status: Goal["status"] }) {
  const styles = {
    active: "bg-green-100 text-green-700 border-green-200",
    completed: "bg-blue-50 text-blue-600 border-blue-200",
    cancelled: "bg-muted text-muted-foreground border-border",
    paused: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={styles[status]}>{status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : status === "paused" ? "Paused" : "Active"}</Badge>;
}

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<SavingsFilter>("active");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTarget, setCreateTarget] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [createMonthly, setCreateMonthly] = useState("");
  const [saveGoalId, setSaveGoalId] = useState("");
  const [saveAccountId, setSaveAccountId] = useState("");
  const [saveAmount, setSaveAmount] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnAccountId, setReturnAccountId] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Date filter (top of the page) — defaults to Today
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const selectedPanelRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const dateBounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  const loadSavings = async () => {
    const response = await fetch("/api/savings");
    const result = await response.json();
    if (result.success) setData(result.data);
    else setError(true);
    setLoading(false);
  };

  useEffect(() => {
    loadSavings().catch(() => {
      setError(true);
      setLoading(false);
    });
    fetch("/api/accounts")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) setAccounts(result.data.accounts);
      })
      .catch(() => setActionError("Accounts could not be loaded."));
  }, []);

  useEffect(() => {
    if (selectedGoalId) {
      window.requestAnimationFrame(() => selectedPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [selectedGoalId]);

  if (loading) {
    return <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-44 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  if (error || !data) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Unable to load savings. Please try again.</CardContent></Card>;
  }

  const activeGoals = data.goals.filter((goal) => goal.status === "active");
  const filteredGoals = data.goals.filter(
    (goal) =>
      goal.status === filter &&
      (!goal.createdAt ||
        dateFilter === "all" ||
        isWithinBounds(goal.createdAt, dateBounds))
  );
  const selectedGoal = data.goals.find((goal) => goal._id === selectedGoalId) || null;
  const fundingAccounts = accounts.filter((account) => account.type !== "savings");

  const resetSelectedActions = () => {
    setShowReturnForm(false);
    setShowCancelConfirm(false);
    setReturnAmount("");
    setReturnAccountId("");
    setActionError("");
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!saveGoalId || !saveAccountId || !saveAmount) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/goals/${saveGoalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contribution: parseFloat(saveAmount), accountId: saveAccountId }),
      });
      const result = await response.json();
      if (!result.success) {
        setActionError(result.error || "Could not add to savings.");
        showToast("error", result.error || "Could not add to savings.");
        return;
      }
      setSaveAmount("");
      setShowSaveForm(false);
      showToast("success", "Money added to your saving.");
      window.dispatchEvent(new Event("coffers:data-updated"));
      await loadSavings();
      // Reflect the reduced account balance right away
      fetch("/api/accounts")
        .then((response) => response.json())
        .then((result) => {
          if (result.success) setAccounts(result.data.accounts);
        })
        .catch(() => undefined);
    } catch {
      setActionError("Could not add to savings. Please try again.");
      showToast("error", "Could not add to savings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createName || !createTarget || !createDate) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, targetAmount: parseFloat(createTarget), targetDate: createDate, monthlyContribution: parseFloat(createMonthly) || 0 }),
      });
      const result = await response.json();
      if (!result.success) {
        setActionError(result.error || "Could not create saving.");
        showToast("error", result.error || "Could not create saving.");
        return;
      }
      setCreateName("");
      setCreateTarget("");
      setCreateDate("");
      setCreateMonthly("");
      setShowCreateForm(false);
      showToast("success", "Saving created successfully.");
      window.dispatchEvent(new Event("coffers:data-updated"));
      await loadSavings();
    } catch {
      setActionError("Could not create saving. Please try again.");
      showToast("error", "Could not create saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (goal: Goal) => {
    if (!returnAmount || !returnAccountId) {
      setActionError("Choose an account and amount to return.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/goals/${goal._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return", amount: parseFloat(returnAmount), accountId: returnAccountId }),
      });
      const result = await response.json();
      if (!result.success) {
        setActionError(result.error || "Could not return money.");
        showToast("error", result.error || "Could not return money.");
        return;
      }
      resetSelectedActions();
      showToast("success", "Money returned to your account.");
      window.dispatchEvent(new Event("coffers:data-updated"));
      await loadSavings();
    } catch {
      setActionError("Could not return money. Please try again.");
      showToast("error", "Could not return money. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (goal: Goal) => {
    if (goal.currentAmount > 0 && !returnAccountId) {
      setActionError("Choose where the available money should be returned.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/goals/${goal._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", returnAccountId: returnAccountId || undefined }),
      });
      const result = await response.json();
      if (!result.success) {
        setActionError(result.error || "Could not cancel this saving.");
        showToast("error", result.error || "Could not cancel this saving.");
        return;
      }
      setSelectedGoalId(null);
      resetSelectedActions();
      showToast("success", "Saving cancelled and funds returned.");
      window.dispatchEvent(new Event("coffers:data-updated"));
      await loadSavings();
    } catch {
      setActionError("Could not cancel this saving. Please try again.");
      showToast("error", "Could not cancel this saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGoal = async () => {
    if (!deleteGoal) return;
    if (deleteGoal.currentAmount > 0) {
      showToast(
        "error",
        "Return the saved money first — cancel the saving so the funds go back to an account."
      );
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(`/api/goals/${deleteGoal._id}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({ success: false }));
      if (!result.success) {
        showToast("error", result.error || "Could not delete this saving.");
        return;
      }
      if (selectedGoalId === deleteGoal._id) setSelectedGoalId(null);
      setDeleteGoal(null);
      showToast("success", "Saving deleted.");
      window.dispatchEvent(new Event("coffers:data-updated"));
      await loadSavings();
    } catch {
      showToast("error", "Could not delete this saving. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground">Savings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Choose a saving, then add money, return money, or cancel it.</p>
        </div>
        <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { setShowCreateForm(true); setActionError(""); }}><Plus className="h-4 w-4" /> Create saving</Button>
        <Button size="sm" onClick={() => { setShowSaveForm(true); setActionError(""); }}>
          <Plus className="h-4 w-4" /> Add to savings
        </Button>
        </div>
      </div>

      {/* Savings-list filter sits directly above the date filter */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <FilterGroup
          label="STATUS"
          options={[
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          value={filter}
          onChange={(value) => {
            setFilter(value as SavingsFilter);
            setSelectedGoalId(null);
            resetSelectedActions();
          }}
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

      {actionError && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{actionError}</div>}

      {/* Create saving modal */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a saving</DialogTitle>
            <DialogDescription>Set a target first, then add money whenever you are ready.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input placeholder="Saving name, e.g. Emergency fund" value={createName} onChange={(event) => setCreateName(event.target.value)} className="h-11" required />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input type="number" min="1" step="0.01" placeholder="Target amount (K)" value={createTarget} onChange={(event) => setCreateTarget(event.target.value)} className="h-11 font-mono" required />
              <Input type="date" value={createDate} onChange={(event) => setCreateDate(event.target.value)} className="h-11" required />
            </div>
            <Input type="number" min="0" step="0.01" placeholder="Monthly contribution (optional)" value={createMonthly} onChange={(event) => setCreateMonthly(event.target.value)} className="h-11 font-mono" />
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11" disabled={saving}>{saving ? "Creating..." : "Create saving"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add to savings modal */}
      <Dialog open={showSaveForm} onOpenChange={setShowSaveForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to an existing saving</DialogTitle>
            <DialogDescription>Select the saving you want to grow. The amount leaves your chosen account straight away.</DialogDescription>
          </DialogHeader>
          {activeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active savings to add to. Create a saving first.</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Select saving</Label>
                <select value={saveGoalId} onChange={(event) => setSaveGoalId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm" required>
                  <option value="">Choose an existing saving</option>
                  {activeGoals.map((goal) => <option key={goal._id} value={goal._id}>{goal.name} · {formatK(goal.currentAmount)} saved</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">From account</Label>
                <select value={saveAccountId} onChange={(event) => setSaveAccountId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm" required>
                  <option value="">Choose account</option>
                  {fundingAccounts.map((account) => <option key={account._id} value={account._id}>{account.name} · {formatK(account.currentBalance || 0)}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">This account is reduced by the amount you add.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Amount (K)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={saveAmount} onChange={(event) => setSaveAmount(event.target.value)} className="h-11 font-mono" required />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setShowSaveForm(false)}>Cancel</Button>
                <Button type="submit" className="flex-1 h-11" disabled={saving}>{saving ? "Adding..." : "Confirm"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-green-200 bg-green-50/60"><CardContent className="p-5"><div className="flex items-center gap-2 text-green-700"><Coins className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Total saved</span></div><p className="mt-2 text-3xl font-mono font-bold text-foreground sm:text-4xl">{formatK(data.total)}</p><p className={`mt-1 text-sm font-semibold ${data.monthNet >= 0 ? "text-green-600" : "text-red-500"}`}>{data.monthNet >= 0 ? "+" : "−"}{formatK(Math.abs(data.monthNet))} this month</p></CardContent></Card>

      {/* Balance trend graph removed by request */}

      <Card><div className="px-4 pb-2 pt-4"><h3 className="text-sm font-semibold">Money held for goals</h3><p className="mt-1 text-xs text-muted-foreground">These balances are set aside for savings goals. To use them, record an expense from the savings account or move them to another account.</p></div>{data.accounts.length === 0 ? <p className="px-4 pb-6 pt-2 text-center text-sm text-muted-foreground">No goal savings accounts yet. Add money to a saving to create one automatically.</p> : <div className="divide-y divide-border border-t">{data.accounts.map((account) => <div key={account._id} className="flex items-center gap-3 px-4 py-3"><div className="shrink-0 rounded-lg bg-green-50 p-2 text-green-600"><Landmark className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{account.name}</p><p className="text-xs text-muted-foreground">Goal balance</p></div><span className="shrink-0 font-mono text-sm font-semibold text-foreground">{formatK(account.balance)}</span></div>)}</div>}</Card>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Savings list</h2><span className="text-xs text-muted-foreground">Select a saving for actions</span></div>
        {filteredGoals.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No {filter} savings match this date filter.{filter === "active" && dateFilter === "all" && <div className="mt-3">Use Create saving above to set your first target.</div>}</CardContent></Card> : <div className="space-y-2">{filteredGoals.map((goal) => { return <div key={goal._id} className={`flex items-center gap-1 rounded-xl border bg-card transition-colors ${selectedGoalId === goal._id ? "border-accent ring-1 ring-accent/30" : "border-border hover:border-accent/50"}`}><button type="button" onClick={() => { setSelectedGoalId(goal._id); resetSelectedActions(); }} className="min-w-0 flex-1 p-4 text-left"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{goal.name}</span><GoalStatusBadge status={goal.status} /></div><p className="mt-2.5 text-xl font-mono font-bold leading-none text-foreground">{formatK(goal.currentAmount)}<span className="ml-1.5 align-baseline text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">saved</span></p><p className="mt-1.5 text-xs text-muted-foreground">of {formatK(goal.targetAmount)} target</p></button><Button variant="ghost" size="icon" className="mr-2 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${goal.name}`} onClick={() => setDeleteGoal(goal)}><Trash2 className="h-4 w-4" /></Button></div>; })}</div>}
      </section>

      {selectedGoal && <div ref={selectedPanelRef}><Card><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected saving</p><h3 className="mt-1 text-base font-semibold">{selectedGoal.name}</h3></div><GoalStatusBadge status={selectedGoal.status} /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Saved</p><p className="mt-1 font-mono text-lg font-bold">{formatK(selectedGoal.currentAmount)}</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Target</p><p className="mt-1 font-mono text-lg font-bold">{formatK(selectedGoal.targetAmount)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{selectedGoal.status === "active" && <Button size="sm" onClick={() => { setSaveGoalId(selectedGoal._id); setShowSaveForm(true); }}><Plus className="h-4 w-4" /> Add money</Button>}{selectedGoal.currentAmount > 0 && <Button size="sm" variant="outline" onClick={() => { setShowReturnForm(!showReturnForm); setShowCancelConfirm(false); setActionError(""); }}><Undo2 className="h-4 w-4" /> Return money</Button>}{selectedGoal.status === "active" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setShowCancelConfirm(!showCancelConfirm); setShowReturnForm(false); setActionError(""); }}><X className="h-4 w-4" /> Cancel saving</Button>}<Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteGoal(selectedGoal)} aria-label="Delete saving"><Trash2 className="h-4 w-4" /> Delete</Button></div>{showReturnForm && <form onSubmit={(event) => { event.preventDefault(); handleReturn(selectedGoal); }} className="mt-4 space-y-3 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Return some or all of this saving. The goal stays available.</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><select value={returnAccountId} onChange={(event) => setReturnAccountId(event.target.value)} className="h-10 rounded-xl border border-input bg-white px-3 text-sm" required><option value="">Return to account</option>{fundingAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select><Input type="number" min="0.01" max={selectedGoal.currentAmount} step="0.01" placeholder={`Up to ${formatK(selectedGoal.currentAmount)}`} value={returnAmount} onChange={(event) => setReturnAmount(event.target.value)} className="h-10 font-mono" required /></div><Button type="submit" className="h-10 w-full" disabled={saving}>{saving ? "Returning..." : "Return money"}</Button></form>}{showCancelConfirm && <div className="mt-4 space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3"><p className="text-xs text-muted-foreground">This marks the saving as cancelled. Any available balance will be returned first.</p>{selectedGoal.currentAmount > 0 && <select value={returnAccountId} onChange={(event) => setReturnAccountId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm" required><option value="">Return available money to...</option>{fundingAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}<div className="flex gap-2"><Button type="button" variant="destructive" className="flex-1" disabled={saving} onClick={() => handleCancel(selectedGoal)}>{saving ? "Cancelling..." : "Confirm cancellation"}</Button><Button type="button" variant="ghost" onClick={() => setShowCancelConfirm(false)}>Keep saving</Button></div></div>}</CardContent></Card></div>}

      {/* Delete saving confirmation */}
      <Dialog open={!!deleteGoal} onOpenChange={(open) => { if (!open) setDeleteGoal(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete saving?</DialogTitle>
            <DialogDescription>&ldquo;{deleteGoal?.name}&rdquo; will be removed permanently.</DialogDescription>
          </DialogHeader>
          {deleteGoal && deleteGoal.currentAmount > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This saving still holds {formatK(deleteGoal.currentAmount)}. Return or cancel it first so the money goes back to an account.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-11" onClick={() => setDeleteGoal(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1 h-11"
              disabled={deleting || (deleteGoal?.currentAmount || 0) > 0}
              onClick={handleDeleteGoal}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
