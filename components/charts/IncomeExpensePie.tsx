"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface IncomeExpensePieProps {
  income: number;
  expenses: number;
}

const formatK = (value: number) => `K${value.toLocaleString()}`;

export default function IncomeExpensePie({ income, expenses }: IncomeExpensePieProps) {
  const data = [
    { name: "Income", value: income, color: "#22c55e" },
    { name: "Expenses", value: expenses, color: "#ef4444" },
  ].filter((item) => item.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3}>
            {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(value) => formatK(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 text-center">
        {data.map((entry) => <div key={entry.name} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name} <span className="font-mono font-semibold text-foreground">{formatK(entry.value)}</span></div>)}
      </div>
    </div>
  );
}
