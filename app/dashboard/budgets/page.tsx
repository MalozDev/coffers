"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Plus,
  ShoppingCart,
  X,
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
  categoryId?: { name: string; color: string; icon?: string } | null;
}

interface Account {
  _id: string;
  name: string;
  type: string;
}
interface Category { _id: string; name: string; icon?: string }

function formatK(n: number) {
  return `K${Number(n || 0).toLocaleString()}`;
}

function fmtTs(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

/** Recompute the derived totals the GET route normally attaches. */
function withTotals(b: Budget): Budget {
  const items = b.items || [];
  const itemsTotal = items.reduce((s, i) => s + i.price, 0);
  const marked = items.filter((i) => i.bought);
  return {
    ...b,
    items,
    itemsTotal,
    markedCount: marked.length,
    markedTotal: marked.reduce((s, i) => s + i.price, 0),
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

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [limitAmount, setLimitAmount] = useState("");
  const [limitPeriod, setLimitPeriod] = useState("monthly");
  const [limitCategoryId, setLimitCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);

  // Add item (inline form on detail)
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemRows, setItemRows] = useState([{ name: "", price: "" }]);
  const [adding, setAdding] = useState(false);

  // Close dialog
  const [closeOpen, setCloseOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [closing, setClosing] = useState(false);
  const [lastDeduct, setLastDeduct] = useState<string | null>(null);

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

  useEffect(() => {
    netFetch("/api/categories?type=expense")
      .then((r) => r.json())
      .then((res) => { if (res.success) setCategories(res.data.categories || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!viewId) return;
    netFetch("/api/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const nextAccounts = res.data.accounts || [];
          setAccounts(nextAccounts);
          if (!accountId && nextAccounts[0]) setAccountId(nextAccounts[0]._id);
        }
      })
      .catch(() => {});
  }, [viewId]);

  const selected = budgets.find((b) => b._id === viewId) || null;
  const isActive = !selected || (selected.status ?? "active") === "active";

  const patch = async (payload: Record<string, unknown>) => {
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
      setError("Network hiccup — please try again");
      return null;
    }
    const data = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !data.success) {
      setError(data.error || "Something went wrong");
      return null;
    }
    lastMutation.current = Date.now();
    if (data.data?.budget) {
      setBudgets((prev) => prev.map((b) => (b._id === viewId ? withTotals(data.data.budget) : b)));
    }
    return data.data;
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
        amount: limitEnabled && limitAmount ? parseFloat(limitAmount) : undefined,
        period: limitEnabled ? limitPeriod : undefined,
        categoryId: limitEnabled && limitCategoryId ? limitCategoryId : undefined,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({ success: false })) : null;
    if (!res || !data) {
      setCreating(false);
      setError("Network hiccup — please try again");
      return;
    }
    setCreating(false);
    if (res.ok && data.success) {
      lastMutation.current = Date.now();
      setCreateOpen(false);
      setNewName("");
      setLimitEnabled(false);
      setLimitAmount("");
      setLimitCategoryId("");
      setBudgets((prev) => [withTotals(data.data.budget), ...prev]);
      setViewId(data.data.budget._id);
    } else {
      setError(data.error || "Failed to create budget");
    }
  };

  // ── Add item ──────────────────────────────────────────────
  const handleAddItems = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = itemRows
      .map((row) => ({ name: row.name.trim(), price: parseFloat(row.price) }))
      .filter((row) => row.name && row.price > 0);
    if (!items.length) return;
    setAdding(true);
    const data = await patch({
      action: "add_items",
      items,
    });
    setAdding(false);
    if (data) {
      setItemRows([{ name: "", price: "" }]);
    }
  };

  // ── Toggle bought ─────────────────────────────────────────
  const toggleItem = (item: BudgetItem) => {
    if (!isActive) return;
    if (!item.bought && !accountId) {
      setError("Choose the payment account before marking an item bought.");
      return;
    }
    patch({ action: "toggle_item", itemId: item._id, bought: !item.bought, accountId });
  };

  // ── Close budget ──────────────────────────────────────────
  const openCloseDialog = () => {
    setError(null);
    setLastDeduct(null);
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const accs: Account[] = res.data.accounts || [];
          setAccounts(accs);
          const preferred =
            accs.find((a) => a.type === "cash") || accs[0];
          setAccountId(preferred?._id || "");
        }
      })
      .catch(() => {});
    setCloseOpen(true);
  };

  const handleClose = async () => {
    if (!viewId) return;
    setClosing(true);
    const data = await patch({ action: "close", accountId: accountId || undefined });
    setClosing(false);
    if (data) {
      setCloseOpen(false);
      setLastDeduct("Budget closed. Bought items were already recorded when checked.");
      load();
    } else {
      // If the first attempt landed server-side but the response was lost,
      // a retry reports "already closed" — resync instead of showing an error.
      setCloseOpen(false);
      load();
    }
  };

  // ══════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ══════════════════════════════════════════════════════════
  if (selected) {
    const items = selected.items || [];
    const markedCount = selected.markedCount || 0;
    const markedTotal = selected.markedTotal || 0;
    const itemsTotal = selected.itemsTotal || 0;

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
              <h1 className="text-lg font-bold text-foreground truncate">{selected.name}</h1>
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

        {/* Legacy category-limit progress (old budgets only) */}
        {selected.amount && selected.amount > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {selected.categoryId ? `${selected.categoryId.icon || ""} ${selected.categoryId.name} limit` : "All expenses limit"}
                </span>
                <span className="text-xs text-muted-foreground capitalize">{selected.period}</span>
              </div>
              <Progress value={selected.percentage || 0} className="h-2" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>
                  {formatK(selected.spentAmount || 0)} of {formatK(selected.amount)}
                </span>
                <span>{formatK(selected.remaining || 0)} left</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Items</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {items.length} item{items.length === 1 ? "" : "s"}
                {items.length > 0 && ` · ${markedCount} bought`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono font-bold text-foreground">
                {formatK(markedTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                ticked of {formatK(itemsTotal)}
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground px-4 pb-6 pt-4">
              No items yet — add your first item below.
            </p>
          ) : (
            <div className="divide-y divide-border border-t">
              {items.map((item) => (
                <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.bought}
                    aria-label={`Mark ${item.name} as bought`}
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
                    {formatK(item.price)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 border-t bg-muted/50">
              <div className="px-4 py-2.5 border-r">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ticked total
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
        </Card>

        {isActive && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <Label className="text-xs font-semibold">Pay checked items from</Label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1.5 w-full h-10 rounded-xl border border-input bg-white px-3 text-sm">
              <option value="">Choose payment account</option>
              {accounts.map((account) => <option key={account._id} value={account._id}>{account.name} ({account.type.replace("_", " ")})</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5">Checking an item records its expense immediately. Unchecking reverses that item&apos;s expense.</p>
          </div>
        )}

        {/* Inline add-item form (active budgets) */}
        {addItemOpen && isActive && (
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleAddItems} className="space-y-3">
                <div className="space-y-2">
                  {itemRows.map((row, index) => (
                    <div key={index} className="flex gap-2">
                      <Input placeholder="Item name" value={row.name} onChange={(e) => setItemRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, name: e.target.value } : entry))} className="h-10 flex-1" autoFocus={index === 0} />
                      <Input type="number" step="0.01" min="0.01" placeholder="Price" value={row.price} onChange={(e) => setItemRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, price: e.target.value } : entry))} className="h-10 w-28 font-mono" />
                      {itemRows.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setItemRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><X className="h-4 w-4" /></Button>}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" className="w-full h-10" onClick={() => setItemRows((current) => [...current, { name: "", price: "" }])}>
                  <Plus className="h-4 w-4" /> Add another item
                </Button>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 h-11" disabled={adding}>
                    {adding ? "Adding..." : `Add ${itemRows.length} item${itemRows.length === 1 ? "" : "s"}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => { setAddItemOpen(false); setItemRows([{ name: "", price: "" }]); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Actions — available only while the budget is active */}
        {isActive ? (
          <div className="grid grid-cols-2 gap-3 pb-4">
            <Button
              variant="outline"
              className="h-12 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={openCloseDialog}
            >
              Close budget
            </Button>
            <Button
              variant="outline"
              className="h-12 border-foreground/25"
              onClick={() => setAddItemOpen((v) => !v)}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground pb-4">
            This budget was closed on {fmtTs(selected.closedAt)}.
          </p>
        )}

        {/* ── Close dialog ── */}
        <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Close budget</DialogTitle>
              <DialogDescription>
                  {markedCount > 0
                    ? `${markedCount} bought item${markedCount === 1 ? "" : "s"} are already recorded in your transactions.`
                    : "No items have been bought yet. Closing only archives this list."}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {markedCount} of {items.length} items bought
              </span>
              <span className="text-lg font-mono font-bold">
                {formatK(markedTotal)} recorded
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setCloseOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleClose}
                disabled={closing}
              >
                {closing ? "Closing..." : "Close budget"}
              </Button>
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
            List what you plan to buy, tick it off, close it out
          </p>
        </div>
        <Button
          size="sm"
          className="border-2 border-foreground/25"
          variant="outline"
          onClick={() => {
            setNewName("");
            setLimitEnabled(false);
            setLimitAmount("");
            setLimitCategoryId("");
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No budgets yet. Create one and start listing items.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const active = (b.status ?? "active") === "active";
            const hasItems = (b.items?.length || 0) > 0;
            const hasLimit = !!b.amount;
            return (
              <button
                key={b._id}
                type="button"
                onClick={() => {
                  setViewId(b._id);
                  setError(null);
                  setLastDeduct(null);
                }}
                className="w-full text-left"
              >
                <Card className={active ? "" : "opacity-75"}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        active ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {b.name}
                        </span>
                        <StatusBadge status={b.status ?? "active"} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {hasItems
                          ? `${b.items!.length} items · ticked ${formatK(b.markedTotal || 0)} of ${formatK(b.itemsTotal || 0)}`
                          : hasLimit
                          ? `${formatK(b.spentAmount || 0)} of ${formatK(b.amount!)} spent · ${b.period}`
                          : !active
                          ? `Closed ${fmtTs(b.closedAt)}`
                          : "No items yet"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Created {fmtTs(b.createdAt)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New budget</DialogTitle>
            <DialogDescription>
              Name your budget — you&apos;ll add items on the next screen.
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={limitEnabled} onChange={(e) => setLimitEnabled(e.target.checked)} />
              Add an optional spending limit
            </label>
            {limitEnabled && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Limit amount (K)</Label>
                    <Input type="number" min="0.01" step="0.01" placeholder="e.g. 5000" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} className="h-10 font-mono" required={limitEnabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Period</Label>
                    <select value={limitPeriod} onChange={(e) => setLimitPeriod(e.target.value)} className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Category (optional)</Label>
                  <select value={limitCategoryId} onChange={(e) => setLimitCategoryId(e.target.value)} className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm">
                    <option value="">All expense categories</option>
                    {categories.map((category) => <option key={category._id} value={category._id}>{category.icon} {category.name}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground">The limit is optional and only monitors spending. It does not block purchases.</p>
              </div>
            )}
            <Button type="submit" className="w-full h-11" disabled={creating}>
              {creating ? "Creating..." : "Create budget"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
