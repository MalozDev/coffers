"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ExpenseHistogramProps {
  amounts: number[];
}

const formatK = (value: number) => `K${value.toLocaleString()}`;

export default function ExpenseHistogram({ amounts }: ExpenseHistogramProps) {
  if (!amounts.length) return null;

  const maximum = Math.max(...amounts);
  const step = maximum <= 100 ? 20 : maximum <= 500 ? 100 : maximum <= 2000 ? 500 : 1000;
  const bucketCount = Math.max(1, Math.ceil(maximum / step));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = index * step;
    const end = start + step;
    return {
      range: `${formatK(start)}–${formatK(end)}`,
      start,
      end,
      count: amounts.filter((amount) => amount >= start && (index === bucketCount - 1 ? amount <= end : amount < end)).length,
    };
  }).filter((bucket) => bucket.count > 0);

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <BarChart data={buckets} barCategoryGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 9, fill: "#9ca3af" }} angle={-30} textAnchor="end" height={55} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} label={{ value: "Number of expenses", angle: -90, position: "insideLeft", fontSize: 10, fill: "#6b7280" }} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} expense(s)`, "Transactions"]} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Bar dataKey="count" fill="#3066be" radius={[4, 4, 0, 0]} name="Transactions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}