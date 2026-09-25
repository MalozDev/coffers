"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { Plus, X, Target, Calendar, TrendingUp, Undo2 } from "lucide-react";

interface Goal {
  _id: string; name: string; targetAmount: number; currentAmount: number;
  targetDate: string; monthlyContribution: number; status: string;
  progress: number; remaining: number; monthsToComplete: number;
  projectedDate: string | null;
}
interface Account { _id: string; name: string; type: string }

function formatK(n: number) { return `K${n.toLocaleString()}`; }

export default function GoalsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/savings"); }, [router]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeAccountId, setContributeAccountId] = useState("");
  const [cancelAccountId, setCancelAccountId] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const fetchGoals = () => {
    fetch("/api/goals").then((r) => r.json()).then((res) => {
      if (res.success) setGoals(res.data.goals);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchGoals();
    fetch("/api/accounts").then((r) => r.json()).then((res) => {
      if (res.success) setAccounts(res.data.accounts);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !targetAmount || !targetDate) return;
    setSaving(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetAmount: parseFloat(targetAmount), targetDate, monthlyContribution: parseFloat(monthlyContribution) || 0 }),
    });
    const data = await res.json();
    if (data.success) { setShowForm(false); setName(""); setTargetAmount(""); setTargetDate(""); setMonthlyContribution(""); showToast("success", "Saving created successfully."); fetchGoals(); }
    else showToast("error", data.error || "Could not create saving.");
    setSaving(false);
  };

  const handleContribute = async (goalId: string) => {
    if (!contributeAmount) return;
    if (!contributeAccountId) return;
    const response = await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contribution: parseFloat(contributeAmount), accountId: contributeAccountId }),
    });
    const result = await response.json();
    if (!result.success) { showToast("error", result.error || "Could not add to saving."); return; }
    setContributeId(null);
    setContributeAmount("");
    setContributeAccountId("");
    showToast("success", "Money added to saving.");
    fetchGoals();
  };

  const handleCancelGoal = async (goalId: string) => {
    const returnAccountId = cancelAccountId[goalId];
    if (!returnAccountId && goals.find((goal) => goal._id === goalId)?.currentAmount) return;
    const response = await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", returnAccountId }),
    });
    const result = await response.json();
    if (!result.success) { showToast("error", result.error || "Could not cancel saving."); return; }
    showToast("success", "Saving cancelled.");
    fetchGoals();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Savings Goals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track your financial targets</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "New"}
        </Button>
      </div>

      {showForm && (
        <Card><CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Goal Name</Label>
              <Input placeholder="e.g. New laptop" value={name} onChange={(e) => setName(e.target.value)} className="h-11" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Target Amount (K)</Label>
                <Input type="number" step="0.01" min="1" placeholder="15000" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className="h-11 font-mono" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Target Date</Label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Monthly Contribution (K)</Label>
              <Input type="number" step="0.01" min="0" placeholder="1000" value={monthlyContribution} onChange={(e) => setMonthlyContribution(e.target.value)} className="h-11 font-mono" />
            </div>
            <Button type="submit" className="w-full h-12" disabled={saving}>{saving ? "Creating..." : "Create Goal"}</Button>
          </form>
        </CardContent></Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : goals.length === 0 ? (
        <Card><CardContent><p className="text-center text-muted-foreground py-8">No goals yet — set your first target.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <Card key={g._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent" />
                    <span className="text-sm font-semibold">{g.name}</span>
                  </div>
                  <Badge variant={g.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                    {g.status === "completed" ? "Done" : g.status}
                  </Badge>
                </div>

                <div className="flex items-end justify-between mb-1">
                  <span className="text-lg font-mono font-bold">{formatK(g.currentAmount)}</span>
                  <span className="text-xs text-muted-foreground">of {formatK(g.targetAmount)}</span>
                </div>
                <Progress value={g.progress} className="h-2 mb-2" />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.round(g.progress)}% complete</span>
                  {g.monthsToComplete > 0 && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      ~{g.monthsToComplete} months to go
                    </span>
                  )}
                </div>

                {g.monthlyContribution > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Contributing {formatK(g.monthlyContribution)}/month
                  </p>
                )}

                {/* Contribute */}
                {contributeId === g._id ? (
                  <div className="space-y-2 mt-3">
                    <select value={contributeAccountId} onChange={(e) => setContributeAccountId(e.target.value)} className="w-full h-9 rounded-xl border border-input bg-white px-3 text-sm">
                      <option value="">Fund from account</option>
                      {accounts.filter((account) => account.type !== "savings").map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
                    </select>
                  <div className="flex gap-2">
                    <Input type="number" step="0.01" min="1" placeholder="Amount"
                      value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)}
                      className="h-9 text-sm font-mono flex-1" />
                    <Button size="sm" className="h-9" onClick={() => handleContribute(g._id)}>Add</Button>
                    <Button size="sm" variant="ghost" className="h-9" onClick={() => { setContributeId(null); setContributeAmount(""); }}>Cancel</Button>
                  </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" variant="secondary" className="h-9" onClick={() => setContributeId(g._id)}>
                      <TrendingUp className="h-3.5 w-3.5 mr-1" /> Contribute
                    </Button>
                    {g.status === "active" && (
                      <select value={cancelAccountId[g._id] || ""} onChange={(e) => setCancelAccountId((current) => ({ ...current, [g._id]: e.target.value }))} className="h-9 min-w-0 flex-1 rounded-xl border border-input bg-white px-2 text-xs">
                        <option value="">Return funds to...</option>
                        {accounts.filter((account) => account.type !== "savings").map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
                      </select>
                    )}
                    {g.status === "active" && <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => handleCancelGoal(g._id)} title="Cancel goal"><Undo2 className="h-4 w-4" /></Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
