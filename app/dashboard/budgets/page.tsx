"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";

interface BudgetItem {
  _id: string;
  name: string;
  price: number;
  bought: boolean;
  boughtAt?: string;
  transactionId?: string;
  addedAt: string;
}

interface Budget {
  _id: string;
  name: string;
  status?: "active" | "closed";
  items?: BudgetItem[];
  itemsTotal?: number;
  markedCount?: number;
  markedTotal?: number;
  closedAt?: string;
  createdAt?: string;
  amount?: number;
  period?: string;
  spentAmount?: number;
  percentage?: number;
  remaining?: number;
  accountId?: { _id: string; name: string; type: string } | string | null;
  categoryId?: { name: string; color: string; icon?: string } | null;
}

interface Account {
  _id: string;
  name: string;
  type: string;
  currentBalance?: number;
}
interface Category {
  _id: string;
  name: string;
  icon?: string;
}

function formatK(n: number) {
  return `K${Number(n || 0).toLocaleString()}`;
}

/** A checkout price entry: empty/invalid input counts as "still unpriced". */
function priceOf(raw: string | undefined) {
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmtTs(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

function accountIdOf(budget: Budget): string {
  if (!budget.accountId) return "";
  return typeof budget.accountId === "string"
    ? budget.accountId
    : budget.accountId._id;
}

function accountNameOf(budget: Budget): string {
  if (!budget.accountId || typeof budget.accountId === "string") return "";
  return budget.accountId.name;
}

/** Recompute the derived totals the GET route normally attaches. */
function withTotals(b: Budget): Budget {
  const items = b.items || [];
  const itemsTotal = items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const marked = items.filter((i) => i.bought);
  return {
    ...b,
    items,
    itemsTotal,
    markedCount: marked.length,
    markedTotal: marked.reduce((s, i) => s + (Number(i.price) || 0), 0),
  };
}

function StatusBadge({ status }: { status?: "active" | "closed" }) {
  return status === "closed" ? (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      Closed
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
      Active
    </Badge>
  );
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters — defaults show everything
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed">("all");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Create dialog — spending limit + payment method
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);

  // Add item modal
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemRows, setItemRows] = useState([{ name: "", price: "" }]);
  const [adding, setAdding] = useState(false);

  // Close dialog
  const [closeOpen, setCloseOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [closing, setClosing] = useState(false);
  const [lastDeduct, setLastDeduct] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  // Checkout price confirmation: estimates often differ from the real price,
  // so each checked item's amount is editable right before the close.
  const [checkoutPrices, setCheckoutPrices] = useState<Record<string, string>>({});

  // Delete (closed budgets only)
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch with a timeout + one transparent retry — a stale keep-alive socket
  // would otherwise hang the request forever (browser never surfaces an error).
  const netFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
          return await fetch(url, { ...init, signal: ctrl.signal });
      } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (attempt >= 1) throw err;
      }
    }
  };

  // Ignore list responses that were requested BEFORE our latest local change —
  // otherwise a slow mount-time fetch resolves after a create and wipes it.
  const lastMutation = useRef(0);

  const load = () => {
    const startedAt = Date.now();
    netFetch("/api/budgets")
      .then((r) => r.json())
      .then((res) => {
        if (startedAt >= lastMutation.current && res.success) {
          setBudgets((res.data.budgets as Budget[]).map(withTotals));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  const loadAccounts = () => {
    netFetch("/api/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const nextAccounts: Account[] = res.data.accounts || [];
          setAccounts(nextAccounts);
          if (nextAccounts[0]) {
            setAccountId((current) => current || nextAccounts[0]._id);
            setNewAccountId((current) => current || nextAccounts[0]._id);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    netFetch("/api/categories?type=expense")
      .then((r) => r.json())
      .then((res) => { if (res.success) setCategories(res.data.categories || []); })
      .catch(() => {});
    loadAccounts();
  }, []);

  const selected = budgets.find((b) => b._id === viewId) || null;
  const isActive = !selected || (selected.status ?? "active") === "active";

  const bounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  const visibleBudgets = useMemo(
    () =>
      budgets.filter((budget) => {
        const status = budget.status ?? "active";
        if (statusFilter !== "all" && status !== statusFilter) return false;
        const stamp = budget.createdAt || budget.closedAt || "";
        if (!stamp) return dateFilter === "all";
        return isWithinBounds(stamp, bounds);
      }),
    [budgets, statusFilter, bounds, dateFilter]
  );

  interface PatchResult {
    ok: boolean;
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    error?: string;
  }

  const patch = async (
    payload: Record<string, unknown>
  ): Promise<PatchResult | null> => {
    if (!viewId) return null;
    setError(null);
    let res: Response;
    try {
      res = await netFetch(`/api/budgets/${viewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      const message = "Network error — try again";
      setError(message);
      return { ok: false, status: 0, error: message };
    }
    const data = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !data.success) {
      const message = data.error || "Something went wrong";
      setError(message);
      return { ok: false, status: res.status, error: message };
    }
    lastMutation.current = Date.now();
    if (data.data?.budget) {
      setBudgets((prev) => prev.map((b) => (b._id === viewId ? withTotals(data.data.budget) : b)));
    }
    return { ok: true, status: res.status, data: data.data };
  };

  // ── Create ────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await netFetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        amount: limitAmount ? parseFloat(limitAmount) : undefined,
        accountId: newAccountId || undefined,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({ success: false })) : null;
    if (!res || !data) {
      setCreating(false);
      setError("Network error — try again");
      return;
    }
    setCreating(false);
    if (res.ok && data.success) {
      lastMutation.current = Date.now();
      setCreateOpen(false);
      setNewName("");
      setLimitAmount("");
      setBudgets((prev) => [withTotals(data.data.budget), ...prev]);
      setViewId(data.data.budget._id);
    } else {
      setError(data.error || "Failed to create budget");
    }
  };

  // ── Add item (modal) ──────────────────────────────────────
  const handleAddItems = async (e: React.FormEvent) => {
    e.preventDefault();
    // Price is optional — leave it blank and it gets confirmed at checkout.
    const items = itemRows
      .map((row) => {
        const price = parseFloat(row.price);
        return {
          name: row.name.trim(),
          ...(Number.isFinite(price) && price > 0 ? { price } : {}),
        };
      })
      .filter((row) => row.name);
    if (!items.length) return;
    setAdding(true);
    const result = await patch({ action: "add_items", items });
    setAdding(false);
    if (result?.ok) {
      setItemRows([{ name: "", price: "" }]);
      setAddItemOpen(false);
    }
  };

  // ── Tick / untick (no money moves until the budget closes) ──
  const toggleItem = (item: BudgetItem) => {
    if (!isActive) return;
    patch({ action: "toggle_item", itemId: item._id, bought: !item.bought });
  };

  // ── Close budget ──────────────────────────────────────────
  const openCloseDialog = () => {
    setError(null);
    setCloseError(null);
    setLastDeduct(null);
    // Seed the checkout form with the estimate for every checked item so the
    // real price can be confirmed (or corrected) before anything is charged.
    const seeded = Object.fromEntries(
      (selected?.items || [])
        .filter((i) => i.bought)
        .map((i) => [i._id, i.price ? String(i.price) : ""])
    );
    setCheckoutPrices(seeded);
    const toDeduct = (selected?.items || [])
      .filter((i) => i.bought)
      .reduce((sum, i) => sum + priceOf(seeded[i._id]), 0);
    const preferred = accountIdOf(selected as Budget) || accountId || accounts[0]?._id || "";
    const preferredBalance =
      accounts.find((a) => a._id === preferred)?.currentBalance || 0;
    // Default to an account that can actually cover the checked items
    const viable = accounts.find((a) => (a.currentBalance || 0) >= toDeduct);
    setAccountId(
      preferred && preferredBalance >= toDeduct
        ? preferred
        : viable?._id || preferred
    );
    setCloseOpen(true);
  };

  const handleClose = async () => {
    if (!viewId) return;
    setClosing(true);
    setCloseError(null);
    const prices = (selected?.items || [])
      .filter((i) => i.bought)
      .map((i) => ({
        itemId: i._id,
        price: priceOf(checkoutPrices[i._id] ?? (i.price ? String(i.price) : "")),
      }));
    const result = await patch({
      action: "close",
      accountId: accountId || undefined,
      prices,
    });
    setClosing(false);
    if (result?.ok) {
      setCloseOpen(false);
      const amount = Number(result.data?.deducted || 0);
      const fromName =
        accounts.find((a) => a._id === (result.data?.deductedFrom || accountId))?.name ||
        accountNameOf(selected as Budget);
      setLastDeduct(
        amount > 0
          ? `Closed — ${formatK(amount)} taken from ${fromName || "the payment account"}.`
          : "Closed — nothing to pay."
      );
      load();
      // The close moved money — refresh balances for the next decision
      loadAccounts();
    } else if (result && /already closed/i.test(result.error || "")) {
      // The first attempt landed server-side but the response was lost —
      // resync instead of showing an error.
      setCloseOpen(false);
      load();
    } else {
      // Keep the dialog open so the reason (e.g. not enough balance) stays
      // visible right next to the payment picker.
      setCloseError(result?.error || "Network error — try again");
    }
  };

  // ── Delete a closed budget ────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await netFetch(`/api/budgets/${deleteTarget._id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        setError(data.error || "Could not delete this budget");
        return;
      }
      lastMutation.current = Date.now();
      setBudgets((prev) => prev.filter((b) => b._id !== deleteTarget._id));
      if (viewId === deleteTarget._id) setViewId(null);
      setDeleteTarget(null);
    } catch {
      setError("Network error — try again");
    } finally {
      setDeleting(false);
    }
  };

  // ══════════════════════════════════════════════════════════
  //  DETAIL VIEW — a book page
  // ══════════════════════════════════════════════════════════
  if (selected) {
    const items = selected.items || [];
    const markedCount = selected.markedCount || 0;
    const markedTotal = selected.markedTotal || 0;
    const itemsTotal = selected.itemsTotal || 0;
    const paymentName =
      accountNameOf(selected) ||
      accounts.find((a) => a._id === accountIdOf(selected))?.name ||
      "Not set";
    const closeAccount = accounts.find((a) => a._id === accountId);
    // Live checkout numbers — the price inputs in the close dialog may have
    // been edited away from the stored estimate.
    const checkedItems = items.filter((i) => i.bought);
    const checkoutTotal = checkedItems.reduce(
      (sum, i) => sum + priceOf(checkoutPrices[i._id] ?? (i.price ? String(i.price) : "")),
      0
    );
    const unpricedChecked = checkedItems.filter(
      (i) => priceOf(checkoutPrices[i._id] ?? (i.price ? String(i.price) : "")) <= 0
    );
    const closeAccountShort =
      !!closeAccount &&
      checkoutTotal > 0 &&
      (closeAccount.currentBalance || 0) < checkoutTotal;
    const noAccountCovers =
      checkoutTotal > 0 &&
      accounts.length > 0 &&
      !accounts.some((a) => (a.currentBalance || 0) >= checkoutTotal);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => {
              setViewId(null);
              setError(null);
              setLastDeduct(null);
              setAddItemOpen(false);
              load();
            }}
            aria-label="Back to budgets"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground truncate">
                {selected.name}
              </h1>
              <StatusBadge status={selected.status ?? "active"} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {fmtTs(selected.createdAt)}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {lastDeduct && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {lastDeduct}
          </div>
        )}

        {/* ── Book page ── */}
        <div className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-200/70 bg-[#fffdf6] shadow-[0_2px_14px_rgba(0,0,0,0.06)] px-5 py-6 sm:px-8 sm:py-8 dark:bg-card">
          {/* Title */}
          <div className="text-center no-select">
            <p className="text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
              Budget
            </p>
            <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-foreground">
              {selected.name}
            </h2>
          </div>

          {/* Details */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background/70 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Spending Limit
              </p>
              <p className="mt-1 text-lg font-mono font-bold text-foreground">
                {selected.amount ? formatK(selected.amount) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Payment Method
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">
                {paymentName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Paid when this budget closes
              </p>
            </div>
          </div>

          {/* Legacy category-limit progress (old budgets only) */}
          {selected.amount && selected.categoryId && (
            <div className="mt-4 rounded-xl border border-border bg-background/70 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {selected.categoryId.icon || ""} {selected.categoryId.name} limit
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {selected.period}
                </span>
              </div>
              <Progress value={selected.percentage || 0} className="h-2" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>
                  {formatK(selected.spentAmount || 0)} of {formatK(selected.amount)}
                </span>
                <span>{formatK(selected.remaining || 0)} left</span>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="my-5 border-t border-dashed border-border" />

          {/* Budget items */}
          <div className="flex items-center justify-between no-select">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Budget Items
            </h3>
            <div className="text-right">
              <p className="text-sm font-mono font-bold text-foreground">
                {formatK(markedTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                checked of {formatK(itemsTotal)}
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              No items yet — add one below.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {items.map((item) => (
                <li key={item._id} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.bought}
                    aria-label={`Mark ${item.name} as checked`}
                    disabled={!isActive}
                    onClick={() => toggleItem(item)}
                    className={`h-5 w-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                      item.bought
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-border bg-white hover:border-green-400"
                    } ${!isActive ? "opacity-50 cursor-default" : ""}`}
                  >
                    {item.bought && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        item.bought ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {item.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Added {fmtTs(item.addedAt)}
                      {item.bought && item.boughtAt && ` · Bought ${fmtTs(item.boughtAt)}`}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold shrink-0 ${
                      item.bought ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {item.price ? (
                      formatK(item.price)
                    ) : (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        set at checkout
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="mt-4 grid grid-cols-2 rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-r border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Checked total
                </p>
                <p className="text-sm font-mono font-bold text-green-600">
                  {formatK(markedTotal)}
                </p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  All items
                </p>
                <p className="text-sm font-mono font-bold">{formatK(itemsTotal)}</p>
              </div>
            </div>
          )}

          {/* Add Item — anchored at the bottom of the book page */}
          {isActive && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                className="h-11 px-6 border-foreground/25"
                onClick={() => {
                  setItemRows([{ name: "", price: "" }]);
                  setAddItemOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
          )}
        </div>

        {isActive ? (
          <div className="flex justify-center pb-4">
            <Button
              variant="outline"
              className="h-12 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={openCloseDialog}
            >
              Close budget
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground pb-4">
            Closed {fmtTs(selected.closedAt)}.
          </p>
        )}

        {/* ── Add item modal ── */}
        <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add budget item</DialogTitle>
              <DialogDescription>Tick items as you buy them.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddItems} className="space-y-3">
              <div className="space-y-2">
                {itemRows.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Item name"
                      value={row.name}
                      onChange={(e) =>
                        setItemRows((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index ? { ...entry, name: e.target.value } : entry
                          )
                        )
                      }
                      className="h-10 flex-1"
                      autoFocus={index === 0}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Amount"
                      value={row.price}
                      onChange={(e) =>
                        setItemRows((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index ? { ...entry, price: e.target.value } : entry
                          )
                        )
                      }
                      className="h-10 w-28 font-mono"
                    />
                    {itemRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() =>
                          setItemRows((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index)
                          )
                        }
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={() =>
                  setItemRows((current) => [...current, { name: "", price: "" }])
                }
              >
                <Plus className="h-4 w-4" /> Add another item
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Skip the price — confirm it at checkout.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => setAddItemOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 h-11" disabled={adding}>
                  {adding ? "Adding..." : "Add"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Close dialog ── */}
        <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Checkout &amp; close budget</DialogTitle>
              <DialogDescription>
                Confirm the final prices. Only checked items are charged.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {markedCount} of {items.length} items checked
                </span>
                <span className="text-lg font-mono font-bold">
                  {formatK(checkoutTotal)}
                </span>
              </div>

              {/* Price confirmation — the estimate can be corrected here */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs font-semibold">Confirm prices</Label>
                  <span className="text-[11px] text-muted-foreground">
                    edit if different
                  </span>
                </div>
                {checkedItems.length === 0 ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                    Nothing checked — nothing to pay.
                  </p>
                ) : (
                  checkedItems.map((item) => (
                    <div key={item._id} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm text-foreground">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {item.price ? `est. ${formatK(item.price)}` : "no estimate"}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Price"
                        aria-label={`Actual price for ${item.name}`}
                        value={checkoutPrices[item._id] ?? ""}
                        onChange={(e) =>
                          setCheckoutPrices((current) => ({
                            ...current,
                            [item._id]: e.target.value,
                          }))
                        }
                        className="h-9 w-24 font-mono shrink-0"
                      />
                    </div>
                  ))
                )}
                {unpricedChecked.length > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    Add a price for {unpricedChecked.map((i) => i.name).join(", ")}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment method</Label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm"
                >
                  <option value="">Choose payment account</option>
                  {accounts.map((account) => {
                    const short = markedTotal > 0 && (account.currentBalance || 0) < markedTotal;
                    return (
                      <option key={account._id} value={account._id} disabled={short}>
                        {account.name} ({account.type.replace("_", " ")}) ·{" "}
                        {formatK(account.currentBalance || 0)}
                        {short ? " — not enough" : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {formatK(checkoutTotal)} will leave this account.
                </p>
                {closeAccountShort && closeAccount && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    {closeAccount.name} has only {formatK(closeAccount.currentBalance || 0)} —
                    pick another account or add funds.
                  </p>
                )}
                {noAccountCovers && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    No account holds {formatK(checkoutTotal)} — add funds first.
                  </p>
                )}
              </div>

              {closeError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {closeError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => setCloseOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-11"
                  variant="destructive"
                  onClick={handleClose}
                  disabled={
                    closing ||
                    (markedCount > 0 && !accountId) ||
                    unpricedChecked.length > 0 ||
                    closeAccountShort ||
                    noAccountCovers
                  }
                >
                  {closing ? "Closing..." : "Confirm & close"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  LIST VIEW
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Budgets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Plan purchases, tick them off, close it out
          </p>
        </div>
        <Button
          size="sm"
          className="border-2 border-foreground/25"
          variant="outline"
          onClick={() => {
            setNewName("");
            setLimitAmount("");
            setNewAccountId(accounts[0]?._id || "");
            setError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New
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
          label="STATUS"
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "closed", label: "Closed" },
          ]}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as "all" | "active" | "closed")}
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
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visibleBudgets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {budgets.length === 0 ? "No budgets yet." : "No budgets match these filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleBudgets.map((b) => {
            const active = (b.status ?? "active") === "active";
            const hasItems = (b.items?.length || 0) > 0;
            const hasLimit = !!b.amount;

            const row = (
              <Card className={active ? "" : "opacity-90"}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      active ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setViewId(b._id);
                      setError(null);
                      setLastDeduct(null);
                      setAccountId(accountIdOf(b));
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {b.name}
                      </span>
                      <StatusBadge status={b.status ?? "active"} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {hasItems
                        ? `${b.items!.length} items · checked ${formatK(b.markedTotal || 0)} of ${formatK(b.itemsTotal || 0)}`
                        : hasLimit
                        ? `${formatK(b.spentAmount || 0)} of ${formatK(b.amount!)} spent · ${b.period || "limit"}`
                        : !active
                        ? `Closed ${fmtTs(b.closedAt)}`
                        : "No items yet"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Created {b.createdAt ? humanDayLabel(b.createdAt) : "—"}
                      {!active && b.closedAt && ` · Closed ${humanDayLabel(b.closedAt)}`}
                    </p>
                  </button>
                  {active ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${b.name}`}
                      onClick={() => setDeleteTarget(b)}
                      className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </CardContent>
              </Card>
            );

            // Closed budgets show a bin icon on the row (no swipe needed)
            return <div key={b._id}>{row}</div>;
          })}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New budget</DialogTitle>
            <DialogDescription>
              Set a limit and the account it's paid from.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Budget name</Label>
              <Input
                placeholder="e.g. Groceries for the week"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-11"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Spending limit (K)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 5000"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
                className="h-11 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Payment method</Label>
              <select
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
                className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
              >
                <option value="">Choose account</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name} ({account.type.replace("_", " ")})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Checked items are paid from this account.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-11" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete budget?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be deleted. Recorded expenses
              stay.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-11"
              onClick={handleDelete}
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
