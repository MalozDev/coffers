"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

interface Category {
  _id: string;
  name: string;
  icon?: string;
  type: string;
}
interface Account {
  _id: string;
  name: string;
  type: string;
}

interface QuickEntryModalProps {
  type: "income" | "expense";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/*
 * Modal for quick income entry / expense logging straight from the
 * dashboard. Shares the same POST /api/transactions contract as the
 * income and expenses pages.
 */
export default function QuickEntryModal({
  type,
  open,
  onOpenChange,
  onSaved,
}: QuickEntryModalProps) {
  const isIncome = type === "income";

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // Load options + reset form each time the modal opens
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDescription("");
    setNote("");
    setDate(new Date().toISOString().split("T")[0]);
    setError(null);
    Promise.all([
      fetch(`/api/categories?type=${type}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]).then(([cats, accs]) => {
      if (cats.success && cats.data.categories.length > 0) {
        setCategories(cats.data.categories);
        setCategoryId(cats.data.categories[0]._id);
      }
      if (accs.success && accs.data.accounts.length > 0) {
        setAccounts(accs.data.accounts);
        const preferred =
          accs.data.accounts.find((a: Account) =>
            isIncome ? a.type === "bank" || a.type === "mobile_money" : a.type === "cash"
          ) || accs.data.accounts[0];
        setAccountId(preferred._id);
      }
    });
  }, [open, type, isIncome]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description || !categoryId || !accountId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
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
        if (data.convertedToExpected) {
          showToast("success", "Future income added to Expected Income. Mark it received when the money arrives.");
        } else {
          showToast("success", isIncome ? "Income saved successfully." : "Expense saved successfully.");
        }
        onSaved();
        onOpenChange(false);
      } else {
        const details = data.details
          ? Object.values(data.details).flat().join(" ")
          : "";
        const message = details || data.error || "Failed to save. Please try again.";
        setError(message);
        showToast("error", message);
      }
    } catch {
      const message = "Network error — try again.";
      setError(message);
      showToast("error", message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isIncome ? "Add income" : "Log expense"}</DialogTitle>
          <DialogDescription>
            {isIncome
              ? "Quick entry — money coming in."
              : "Quick entry — money going out."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

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
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Description</Label>
            <Input
              placeholder={isIncome ? "e.g. Salary, freelance work" : "e.g. Lunch, transport"}
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
                <option value="">Select</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
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
                placeholder="Optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="outline"
            disabled={saving}
            className={
              isIncome
                ? "w-full h-12 border-2 border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
                : "w-full h-12 border-2 border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20"
            }
          >
            {saving
              ? "Saving..."
              : isIncome
              ? "Save income"
              : "Save expense"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
