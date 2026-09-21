"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Wallet, Tag, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface Account { _id: string; name: string; type: string; currentBalance: number }

function formatK(n: number) { return `K${n.toLocaleString()}`; }

export default function SettingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((res) => {
      if (res.success) setAccounts(res.data.accounts);
      setLoading(false);
    });
  }, []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAccountName, type: newAccountType }),
    });
    setNewAccountName("");
    setShowAddAccount(false);
    const res = await fetch("/api/accounts").then((r) => r.json());
    if (res.success) setAccounts(res.data.accounts);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account</p>
      </div>

      {/* Profile */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">Profile</h3>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input defaultValue="Coffers User" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input defaultValue="user@coffers.app" className="h-10" disabled />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input defaultValue="+260 97 000 0000" className="h-10" />
            </div>
            <Button size="sm" className="w-full">Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Accounts */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="text-sm font-semibold">Accounts</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowAddAccount(!showAddAccount)}>
              {showAddAccount ? "Cancel" : "+ Add"}
            </Button>
          </div>

          {showAddAccount && (
            <form onSubmit={addAccount} className="flex gap-2 mb-3">
              <Input placeholder="Account name" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="h-10 flex-1" />
              <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)} className="h-10 rounded-xl border border-input bg-white px-3 text-sm">
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="savings">Savings</option>
                <option value="custom">Custom</option>
              </select>
              <Button type="submit" size="sm" className="h-10">Add</Button>
            </form>
          )}

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div key={a._id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.type.replace("_", " ")}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold">{formatK(a.currentBalance)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-accent/10">
              <Tag className="h-5 w-5 text-accent" />
            </div>
            <h3 className="text-sm font-semibold">Preferences</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Currency</span>
              <span className="text-sm font-semibold">ZMK (Kwacha)</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm">Notifications</span>
              <Button size="sm" variant="secondary" className="h-8">Manage</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardContent className="p-4">
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
