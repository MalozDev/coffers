"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterGroup } from "@/components/ui/filter-group";
import {
  DateFilterGroup,
  boundsFor,
  humanDayLabel,
  type DateFilterValue,
} from "@/components/ui/date-filter";
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

function formatK(n: number) {
  return `K${n.toLocaleString()}`;
}

function formatLoggedTime(value: string) {
  return new Date(value).toLocaleTimeString("en-ZM", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  // Default date filter: Today — you first see today's activity
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const bounds = useMemo(
    () => boundsFor(dateFilter, fromDate, toDate),
    [dateFilter, fromDate, toDate]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (bounds.from) params.set("startDate", bounds.from);
    if (bounds.to) params.set("endDate", bounds.to);
    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setTransactions(res.data.transactions);
          setTotalPages(res.data.pagination.pages);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, typeFilter, bounds.from, bounds.to]);

  const filtered = useMemo(
    () =>
      transactions
        .filter((tx) =>
          search
            ? tx.description.toLowerCase().includes(search.toLowerCase()) ||
              tx.categoryId?.name?.toLowerCase().includes(search.toLowerCase())
            : true
        )
        // Most recent → oldest by timestamp, never by insertion order
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime() ||
            new Date(b.createdAt || b.date).getTime() -
              new Date(a.createdAt || a.date).getTime()
        ),
    [transactions, search]
  );

  // Group by calendar day, newest day first
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    filtered.forEach((tx) => {
      const key = new Date(tx.date).toLocaleDateString("en-CA");
      map.set(key, [...(map.get(key) || []), tx]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

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

      {/* Filters — separated groups */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <FilterGroup
          label="TYPE"
          options={[
            { value: "all", label: "All" },
            { value: "income", label: "Income" },
            { value: "expense", label: "Expenses" },
          ]}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value as "all" | "income" | "expense");
            setPage(1);
          }}
        />
        <DateFilterGroup
          value={dateFilter}
          onChange={(value) => {
            setDateFilter(value);
            setPage(1);
          }}
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">No transactions found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, txs]) => (
            <div key={day}>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                {humanDayLabel(`${day}T12:00:00`)}
              </h3>
              <Card>
                <div className="divide-y divide-border">
                  {txs.map((tx) => (
                    <div
                      key={tx._id}
                      className="flex items-center gap-3 px-4 py-3 active:bg-muted/50"
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          tx.type === "income"
                            ? "bg-green-50"
                            : tx.type === "expense"
                            ? "bg-red-50"
                            : "bg-blue-50"
                        }`}
                      >
                        {tx.type === "income" ? (
                          <ArrowDownCircle className="h-4 w-4 text-green-600" />
                        ) : tx.type === "expense" ? (
                          <ArrowUpCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.categoryId?.name || tx.type} · {tx.accountId?.name} ·{" "}
                          {formatLoggedTime(tx.createdAt || tx.date)}
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
              </Card>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground py-1">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
