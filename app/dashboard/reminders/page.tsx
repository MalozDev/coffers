"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Bell, Check, RotateCcw } from "lucide-react";

interface Reminder {
  _id: string; title: string; amount: number; dueDate: string;
  recurrence: string; isCompleted: boolean;
  categoryId?: { name: string; color: string };
}

function formatK(n: number) { return `K${n.toLocaleString()}`; }

function daysUntil(date: string) {
  const d = new Date(date);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [saving, setSaving] = useState(false);

  const fetchReminders = () => {
    fetch("/api/reminders").then((r) => r.json()).then((res) => {
      if (res.success) setReminders(res.data.reminders);
      setLoading(false);
    });
  };

  useEffect(() => { fetchReminders(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !dueDate) return;
    setSaving(true);
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, amount: parseFloat(amount), dueDate, recurrence }),
    });
    const data = await res.json();
    if (data.success) { setShowForm(false); setTitle(""); setAmount(""); setDueDate(""); fetchReminders(); }
    setSaving(false);
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: completed }),
    });
    fetchReminders();
  };

  const upcoming = reminders.filter((r) => !r.isCompleted);
  const completed = reminders.filter((r) => r.isCompleted);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reminders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Never miss a payment</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {showForm && (
        <Card><CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Title</Label>
              <Input placeholder="e.g. Rent payment" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Amount (K)</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Recurrence</Label>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm">
                <option value="none">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <Button type="submit" className="w-full h-12" disabled={saving}>{saving ? "Creating..." : "Create Reminder"}</Button>
          </form>
        </CardContent></Card>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Upcoming</h2>
              <div className="space-y-2">
                {upcoming.map((r) => {
                  const days = daysUntil(r.dueDate);
                  return (
                    <Card key={r._id}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => toggleComplete(r._id, true)}>
                          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                        </Button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`}
                            {r.recurrence !== "none" && <span className="ml-1 inline-flex items-center gap-0.5"><RotateCcw className="h-2.5 w-2.5" />{r.recurrence}</span>}
                          </p>
                        </div>
                        <span className="text-sm font-mono font-semibold text-red-500 shrink-0">−{formatK(r.amount)}</span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completed</h2>
              <div className="space-y-2">
                {completed.slice(0, 5).map((r) => (
                  <Card key={r._id} className="opacity-60">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => toggleComplete(r._id, false)}>
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through">{r.title}</p>
                      </div>
                      <span className="text-sm font-mono text-muted-foreground">−{formatK(r.amount)}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {upcoming.length === 0 && completed.length === 0 && (
            <Card><CardContent><p className="text-center text-muted-foreground py-8">No reminders yet. Add one to stay on top of your obligations.</p></CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
