"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, X, Tag } from "lucide-react";

interface Category { _id: string; name: string; type: string; color: string; icon?: string; isDefault: boolean }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"expense" | "income">("expense");

  const [name, setName] = useState("");
  const [color, setColor] = useState("#3066be");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = () => {
    fetch(`/api/categories?type=${tab}`).then((r) => r.json()).then((res) => {
      if (res.success) setCategories(res.data.categories);
      setLoading(false);
    });
  };

  useEffect(() => { fetchCategories(); }, [tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSaving(true);
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: tab, color, icon: icon || undefined }),
    });
    setName(""); setIcon(""); setShowForm(false);
    fetchCategories();
    setSaving(false);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organize your transactions</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === "expense" ? "default" : "secondary"} size="sm" onClick={() => setTab("expense")} className="flex-1 h-9">Expenses</Button>
        <Button variant={tab === "income" ? "default" : "secondary"} size="sm" onClick={() => setTab("income")} className="flex-1 h-9">Income</Button>
      </div>

      {/* Add category modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
            <DialogDescription>Create a category for your {tab} transactions.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Category Name</Label>
              <Input placeholder="e.g. Groceries" value={name} onChange={(e) => setName(e.target.value)} className="h-11" required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded-lg cursor-pointer" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-10 font-mono text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Icon (emoji)</Label>
                <Input placeholder="🍔" value={icon} onChange={(e) => setIcon(e.target.value)} className="h-10 text-lg" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11" disabled={saving}>{saving ? "Adding..." : "Add Category"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid grid-cols-2 gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <Card key={c._id} size="sm">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: c.color + "20" }}>
                  {c.icon || "📦"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.isDefault && <p className="text-[10px] text-muted-foreground">Default</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
