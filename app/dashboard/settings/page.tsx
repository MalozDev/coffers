"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Wallet, Tag, LogOut, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearApiCache } from "@/lib/client/api-cache";

interface Account { _id: string; name: string; type: string; currentBalance: number }

function formatK(n: number) { return `K${n.toLocaleString()}`; }

export default function SettingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");
  const [newAccountOpening, setNewAccountOpening] = useState("");
  const [addAccountSaving, setAddAccountSaving] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((res) => {
      if (res.success) setAccounts(res.data.accounts);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setName(res.data.user.name || "");
          setEmail(res.data.user.email || "");
          setPhoneNumber(res.data.user.phoneNumber || "");
          setProfileImage(res.data.user.profileImage || null);
        }
        setProfileLoading(false);
      })
      .catch(() => {
        setProfileError("Unable to load your profile");
        setProfileLoading(false);
      });
  }, []);

  const handleProfileImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 512;
        const scale = Math.min(size / image.width, size / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        setProfileImage(canvas.toDataURL("image/jpeg", 0.82));
        setProfileError(null);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phoneNumber, profileImage }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setProfileError(result.error || "Unable to save profile");
        return;
      }
      setName(result.data.user.name);
      setEmail(result.data.user.email);
      setPhoneNumber(result.data.user.phoneNumber);
      setProfileImage(result.data.user.profileImage || null);
      setProfileMessage("Profile updated");
      window.dispatchEvent(new CustomEvent("coffers:profile-updated", { detail: result.data.user }));
      router.refresh();
    } catch {
      setProfileError("Network error. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    setAddAccountSaving(true);
    setAddAccountError(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAccountName,
          type: newAccountType,
          openingBalance: parseFloat(newAccountOpening) || 0,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setAddAccountError(result.error || "Could not add this account");
        return;
      }
      setNewAccountName("");
      setNewAccountOpening("");
      setShowAddAccount(false);
      await refreshAccounts();
      // Make the new account immediately available across the app
      window.dispatchEvent(new Event("coffers:data-updated"));
    } catch {
      setAddAccountError("Network error. Please try again.");
    } finally {
      setAddAccountSaving(false);
    }
  };

  const refreshAccounts = async () => {
    const response = await fetch("/api/accounts");
    const result = await response.json();
    if (result.success) setAccounts(result.data.accounts);
  };

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!transferAmount || !transferFrom || !transferTo || transferFrom === transferTo) return;
    setTransferSaving(true);
    setTransferError(null);
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "transfer",
        amount: parseFloat(transferAmount),
        accountId: transferFrom,
        toAccountId: transferTo,
        description: transferDescription.trim() || "Account transfer",
        date: new Date().toISOString(),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setTransferError(result.error || "Could not move money");
    } else {
      setTransferAmount("");
      setTransferDescription("");
      setShowTransfer(false);
      await refreshAccounts();
    }
    setTransferSaving(false);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearApiCache();
    window.location.replace("/login");
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
          {profileError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{profileError}</p>}
          {profileMessage && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{profileMessage}</p>}
          {profileLoading ? <div className="h-48 rounded-xl bg-muted animate-pulse" /> : <form onSubmit={saveProfile} className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                {profileImage ? <img src={profileImage} alt={name} className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase() || <User className="h-6 w-6" />}
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                  Upload picture
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleProfileImage(e.target.files?.[0])} />
                </label>
                {profileImage && <Button type="button" variant="ghost" size="sm" onClick={() => setProfileImage(null)}>Remove</Button>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="h-10" required />
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Changes"}</Button>
          </form>}
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewAccountName("");
                setNewAccountOpening("");
                setAddAccountError(null);
                setShowAddAccount(true);
              }}
            >
              + Add
            </Button>
          </div>

          {/* Add account modal */}
          <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Add account</DialogTitle>
                <DialogDescription>
                  Use it anywhere you pick an account.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Account name</Label>
                  <Input
                    placeholder="e.g. Main Account"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="h-11"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account type</Label>
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value)}
                    className="w-full h-11 rounded-xl border border-input bg-white px-3 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="savings">Savings</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Opening balance (K)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newAccountOpening}
                    onChange={(e) => setNewAccountOpening(e.target.value)}
                    className="h-11 font-mono"
                  />
                </div>
                {addAccountError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    {addAccountError}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setShowAddAccount(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 h-11" disabled={addAccountSaving}>
                    {addAccountSaving ? "Adding..." : "Add"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Button type="button" variant="outline" className="w-full mb-3 h-10" onClick={() => { setShowTransfer(!showTransfer); setTransferError(null); }}>
            <ArrowRightLeft className="h-4 w-4 mr-2" /> Move money between accounts
          </Button>

          {showTransfer && (
            <form onSubmit={handleTransfer} className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-3 mb-3">
              <div className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-accent" /><p className="text-sm font-semibold">Transfer funds</p></div>
              {transferError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{transferError}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">From</Label><select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} className="w-full h-10 rounded-xl border border-input bg-white px-2 text-xs" required><option value="">Source account</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name} · {formatK(account.currentBalance)}</option>)}</select></div>
                <div className="space-y-1"><Label className="text-xs">To</Label><select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="w-full h-10 rounded-xl border border-input bg-white px-2 text-xs" required><option value="">Destination</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select></div>
              </div>
              <Input type="number" min="0.01" step="0.01" placeholder="Amount (K)" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="h-10 font-mono" required />
              <Input placeholder="Description (optional)" value={transferDescription} onChange={(e) => setTransferDescription(e.target.value)} className="h-10" />
              <Button type="submit" className="w-full h-10" disabled={transferSaving}>{transferSaving ? "Moving..." : "Move money"}</Button>
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
