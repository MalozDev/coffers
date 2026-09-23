"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Search } from "lucide-react";

interface Transaction {
  _id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  description: string;
  date: string;
  createdAt?: string;
  categoryId?: { name: string; color: string; icon?: string };
  accountId?: { name: string };
}

function formatK(n: number) { return `K${n.toLocaleString()}`; }

function formatLoggedTime(value: string) {
  return new Date(value).toLocaleTimeString("en-ZM", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDate(transactions: Transaction[]) {
  const groups: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    const key = new Date(tx.date).toLocaleDateString("en-ZM", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });
  return groups;
}

export default function ActivityPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTransactions = (p: number, type: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "30" });
    if (type !== "all") params.set("type", type);
    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setTransactions(res.data.transactions);
          setTotalPages(res.data.pagination.pages);
        }
        setLoading(false);
      });
  };

  useEffect(() => { fetchTransactions(page, filter); }, [page, filter]);

  const filtered = transactions.filter((tx) =>
    search
      ? tx.description.toLowerCase().includes(search.toLowerCase()) ||
        tx.categoryId?.name?.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const grouped = groupByDate(filtered);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Activity</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your transaction history</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            size="sm"
            onClick={() => { setFilter(f); setPage(1); }}
            className="h-9 text-xs capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><CardContent><p className="text-center text-muted-foreground py-8">No transactions found</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">{date}</h3>
              <Card>
                <div className="divide-y divide-border">
                  {txs.map((tx) => (
                    <div key={tx._id} className="flex items-center gap-3 px-4 py-3 active:bg-muted/50">
                      <div className={`p-2 rounded-lg shrink-0 ${tx.type === "income" ? "bg-green-50" : tx.type === "expense" ? "bg-red-50" : "bg-blue-50"}`}>
                        {tx.type === "income" ? <ArrowDownCircle className="h-4 w-4 text-green-600" /> :
                         tx.type === "expense" ? <ArrowUpCircle className="h-4 w-4 text-red-500" /> :
                         <ArrowLeftRight className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.categoryId?.name || tx.type} · {tx.accountId?.name} · {formatLoggedTime(tx.createdAt || tx.date)}</p>
                      </div>
                      <span className={`text-sm font-mono font-semibold shrink-0 ${tx.type === "income" ? "text-green-600" : "text-red-500"}`}>
                        {tx.type === "income" ? "+" : "−"} {formatK(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground py-1">Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
