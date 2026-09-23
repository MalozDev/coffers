"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  Plus,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import QuickEntryModal from "@/components/quick-entry/QuickEntryModal";

interface DashboardData {
  user: { name: string; email: string } | null;
  balance: {
    total: number;
    accounts: { name: string; type: string; balance: number }[];
    expected: number;
    committed: number;
  };
  today: { income: number; expenses: number };
  month: { income: number; expenses: number };
  expectedIncome: Array<{
    _id: string;
    source: string;
    amount: number;
    expectedDate: string;
  }>;
  upcomingReminders: Array<{
    _id: string;
    title: string;
    amount: number;
    dueDate: string;
  }>;
  upcomingCount: number;
  insights: string[];
}

function formatK(amount: number): string {
  return `K${Math.round(amount || 0).toLocaleString()}`;
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
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Greeting: shown on the first dashboard visit of each day, then hidden
  useEffect(() => {
    try {
      const key = `coffers:greeting:${new Date().toDateString()}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setShowGreeting(true);
      }
    } catch {
      // private mode etc. — still greet once per mount
      setShowGreeting(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
        <div className="h-12 bg-muted rounded-xl animate-pulse" />
        <div className="h-32 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Failed to load dashboard</p>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // ── Derived money figures ─────────────────────────────────
  const sumByType = (types: string[]) =>
    data.balance.accounts
      .filter((a) => types.includes(a.type))
      .reduce((s, a) => s + a.balance, 0);

  const cash = sumByType(["cash"]);
  const mobile = sumByType(["mobile_money"]);
  const bank = sumByType(["bank"]);
  const savings = sumByType(["savings"]);
  const other =
    data.balance.total - (cash + mobile + bank + savings);
  const available = cash + mobile + bank + other;
  const netWorth = data.balance.total + data.balance.expected;
  const committed = data.month.expenses;
  const firstName = data.user?.name?.split(" ")[0] || "";

  // "Due" = a bill whose date has been reached but not paid yet; completed
  // (closed) reminders are excluded server-side, so this drops as you close them.
  const upcomingCount = data.upcomingCount ?? data.upcomingReminders.length;

  return (
    <div className="space-y-3">
      {/* Greeting — first dashboard visit of the day only */}
      {showGreeting && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Your money, at a glance
          </p>
          <h1 className="text-xl font-bold tracking-tight text-foreground mt-1">
            {getGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
      )}

      {/* Balance card */}
      <Card className="border border-blue-500/50 bg-gray-700 text-green-400 shadow-xl">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white/70">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                Available balance
              </span>
            </div>
            <span className="text-[10px] rounded-full border border-white/20 px-2 py-0.5 text-white/70">
              Live
            </span>
          </div>

          <p className="text-3xl sm:text-4xl font-bold font-mono tracking-tight mt-1">
            {formatK(available)}
          </p>

          {/* Little-text breakdown: what makes up the available balance */}
          <p className="text-[11px] text-white/70 mt-1.5 leading-relaxed">
            Cash {formatK(cash)} · Mobile {formatK(mobile)} · Bank {formatK(bank)}
            {other > 0 ? ` · Other ${formatK(other)}` : ""}
          </p>

          {/* Net worth (balance + expected) with expected below in small text */}
          <div className="border-t border-white/10 mt-2 pt-2 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] text-white/60 uppercase tracking-wider">
                Net worth
              </p>
              <p className="text-[11px] text-white/60 mt-0.5">
                + {formatK(data.balance.expected)} expected · {formatK(savings)} saved
              </p>
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono shrink-0">
              {formatK(netWorth)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions — open quick-entry modals (bordered buttons) */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-12 border-2 border-green-500 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-700 text-sm font-semibold"
          onClick={() => setIncomeOpen(true)}
        >
          <ArrowDownCircle className="h-5 w-5" /> Add income
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="h-12 border-2 border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive text-sm font-semibold"
          onClick={() => setExpenseOpen(true)}
        >
          <ArrowUpCircle className="h-5 w-5" /> Log expense
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Today / This month — wrapped in a single border + committed out */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Today
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowDownCircle className="h-3 w-3 text-green-500" /> In
              </span>
              <span className="text-sm font-mono font-semibold text-green-600">
                + {formatK(data.today.income)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowUpCircle className="h-3 w-3 text-red-500" /> Out
              </span>
              <span className="text-sm font-mono font-semibold text-red-500">
                − {formatK(data.today.expenses)}
              </span>
            </div>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              This month
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowDownCircle className="h-3 w-3 text-green-500" /> In
              </span>
              <span className="text-sm font-mono font-semibold text-green-600">
                + {formatK(data.month.income)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowUpCircle className="h-3 w-3 text-red-500" /> Out
              </span>
              <span className="text-sm font-mono font-semibold text-red-500">
                − {formatK(data.month.expenses)}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Committed out · this month
          </span>
          <span className="text-sm font-mono font-bold text-red-500">
            − {formatK(committed)}
          </span>
        </div>
      </div>

      {/* Quick links — compressed expected / upcoming / recent */}
      <Card>
        <div className="grid grid-cols-3 divide-x divide-border">
          <Link
            href="/dashboard/income"
            className="flex flex-col items-center gap-1 px-2 py-3 text-center active:bg-muted/50"
          >
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-[10px] font-medium text-foreground leading-tight">
              Expected income
            </span>
            <span className="text-[10px] font-mono font-semibold text-green-600">
              + {formatK(data.balance.expected)}
            </span>
          </Link>
          <Link
            href="/dashboard/reminders"
            className="flex flex-col items-center gap-1 px-2 py-3 text-center active:bg-muted/50"
          >
            <Bell className="h-4 w-4 text-orange-500" />
            {/* Number + "due" stacked below the label (mobile) */}
            <span className="text-[10px] font-medium text-foreground leading-tight">
              Upcoming
            </span>
            <span className="text-[11px] font-mono font-bold leading-tight text-orange-600">
              {upcomingCount > 0 ? `${upcomingCount} due` : "Clear"}
            </span>
          </Link>
          <Link
            href="/dashboard/activity"
            className="flex flex-col items-center gap-1 px-2 py-3 text-center active:bg-muted/50"
          >
            <Activity className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] font-medium text-foreground leading-tight">
              Recent transactions
            </span>
            <span className="text-[10px] font-mono font-semibold text-muted-foreground">
              View all
            </span>
          </Link>
        </div>
      </Card>

      {/* Insight lives on the analysis page — dashboard stays within one viewport */}

      {/* Quick-entry modals */}
      <QuickEntryModal
        type="income"
        open={incomeOpen}
        onOpenChange={setIncomeOpen}
        onSaved={load}
      />
      <QuickEntryModal
        type="expense"
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSaved={load}
      />
    </div>
  );
}
