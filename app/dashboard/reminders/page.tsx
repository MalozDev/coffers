"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, RotateCcw, Check, Trash2 } from "lucide-react";

interface Reminder {
  _id: string;
  title: string;
  amount: number;
  dueDate: string;
  createdAt?: string;
  recurrence: string;
  isCompleted: boolean;
  status?: "active" | "closed";
  categoryId?: { name: string; color: string };
}

interface Account {
  _id: string;
  name: string;
  type: string;
  currentBalance?: number;
}

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function daysUntil(date: string) {
  const d = new Date(date);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type ReminderFilter =
  | "all"
  | "active"
  | "completed"
  | "recurring"
  | "once_off"
  | "due";

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — one combined group (status + type + due) and a date group
  const [reminderFilter, setReminderFilter] = useState<ReminderFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Add reminder modal
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Completion confirmation
  const [pending, setPending] = useState<Reminder | null>(null);
  const [payFrom, setPayFrom] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Delete confirmation — any reminder can be deleted
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  const fetchReminders = () => {
    fetch("/api/reminders").then((r) => r.json()).then((res) => {
      if (res.success) setReminders(res.data.reminders);
      setLoading(false);
    });
  };

  const loadAccounts = () =>
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setAccounts(res.data.accounts);
      })
      .catch(() => undefined);

  useEffect(() => {
    fetchReminders();
    loadAccounts();
  }, []);

  const bounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  const statusOf = (r: Reminder) => r.status || (r.isCompleted ? "closed" : "active");
  const isOnceOff = (r: Reminder) => r.recurrence === "none";

  // "Due" = the date has been reached but it is not paid yet.
  // Same rule as the dashboard's "N due" count.
  const dueCutoff = new Date();
  dueCutoff.setHours(23, 59, 59, 999);
  const isDue = (r: Reminder) =>
    !r.isCompleted && new Date(r.dueDate).getTime() <= dueCutoff.getTime();
  const dueCount = reminders.filter(isDue).length;

  // Combined + date filtering, most recent → oldest by timestamp
  const visible = useMemo(
    () =>
      reminders
        .filter((r) => {
          if (reminderFilter === "active" && r.isCompleted) return false;
          if (reminderFilter === "completed" && !r.isCompleted) return false;
          if (reminderFilter === "recurring" && isOnceOff(r)) return false;
          if (reminderFilter === "once_off" && !isOnceOff(r)) return false;
          if (reminderFilter === "due" && !isDue(r)) return false;
          return isWithinBounds(r.dueDate, bounds);
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.dueDate).getTime() -
            new Date(a.createdAt || a.dueDate).getTime()
        ),
    [reminders, reminderFilter, bounds]
  );

  const upcoming = visible.filter((r) => !r.isCompleted);
  const completed = visible.filter((r) => r.isCompleted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !dueDate) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, amount: parseFloat(amount), dueDate, recurrence }),
    });
    const data = await res.json();
    if (data.success) {
      setShowForm(false);
      setTitle("");
      setAmount("");
      setDueDate("");
      setRecurrence("none");
      fetchReminders();
    } else {
      setError(data.error || "Could not create the reminder");
    }
    setSaving(false);
  };

  // Deduction happens ONLY after the user confirms in the dialog
  const confirmComplete = async () => {
    if (!pending) return;
    if (!payFrom) {
      setError("Choose the account to pay from.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/reminders/${pending._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", accountId: payFrom }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not complete this reminder");
        return;
      }
      setPending(null);
      fetchReminders();
      // Balances changed — refresh them so the next pick is accurate
      loadAccounts();
      showToast(
        "success",
        `${pending.title} resolved — ${formatK(pending.amount)} deducted from ${data.data?.deductedFrom || "the selected account"}.`
      );
      window.dispatchEvent(new Event("coffers:data-updated"));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const deleteReminder = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reminders/${deleteTarget._id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ success: false }));
      if (!data.success) {
        showToast("error", data.error || "Could not delete this reminder");
        return;
      }
      setReminders((current) => current.filter((r) => r._id !== deleteTarget._id));
      setDeleteTarget(null);
      showToast("success", "Reminder deleted.");
    } catch {
      showToast("error", "Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const reopenReminder = async (reminder: Reminder) => {
    await fetch(`/api/reminders/${reminder._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: false }),
    });
    fetchReminders();
  };

  const pendingName = accounts.find((a) => a._id === payFrom)?.name || "";
  const payAccount = accounts.find((a) => a._id === payFrom);
  const payShort =
    !!pending && !!payAccount && (payAccount.currentBalance || 0) < pending.amount;
  const anyAccountCovers =
    !!pending && accounts.some((a) => (a.currentBalance || 0) >= pending.amount);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reminders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Never miss a payment</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters — status + type + due as ONE group, date as its own */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <FilterGroup
          label="REMINDER"
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "recurring", label: "Recurring" },
            { value: "once_off", label: "Once Off" },
            { value: "due", label: "Due" },
          ]}
          value={reminderFilter}
          onChange={(value) => setReminderFilter(value as ReminderFilter)}
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

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <div>
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Upcoming
              {dueCount > 0 && (
                <span className="font-mono text-orange-600">
                  {" "}· {dueCount} due
                </span>
              )}
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="text-center text-muted-foreground py-8">
                    No upcoming reminders match these filters.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map((r) => {
                  const days = daysUntil(r.dueDate);
                  return (
                    <Card key={r._id}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          aria-label={`Complete ${r.title}`}
                          onClick={() => {
                            setError(null);
                            setPending(r);
                            // Preselect an account that can actually cover it
                            const viable = accounts.find(
                              (account) => (account.currentBalance || 0) >= r.amount
                            );
                            setPayFrom(viable?._id || "");
                          }}
                        >
                          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                        </Button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`}
                            {" · "}
                            {humanDayLabel(r.dueDate)}
                            {r.recurrence !== "none" && (
                              <span className="ml-1 inline-flex items-center gap-0.5">
                                <RotateCcw className="h-2.5 w-2.5" />
                                {r.recurrence}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-mono font-semibold text-red-500 shrink-0">
                          −{formatK(r.amount)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${r.title}`}
                          onClick={() => {
                            setError(null);
                            setDeleteTarget(r);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Completed / closed */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Completed
              </h2>
              <div className="space-y-2">
                {completed.map((r) => (
                  <Card key={r._id} className="opacity-70">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label={`Reopen ${r.title}`}
                        onClick={() => reopenReminder(r)}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {statusOf(r) === "closed" ? "Closed" : "Completed"} ·{" "}
                          {humanDayLabel(r.dueDate)}
                        </p>
                      </div>
                      <span className="text-sm font-mono text-muted-foreground">
                        −{formatK(r.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${r.title}`}
                        onClick={() => {
                          setError(null);
                          setDeleteTarget(r);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {upcoming.length === 0 && completed.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-center text-muted-foreground py-8">
                  {reminders.length === 0
                    ? "No reminders yet."
                    : "No reminders match these filters."}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Add reminder modal ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add reminder</DialogTitle>
            <DialogDescription>Bills and payments, on time.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Title</Label>
              <Input
                placeholder="e.g. Rent payment"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Amount (K)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Recurrence</Label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
              >
                <option value="none">Once off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
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
                {saving ? "Creating..." : "Create Reminder"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Completion confirmation ── */}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Complete Reminder?</DialogTitle>
            <DialogDescription>
              {pending ? `${formatK(pending.amount)} will leave this account.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {pending && (
              <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium truncate">{pending.title}</span>
                <span className="text-lg font-mono font-bold text-red-500 shrink-0">
                  −{formatK(pending.amount)}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Pay from</Label>
              <select
                value={payFrom}
                onChange={(e) => setPayFrom(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm"
              >
                <option value="">Choose account</option>
                {accounts.map((account) => {
                  const short =
                    !!pending && (account.currentBalance || 0) < pending.amount;
                  return (
                    <option key={account._id} value={account._id} disabled={short}>
                      {account.name} · {formatK(account.currentBalance || 0)}
                      {short ? " — not enough" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {payShort && payAccount && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {payAccount.name} has only {formatK(payAccount.currentBalance || 0)} —
                pick another account or add funds.
              </p>
            )}
            {pending && accounts.length > 0 && !anyAccountCovers && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No account holds {formatK(pending.amount)}. Add funds, or record
                it as an expense instead.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11"
                onClick={confirmComplete}
                disabled={confirming || !payFrom || payShort}
              >
                {confirming ? "Confirming..." : "Confirm"}
              </Button>
            </div>
            {pending?.recurrence === "none" && (
              <p className="text-[11px] text-muted-foreground text-center">
                This reminder closes after confirming.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete reminder?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be removed permanently.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-11"
              onClick={deleteReminder}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
