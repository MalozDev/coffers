"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpRight, Database, Gauge, Search, Server, ShieldCheck, UserPlus, Users, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminUser {
  _id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  isAdmin: boolean;
  createdAt: string;
}
interface AdminData {
  users: AdminUser[];
  stats: { users: number; accounts: number; transactions: number; budgets: number; goals: number };
  growth: { newToday: number; newThisWeek: number; newThisMonth: number; newPreviousMonth: number; monthGrowth: number; activeUsers: number; setupRate: number; activityToday: number; activityThisWeek: number };
  signupTrend: { label: string; count: number }[];
  system: { database: string; api: string };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (response) => {
        const result = await response.json();
        if (response.status === 403) { router.replace("/dashboard"); return; }
        if (!result.success) throw new Error(result.error || "Could not load admin console");
        setData(result.data);
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [router]);

  const filteredUsers = useMemo(() => data?.users.filter((user) => `${user.name} ${user.email} ${user.phoneNumber || ""}`.toLowerCase().includes(query.toLowerCase())) || [], [data, query]);

  if (loading) return <div className="space-y-5"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error || !data) return <Card><CardContent className="py-10 text-center text-sm text-destructive">{error || "Unable to load admin console."}</CardContent></Card>;

  const maxSignup = Math.max(...data.signupTrend.map((item) => item.count), 1);
  const kpis = [
    { label: "Total users", value: data.stats.users, note: `${data.growth.newThisMonth} joined this month`, icon: Users, tone: "text-cyan-600" },
    { label: "Active this week", value: data.growth.activeUsers, note: "Users with recent activity", icon: Activity, tone: "text-emerald-600" },
    { label: "New today", value: data.growth.newToday, note: `${data.growth.newThisWeek} in the last 7 days`, icon: UserPlus, tone: "text-amber-600" },
    { label: "Setup completion", value: `${data.growth.setupRate}%`, note: "Users with an account", icon: Gauge, tone: "text-violet-600" },
  ];

  return <div className="min-h-full -m-4 bg-[#f5f7f8] p-3 text-slate-900 sm:-m-5 sm:p-5 lg:-m-8 lg:p-8">
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <header className="rounded-2xl bg-[#102c3b] px-4 py-5 text-white shadow-sm sm:px-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2 text-cyan-300"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.16em] sm:text-[11px] sm:tracking-[0.2em]">Operations console</span></div><h1 className="mt-2 text-2xl font-bold tracking-tight">Coffers platform</h1><p className="mt-1 max-w-md text-sm leading-relaxed text-slate-300">Understand who is here, what they do, and how the product is growing.</p></div><div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end"><Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300" />Live</Badge><Button variant="outline" size="sm" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => router.push("/dashboard")}>Exit console</Button></div></div></header>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">{kpis.map(({ label, value, note, icon: Icon, tone }) => <Card key={label} className="border-slate-200 bg-white shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><span className={`rounded-lg bg-slate-50 p-2 ${tone}`}><Icon className="h-4 w-4" /></span><ArrowUpRight className="h-4 w-4 text-slate-300" /></div><p className="mt-4 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs font-semibold text-slate-700">{label}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></CardContent></Card>)}</div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold">User growth</h2><p className="mt-1 text-xs text-slate-500">New accounts over the last six months.</p></div><div className="shrink-0 text-right"><p className={`text-sm font-bold ${data.growth.monthGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>{data.growth.monthGrowth >= 0 ? "+" : ""}{data.growth.monthGrowth}%</p><p className="text-[11px] text-slate-400">vs previous month</p></div></div><div className="mt-8 flex h-44 items-end gap-1.5 border-b border-slate-100 pb-0 min-[420px]:gap-3">{data.signupTrend.map((item) => <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-slate-500">{item.count || ""}</span><div className="w-full max-w-12 rounded-t-md bg-cyan-500 transition-all" style={{ height: `${Math.max((item.count / maxSignup) * 78, item.count ? 8 : 2)}%` }} /><span className="pb-2 text-[10px] text-slate-400">{item.label.slice(5)}</span></div>)}</div></CardContent></Card>

        <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">Product pulse</h2><p className="mt-1 text-xs text-slate-500">Signals from platform activity.</p></div><Zap className="h-4 w-4 text-amber-500" /></div><div className="mt-5 space-y-4"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs text-slate-500">Activity today</span><strong className="text-sm">{data.growth.activityToday}</strong></div><div className="flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs text-slate-500">Activity this week</span><strong className="text-sm">{data.growth.activityThisWeek}</strong></div><div className="flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs text-slate-500">Previous month signups</span><strong className="text-sm">{data.growth.newPreviousMonth}</strong></div><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Total records</span><strong className="text-sm">{data.stats.accounts + data.stats.transactions + data.stats.goals}</strong></div></div></CardContent></Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div><h2 className="text-sm font-bold">User directory</h2><p className="mt-1 text-xs text-slate-500">Search accounts and inspect onboarding activity.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." className="h-10 border-slate-200 pl-9 text-xs" /></div></div><div className="divide-y divide-slate-100">{filteredUsers.map((user) => <div key={user._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dff4f5] text-xs font-bold text-cyan-800">{user.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div></div><div className="flex items-center justify-between gap-4 pl-12 text-xs text-slate-500 sm:justify-end sm:pl-0"><span>Joined {formatDate(user.createdAt)}</span>{user.isAdmin && <Badge className="bg-[#102c3b] text-white">Admin</Badge>}</div></div>)}{filteredUsers.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">No users match your search.</p>}</div></Card>

      <div className="grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><Database className="h-4 w-4 text-emerald-600" /><div><p className="text-xs font-semibold">Database</p><p className="text-[11px] text-emerald-600">{data.system.database}</p></div></div><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><Server className="h-4 w-4 text-emerald-600" /><div><p className="text-xs font-semibold">API services</p><p className="text-[11px] text-emerald-600">{data.system.api}</p></div></div><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><Users className="h-4 w-4 text-cyan-600" /><div><p className="text-xs font-semibold">User records</p><p className="text-[11px] text-slate-500">{data.stats.users} accounts tracked</p></div></div></div>
    </div>
  </div>;
}
