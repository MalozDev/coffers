"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, WalletCards, ReceiptText, Target, PiggyBank, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
}

const statItems = [
  { key: "users", label: "Users", icon: Users },
  { key: "accounts", label: "Accounts", icon: WalletCards },
  { key: "transactions", label: "Transactions", icon: ReceiptText },
  { key: "budgets", label: "Budgets", icon: PiggyBank },
  { key: "goals", label: "Savings", icon: Target },
] as const;

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (response) => {
        const result = await response.json();
        if (response.status === 403) {
          router.replace("/dashboard");
          return;
        }
        if (!result.success) throw new Error(result.error || "Could not load admin portal");
        setData(result.data);
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="space-y-4"><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  if (error || !data) return <Card><CardContent className="py-10 text-center text-sm text-destructive">{error || "Unable to load admin portal."}</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h1 className="text-xl font-bold">Admin portal</h1></div><p className="mt-1 text-sm text-muted-foreground">Platform users and activity overview.</p></div>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>Back to Coffers</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statItems.map(({ key, label, icon: Icon }) => <Card key={key}><CardContent className="p-4"><Icon className="h-4 w-4 text-muted-foreground" /><p className="mt-3 text-2xl font-bold">{data.stats[key]}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>)}
      </div>

      <Card><div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Platform users</h2><p className="mt-1 text-xs text-muted-foreground">Admin access is limited to designated accounts.</p></div><div className="divide-y divide-border">{data.users.map((user) => <div key={user._id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p><p className="text-xs text-muted-foreground">Joined {new Date(user.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-2"><Badge variant={user.isAdmin ? "default" : "outline"}>{user.isAdmin ? "Admin" : "User"}</Badge><span className="text-xs text-muted-foreground">{user.phoneNumber || "No phone"}</span></div></div>)}</div></Card>
    </div>
  );
}
