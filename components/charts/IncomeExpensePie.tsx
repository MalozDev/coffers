"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const RADIAN = Math.PI / 180;

interface IncomeExpensePieProps {
  income: number;
  expenses: number;
}

const formatK = (value: number) => `K${value.toLocaleString()}`;
const percentLabel = (value: number) =>
  `${value > 0 && value < 1 ? value.toFixed(1) : Math.round(value)}%`;

export default function IncomeExpensePie({ income, expenses }: IncomeExpensePieProps) {
  const data = [
    { name: "Income", value: income, color: "#22c55e" },
    { name: "Expenses", value: expenses, color: "#ef4444" },
  ].filter((item) => item.value > 0);

  if (data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={82}
            paddingAngle={3}
            label={({ cx, cy, midAngle = 0, innerRadius = 0, outerRadius = 0, percent }) => {
              if (!percent || percent < 0.05) return null;
              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
              const angle = -midAngle * RADIAN;
              return (
                <text
                  x={cx + radius * Math.cos(angle)}
                  y={cy + radius * Math.sin(angle)}
                  fill="#fff"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={600}
                >
                  {percentLabel(percent * 100)}
                </text>
              );
            }}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, _name: any, item: any) => {
              const entry = item?.payload || {};
              const share = total > 0 ? (Number(entry.value || 0) / total) * 100 : 0;
              return [`${formatK(Number(value))} · ${percentLabel(share)}`, entry.name];
            }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 text-center">
        {data.map((entry) => {
          const share = total > 0 ? (entry.value / total) * 100 : 0;
          return (
            <div
              key={entry.name}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}{" "}
              <span className="font-mono font-semibold text-foreground">
                {formatK(entry.value)} · {percentLabel(share)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
