"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Plus, X, AlertTriangle } from "lucide-react";

interface Category { _id: string; name: string; color: string; icon?: string }
interface Budget {
  _id: string; name: string; amount: number; period: string; startDate: string;
  categoryId?: { name: string; color: string; icon?: string };
  spentAmount: number; percentage: number; remaining: number;
}

function formatK(n: number) { return `K${n.toLocaleString()}`; }

function getAlertLevel(pct: number) {
  if (pct >= 100) return "over";
  if (pct >= 80) return "danger";
  if (pct >= 60) return "warning";
  return "safe";
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [saving, setSaving] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/budgets").then((r) => r.json()),
      fetch("/api/categories?type=expense").then((r) => r.json()),
    ]).then(([b, c]) => {
      if (b.success) setBudgets(b.data.budgets);
      if (c.success) setCategories(c.data.categories);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !categoryId) return;
    setSaving(true);
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categoryId, amount: parseFloat(amount), period, startDate: new Date().toISOString() }),
    });
    const data = await res.json();
    if (data.success) {
      setShowForm(false);
      setName(""); setAmount(""); setCategoryId("");
      fetchData();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Budgets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Set spending limits per category</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Budget Name</Label>
                <Input placeholder="e.g. Monthly food budget" value={name} onChange={(e) => setName(e.target.value)} className="h-11" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Amount (K)</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Period</Label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Category</Label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm" required>
                  <option value="">Select</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <Button type="submit" className="w-full h-12" disabled={saving}>{saving ? "Creating..." : "Create Budget"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : budgets.length === 0 ? (
        <Card><CardContent><p className="text-center text-muted-foreground py-8">No budgets yet. Create one to start tracking.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const level = getAlertLevel(b.percentage);
            return (
              <Card key={b._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{b.categoryId?.icon}</span>
                      <span className="text-sm font-medium">{b.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground capitalize">{b.period}</span>
                  </div>
                  <Progress
                    value={b.percentage}
                    className={`h-2 ${level === "over" ? "[&>div]:bg-red-500" : level === "danger" ? "[&>div]:bg-orange-500" : level === "warning" ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatK(b.spentAmount)} of {formatK(b.amount)}
                    </span>
                    <div className="flex items-center gap-2">
                      {level === "over" && (
                        <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                          <AlertTriangle className="h-3 w-3" /> Over by {formatK(b.spentAmount - b.amount)}
                        </span>
                      )}
                      {level === "danger" && (
                        <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                          <AlertTriangle className="h-3 w-3" /> {Math.round(b.percentage)}%
                        </span>
                      )}
                      {level === "warning" && (
                        <span className="text-xs text-yellow-600 font-medium">{Math.round(b.percentage)}%</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatK(b.remaining)} left
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
