"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Wallet,
  Eye,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface DashboardData {
  balance: {
    total: number;
    accounts: { name: string; type: string; balance: number }[];
    expected: number;
    committed: number;
  };
  today: { income: number; expenses: number };
  month: { income: number; expenses: number };
  lifetime: { income: number; expenses: number };
  recentTransactions: Array<{
    _id: string;
    type: "income" | "expense" | "transfer";
    amount: number;
    description: string;
    date: string;
    categoryId?: { name: string; color: string; icon: string };
    accountId?: { name: string };
  }>;
  upcomingReminders: Array<{
    _id: string;
    title: string;
    amount: number;
    dueDate: string;
  }>;
  expectedIncome: Array<{
    _id: string;
    source: string;
    amount: number;
    expectedDate: string;
  }>;
  insights: string[];
}

function formatK(amount: number): string {
  return `K${amount.toLocaleString()}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-36 bg-muted rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 bg-muted rounded-xl animate-pulse" />
          <div className="h-14 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Failed to load dashboard</p>
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {getGreeting()} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Here&apos;s your financial overview
        </p>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-background to-accent/10 border-accent/20 overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Available Now
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-bold text-foreground font-mono tracking-tight">
            {formatK(data.balance.total)}
          </p>
          <div className="flex gap-5 mt-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Expected</p>
              <p className="text-sm font-semibold text-green-600 font-mono">
                + {formatK(data.balance.expected)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Committed</p>
              <p className="text-sm font-semibold text-red-500 font-mono">
                − {formatK(data.balance.committed)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" className="h-14 text-sm font-semibold gap-2">
          <ArrowDownCircle className="h-5 w-5 text-green-600" />
          + Income
        </Button>
        <Button variant="destructive" className="h-14 text-sm font-semibold gap-2">
          <ArrowUpCircle className="h-5 w-5" />
          − Expense
        </Button>
      </div>

      {/* Today & Month */}
      <div className="grid grid-cols-2 gap-3">
        <Card size="sm">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Today
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-green-500" /> In
                </span>
                <span className="text-sm font-mono font-semibold text-green-600">
                  + {formatK(data.today.income)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowUpCircle className="h-3 w-3 text-red-500" /> Out
                </span>
                <span className="text-sm font-mono font-semibold text-red-500">
                  − {formatK(data.today.expenses)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              This Month
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-green-500" /> In
                </span>
                <span className="text-sm font-mono font-semibold text-green-600">
                  + {formatK(data.month.income)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowUpCircle className="h-3 w-3 text-red-500" /> Out
                </span>
                <span className="text-sm font-mono font-semibold text-red-500">
                  − {formatK(data.month.expenses)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insight */}
      {data.insights.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-accent/10 shrink-0">
                <TrendingUp className="h-4 w-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Coffers noticed</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {data.insights[0]}
                </p>
                <button className="mt-2 text-xs font-semibold text-accent flex items-center gap-1 active:opacity-70">
                  <Eye className="h-3.5 w-3.5" /> View analysis
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expected Income */}
      {data.expectedIncome.length > 0 && (
        <div>
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Expected Income
          </h2>
          <Card>
            <div className="divide-y divide-border">
              {data.expectedIncome.slice(0, 3).map((item) => (
                <div key={item._id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.source}</p>
                    <p className="text-xs text-muted-foreground">
                      Expected: {new Date(item.expectedDate).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-green-600">
                    + {formatK(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Upcoming Reminders */}
      {data.upcomingReminders.length > 0 && (
        <div>
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Upcoming
          </h2>
          <Card>
            <div className="divide-y divide-border">
              {data.upcomingReminders.map((r) => (
                <div key={r._id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: {new Date(r.dueDate).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-red-500">
                    − {formatK(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Transactions
          </h2>
          <button className="text-xs font-semibold text-accent flex items-center gap-0.5 active:opacity-70">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <Card>
          {data.recentTransactions.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No transactions yet. Start by adding income or an expense.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentTransactions.map((tx) => (
                <div key={tx._id} className="flex items-center gap-3 px-4 py-3 active:bg-muted/50">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      tx.type === "income" ? "bg-green-50" : "bg-red-50"
                    }`}
                  >
                    {tx.type === "income" ? (
                      <ArrowDownCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.categoryId?.name || tx.type} · {tx.accountId?.name || ""}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold shrink-0 ${
                      tx.type === "income" ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "−"} {formatK(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
