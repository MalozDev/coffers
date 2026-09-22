"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coins, ChevronRight, Landmark } from "lucide-react";

interface SavingsAccount {
  _id: string;
  name: string;
  type: string;
  balance: number;
}
interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  status: "active" | "completed" | "paused";
}
interface SavingsData {
  accounts: SavingsAccount[];
  total: number;
  monthNet: number;
  trend: { label: string; balance: number }[];
  goals: Goal[];
}

function formatK(n: number) {
  return `K${Math.round(n || 0).toLocaleString()}`;
}

function GoalStatusBadge({ status }: { status: Goal["status"] }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
        Completed
      </Badge>
    );
  if (status === "paused")
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        Paused
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
      Active
    </Badge>
  );
}

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/savings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(true);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded-2xl animate-pulse" />
        <div className="h-44 bg-muted rounded-2xl animate-pulse" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to load savings. Please try again.
        </CardContent>
      </Card>
    );
  }

  const activeGoals = data.goals.filter((g) => g.status !== "completed");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Savings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Money set aside, growing over time
        </p>
      </div>

      {/* Hero: total saved */}
      <Card className="border-green-200 bg-green-50/60">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-green-700">
            <Coins className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">
              Total saved
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-mono font-bold text-foreground mt-2">
            {formatK(data.total)}
          </p>
          <p className={`text-sm font-semibold mt-1 ${data.monthNet >= 0 ? "text-green-600" : "text-red-500"}`}>
            {data.monthNet >= 0 ? "+" : "−"}
            {formatK(Math.abs(data.monthNet))} this month
          </p>
        </CardContent>
      </Card>

      {/* 6-month trend */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Balance trend · last 6 months</h3>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v: number) => formatK(v)}
                />
                <Tooltip
                  formatter={(value) => [formatK(Number(value)), "Balance"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                    background: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#16a34a"
                  strokeWidth={2}
                  fill="url(#savingsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Savings accounts */}
      <Card>
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold">Savings accounts</h3>
        </div>
        {data.accounts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground px-4 pb-6 pt-2">
            No savings accounts yet. Add one from Settings → Accounts.
          </p>
        ) : (
          <div className="divide-y divide-border border-t">
            {data.accounts.map((a) => (
              <div key={a._id} className="flex items-center gap-3 px-4 py-3">
                <div className="p-2 rounded-lg bg-green-50 text-green-600 shrink-0">
                  <Landmark className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {a.type.replace("_", " ")}
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-foreground">
                  {formatK(a.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Goals summary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Savings goals
          </h2>
          <Link
            href="/dashboard/goals"
            className="text-xs font-semibold text-accent flex items-center gap-0.5 active:opacity-70"
          >
            See all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.goals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No goals yet — create one to start saving towards something.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeGoals.slice(0, 3).map((g) => {
              const pct = Math.min(
                Math.round((g.currentAmount / g.targetAmount) * 100),
                100
              );
              return (
                <Card key={g._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {g.name}
                      </span>
                      <GoalStatusBadge status={g.status} />
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {formatK(g.currentAmount)} of {formatK(g.targetAmount)}
                      </span>
                      <span className="font-semibold text-accent">{pct}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
