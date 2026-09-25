"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SpendingByCategory,
  IncomeVsExpenses,
  SpendingTrend,
  SavingsRateGauge,
  ForecastChart,
  WeeklyBreakdown,
  IncomeExpensePie,
  ExpenseHistogram,
  CategoryTreemap,
} from "@/components/charts";
import {
  TrendingUp, TrendingDown, Minus, BarChart3, Brain,
  Target, DollarSign, Bell, Send, Sparkles, AlertTriangle,
  Clock, Zap, Calendar, PiggyBank,
} from "lucide-react";

function formatK(n: number) { return `K${Math.abs(n).toLocaleString()}`; }

function ToneIcon({ tone }: { tone?: string }) {
  if (tone === "positive") return <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />;
  if (tone === "negative") return <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />;
  if (tone === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
}

/** Renders engine insights — tone-aware when present, plain text otherwise. */
function InsightList({ items }: { items: Array<{ id?: string; tone?: string; text: string }> }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={item.id || index} className="flex items-start gap-2 text-sm text-muted-foreground">
          <ToneIcon tone={item.tone} />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Request failed");
  }
  return result.data;
}

// ─── Main Analysis Page ────────────────────────────────────
export default function AnalysisPage() {
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Analysis</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Financial intelligence & insights</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="hide-scrollbar flex w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 h-11">
          <TabsTrigger value="overview" className="h-9 min-w-[92px] flex-none text-xs">Overview</TabsTrigger>
          <TabsTrigger value="patterns" className="h-9 min-w-[92px] flex-none text-xs">Patterns</TabsTrigger>
          <TabsTrigger value="forecast" className="h-9 min-w-[92px] flex-none text-xs">Forecast</TabsTrigger>
          <TabsTrigger value="simulate" className="h-9 min-w-[92px] flex-none text-xs">Simulate</TabsTrigger>
          <TabsTrigger value="ask" className="h-9 min-w-[92px] flex-none text-xs">Ask</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-w-0"><OverviewTab /></TabsContent>
        <TabsContent value="patterns" className="min-w-0"><PatternsTab /></TabsContent>
        <TabsContent value="forecast" className="min-w-0"><ForecastTab /></TabsContent>
        <TabsContent value="simulate" className="min-w-0"><SimulateTab /></TabsContent>
        <TabsContent value="ask" className="min-w-0"><AskTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<"today" | "yesterday" | "week" | "month">("today");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  // A reference date only matters for windows that can be anchored
  const showReference = period === "week" || period === "month";

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setLoading(true);
      setError(false);
      fetchJson(`/api/analysis?period=${period}&date=${date}`)
        .then((result) => { if (active) setData(result); })
        .catch(() => { if (active) { setData(null); setError(true); } })
        .finally(() => { if (active) setLoading(false); });
    };
    refresh();
    const handleRefresh = () => refresh();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("coffers:data-updated", handleRefresh);
    document.addEventListener("visibilitychange", handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("coffers:data-updated", handleRefresh);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, [period, date]);

  if (loading) return <div className="space-y-3 pt-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>;
  if (!data) return <Card><CardContent><p className="text-center text-muted-foreground py-8">{error ? "Unable to load analysis. Please try again." : "No data"}</p></CardContent></Card>;

  return (
    <div className="space-y-4 pt-4">
      {/* Period & Date */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-4 gap-2 sm:flex-1">
          {(["today", "yesterday", "week", "month"] as const).map((p) => (
            <Button key={p} variant={period === p ? "default" : "secondary"} size="sm"
              onClick={() => setPeriod(p)} className="h-9 text-xs capitalize">{p}</Button>
          ))}
        </div>
        {showReference && (
          <div className="flex flex-col gap-1.5 sm:w-44">
            <label htmlFor="analysis-date" className="text-xs text-muted-foreground">
              {period === "week" ? "Week of" : "Month of"}
            </label>
            <Input id="analysis-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
        )}
      </div>

      {/* Resolved window + comparison, straight from the period engine */}
      {data.period && (
        <p className="-mt-1 text-xs text-muted-foreground">
          {data.period.label} · compared with {data.period.prevLabel}
        </p>
      )}

      {/* Income / Expenses / Savings Summary — compact 3-up on all screens */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wide">Income</p>
              <p className="text-sm sm:text-lg font-mono font-bold text-green-600 mt-0.5 truncate">+{formatK(data.current.income)}</p>
              {data.changes?.income !== undefined && (
                <span className={`block text-[10px] font-semibold ${data.changes.income > 0 ? "text-green-500" : "text-red-500"}`}>
                  {data.changes.income > 0 ? "+" : ""}{Math.round(data.changes.income)}%
                </span>
              )}
            </div>
            <div className="min-w-0 border-x border-border/60">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wide">Expenses</p>
              <p className="text-sm sm:text-lg font-mono font-bold text-red-500 mt-0.5 truncate">−{formatK(data.current.expenses)}</p>
              {data.changes?.expenses !== undefined && (
                <span className={`block text-[10px] font-semibold ${data.changes.expenses > 0 ? "text-red-500" : "text-green-500"}`}>
                  {data.changes.expenses > 0 ? "+" : ""}{Math.round(data.changes.expenses)}%
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wide">Saved</p>
              <p className={`text-sm sm:text-lg font-mono font-bold mt-0.5 truncate ${data.current.savings >= 0 ? "text-green-600" : "text-red-500"}`}>
                {data.current.savings >= 0 ? "+" : "−"}{formatK(data.current.savings)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All-time income vs expenses (since account creation) + savings */}
      {data.allTime && (
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wide mb-2">
              All-time · since you joined
            </p>
            <div className="grid grid-cols-2 divide-x divide-border text-center">
              <div className="min-w-0">
                <p className="text-sm sm:text-lg font-mono font-bold text-green-600 truncate">
                  +{formatK(data.allTime.income)}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                  Income
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-lg font-mono font-bold text-red-500 truncate">
                  −{formatK(data.allTime.expenses)}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                  Expenses
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/savings"
              className="mt-3 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 active:opacity-70"
            >
              <span className="text-xs font-medium text-green-700 flex items-center gap-1.5">
                <PiggyBank className="h-3.5 w-3.5" /> Saved in savings accounts
              </span>
              <span className="text-sm font-mono font-bold text-green-700">
                {formatK(data.savingsTotal || 0)}
              </span>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Charts — stacked on mobile, side by side on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Savings Rate Gauge */}
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-1">Savings Rate</h3>
            <div className="flex justify-center py-2">
              <SavingsRateGauge rate={data.current.savingsRate} label="Income saved" />
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown Chart */}
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Spending by Category</h3>
            {data.categoryBreakdown?.length > 0 ? (
              <SpendingByCategory data={data.categoryBreakdown} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No spending data for this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Income vs expenses</h3>
          <p className="mb-2 text-xs text-muted-foreground">Where money went this period.</p>
          <IncomeExpensePie income={data.current.income} expenses={data.current.expenses} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="mb-1 text-sm font-semibold">Transaction size distribution</h3>
            <p className="mb-2 text-xs text-muted-foreground">Expenses per amount range.</p>
            {data.transactionAmounts?.length ? <ExpenseHistogram amounts={data.transactionAmounts} /> : <p className="py-12 text-center text-sm text-muted-foreground">No expense data for this period.</p>}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="mb-1 text-sm font-semibold">Spending concentration</h3>
            <p className="mb-2 text-xs text-muted-foreground">Bigger tiles mean more spending.</p>
            {data.categoryBreakdown?.length ? <CategoryTreemap data={data.categoryBreakdown} /> : <p className="py-12 text-center text-sm text-muted-foreground">No category data for this period.</p>}
          </CardContent>
        </Card>
      </div>

      {data.categoryBreakdown?.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">What stands out</h3>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div><span className="text-muted-foreground">Largest category: </span><strong>{data.categoryBreakdown[0].name}</strong><span className="font-mono"> ({formatK(data.categoryBreakdown[0].total)})</span></div>
            <div><span className="text-muted-foreground">Share of spending: </span><strong>{Math.round(data.categoryBreakdown[0].percentage)}%</strong></div>
            <div><span className="text-muted-foreground">Average expense: </span><strong className="font-mono">{formatK(data.current.avgTransaction || 0)}</strong></div>
          </div>
        </CardContent>
        </Card>
      )}

      {/* Insights */}
      {data.insights?.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Insights</h3></div>
            <InsightList items={
              data.insightsDetailed?.length > 0
                ? data.insightsDetailed
                : (data.insights || []).map((text: string) => ({ text }))
            } />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Patterns Tab ──────────────────────────────────────────
function PatternsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchJson("/api/intelligence/patterns")
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 pt-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>;
  if (!data) return <Card><CardContent><p className="text-center text-muted-foreground py-8">{error ? "Unable to load patterns. Please try again." : "Not enough data to detect patterns yet."}</p></CardContent></Card>;

  return (
    <div className="space-y-4 pt-4">
      {/* Engine summary — what the pattern layer noticed */}
      {data.insightsDetailed?.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">What the engine sees</h3></div>
            <InsightList items={data.insightsDetailed} />
          </CardContent>
        </Card>
      )}

      {/* Payday Pattern */}
      {data.paydayPattern?.detected && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Zap className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold">Payday Pattern</h3></div>
            <p className="text-sm text-muted-foreground">{data.paydayPattern.insight}</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">First 5 days</p>
                <p className="text-lg font-mono font-bold">{formatK(data.paydayPattern.avgFirst5Days)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Rest of month</p>
                <p className="text-lg font-mono font-bold">{formatK(data.paydayPattern.avgRestOfMonth)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending Trend Chart */}
      {data.spendingTrend?.monthlyData?.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {data.spendingTrend.direction === "increasing" ? <TrendingUp className="h-4 w-4 text-red-500" /> :
               data.spendingTrend.direction === "decreasing" ? <TrendingDown className="h-4 w-4 text-green-500" /> :
               <Minus className="h-4 w-4 text-muted-foreground" />}
              <h3 className="text-sm font-semibold">Spending Trend</h3>
              <Badge variant="outline" className="text-[10px] capitalize">{data.spendingTrend.direction}</Badge>
            </div>
            <SpendingTrend
              data={data.spendingTrend.monthlyData.map((m: any) => ({
                month: m.month,
                spending: m.total,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Recurring Expenses */}
      {data.recurringExpenses?.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Recurring Expenses</h3></div>
            <div className="space-y-2">
              {data.recurringExpenses.slice(0, 8).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.description}</p>
                    <p className="text-xs text-muted-foreground">{r.categoryName} · {r.frequency} · {r.count}x</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold">{formatK(r.avgAmount)}</p>
                    {r.isUpcoming && <Badge className="text-[10px] bg-orange-100 text-orange-700 mt-1">Expected soon</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Changes */}
      {data.categoryChanges?.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Category Changes (vs last month)</h3>
            <div className="space-y-2">
              {data.categoryChanges.map((c: any) => (
                <div key={c.categoryId} className="flex items-center justify-between">
                  <span className="text-sm">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{formatK(c.current)}</span>
                    <span className={`text-xs font-semibold ${c.change > 0 ? "text-red-500" : "text-green-500"}`}>
                      {c.change > 0 ? "+" : ""}{c.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Forgotten Expenses */}
      {data.forgottenExpenses?.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-orange-500" /><h3 className="text-sm font-semibold">Possibly Forgotten</h3></div>
            <div className="space-y-2">
              {data.forgottenExpenses.map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{f.description} <span className="text-muted-foreground">({f.categoryName})</span></span>
                  <span className="font-mono text-orange-600">~{formatK(f.avgAmount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Indicators */}
      {data.healthIndicators && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Financial Health</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(data.healthIndicators).map(([key, value]) => (
                <div key={key} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="text-sm font-semibold mt-0.5">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Forecast Tab ──────────────────────────────────────────
function ForecastTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchJson("/api/intelligence/forecast")
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3 pt-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}</div>;
  if (!data) return <Card><CardContent><p className="text-center text-muted-foreground py-8">{error ? "Unable to load forecast. Please try again." : "No forecast data"}</p></CardContent></Card>;

  return (
    <div className="space-y-4 pt-4">
      {/* Day counter + daily averages */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="min-w-0 bg-gradient-to-br from-background to-accent/10">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-mono font-bold">{data.current.daysRemaining}</p>
            <p className="text-sm text-muted-foreground">days left this month</p>
            <p className="text-xs text-muted-foreground mt-1">Day {data.current.dayOfMonth} of {data.current.daysInMonth}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Daily Averages</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Spending/day</p>
                <p className="text-lg font-mono font-semibold">{formatK(data.current.dailySpendRate)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Income/day</p>
                <p className="text-lg font-mono font-semibold">{formatK(data.current.dailyIncomeRate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly comparison + projected savings rate */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Monthly Comparison</h3>
            <IncomeVsExpenses
              data={[
                {
                  month: "Current",
                  income: data.current.income,
                  expenses: data.current.expenses,
                },
                {
                  month: "Projected",
                  income: data.projected.income,
                  expenses: data.projected.expenses,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Projected Savings Rate</h3>
            <div className="flex justify-center py-2">
              <SavingsRateGauge rate={data.projected.savingsRate} label="If this pace continues" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Projections Chart */}
      {data.categoryProjections?.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Category Projections</h3>
            <ForecastChart
              data={data.categoryProjections.slice(0, 6).map((c: any) => ({
                category: c.name,
                current: c.currentSpend,
                projected: c.projectedMonthEnd,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Weekly Breakdown */}
      {data.weeklyBreakdown?.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Weekly Breakdown</h3>
            <WeeklyBreakdown data={data.weeklyBreakdown} />
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {data.insights?.length > 0 && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Forecast Insights</h3></div>
            <InsightList items={
              data.insightsDetailed?.length > 0
                ? data.insightsDetailed
                : (data.insights || []).map((text: string) => ({ text }))
            } />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Simulate Tab ──────────────────────────────────────────
function SimulateTab() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    setLoading(true);
    try {
      const data = await fetchJson("/api/intelligence/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), description }),
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><DollarSign className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">What happens if I buy this?</h3></div>
          <form onSubmit={handleSimulate} className="space-y-3">
            <Input type="number" step="0.01" min="1" placeholder="Amount (K)" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg font-mono" />
            <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" />
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? "Simulating..." : "Simulate Purchase"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Affordability Badge */}
          <Card className="min-w-0">
            <CardContent className="p-4 text-center">
              <Badge variant={result.affordabilityScore.level === "low" ? "default" : "destructive"} className="text-sm mb-2">
                {result.affordabilityScore.label}
              </Badge>
              <p className="text-2xl font-mono font-bold">−{formatK(result.purchase.amount)}</p>
              {result.purchase.description && <p className="text-sm text-muted-foreground mt-1">{result.purchase.description}</p>}
            </CardContent>
          </Card>

          {/* Before vs After Chart */}
          <Card className="min-w-0">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Before vs After</h3>
              <IncomeVsExpenses
                data={[
                  { month: "Before", income: result.before.availableBalance, expenses: 0 },
                  { month: "After", income: Math.max(0, result.after.availableBalance), expenses: Math.abs(Math.min(0, result.after.availableBalance)) },
                ]}
              />
              <div className="grid grid-cols-2 gap-4 mt-3 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Before</p>
                  <p className="text-lg font-mono font-bold">{formatK(result.before.availableBalance)}</p>
                  <p className="text-xs text-muted-foreground">{result.before.savingsRate}% saved</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">After</p>
                  <p className={`text-lg font-mono font-bold ${result.after.availableBalance >= 0 ? "" : "text-red-500"}`}>{formatK(result.after.availableBalance)}</p>
                  <p className="text-xs text-muted-foreground">{result.after.savingsRate}% saved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Impact Details */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-2">Impact</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Balance reduction</span><span className="font-mono">−{formatK(result.impact.balanceReduction)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Savings rate change</span><span className={`font-mono ${result.impact.savingsRateChange < 0 ? "text-red-500" : "text-green-500"}`}>{result.impact.savingsRateChange}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Days of expenses covered after</span><span className="font-mono">{result.impact.monthsOfExpensesCovered}d</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Goal Impacts */}
          {result.goalImpacts?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">Goal Impact</h3>
                <div className="space-y-2">
                  {result.goalImpacts.map((g: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{g.name}</span>
                        {g.delayMonths > 0 && <Badge variant="destructive" className="text-[10px]">+{g.delayMonths}mo delay</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{g.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warnings from the simulation engine */}
          {result.warnings?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-semibold text-amber-700">Warnings</h3></div>
                <ul className="space-y-1.5">
                  {result.warnings.map((warning: string, i: number) => (
                    <li key={i} className="text-sm text-amber-700">• {warning}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Recommendation */}
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">{result.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Ask Coffers Tab ───────────────────────────────────────
function AskTab() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{
    role: "user" | "coffers";
    text: string;
    suggestions?: string[];
  }>>([
    {
      role: "coffers",
      text: "Ask me anything — spending, balances, bills, or goals.",
      suggestions: ["What did I spend today?", "What's my balance?", "What's coming up?"],
    },
  ]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;
    const q = question.trim();
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const history = messages
        .filter((message) => message.role === "user")
        .map((message) => message.text);
      const data = await fetchJson("/api/intelligence/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      setMessages((prev) => [
        ...prev,
        { role: "coffers", text: data.answer, suggestions: data.suggestions || [] },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "coffers",
          text: error instanceof Error ? error.message : "Couldn't answer that just now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = () => {
    setMessages([
      {
        role: "coffers",
        text: "Ask me anything — spending, balances, bills, or goals.",
        suggestions: ["What did I spend today?", "What's my balance?", "What's coming up?"],
      },
    ]);
    setQuestion("");
  };

  return (
    <div className="space-y-4 pt-4">
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Ask Coffers</h3></div>
            <button type="button" onClick={resetConversation} className="text-xs text-muted-foreground hover:text-foreground" disabled={loading}>
              New conversation
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Answers use your Coffers data.</p>
          <form onSubmit={handleAsk} className="flex gap-2">
            <Input placeholder="Ask about your money..." value={question} onChange={(e) => setQuestion(e.target.value)} className="flex-1 h-11" disabled={loading} />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={loading || !question.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {messages.map((msg, i) => (
          <Card key={i} className={msg.role === "coffers" ? "border-accent/20" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                {msg.role === "coffers" && <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />}
                <p className={`text-sm leading-relaxed whitespace-pre-line flex-1 ${msg.role === "user" ? "font-medium" : "text-muted-foreground"}`}>
                  {msg.text}
                </p>
              </div>
              {msg.role === "coffers" && msg.suggestions && msg.suggestions.length > 0 && !loading && (
                <div className="flex flex-wrap gap-2 mt-3 pl-6">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setQuestion(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white border border-border hover:bg-muted transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {loading && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
