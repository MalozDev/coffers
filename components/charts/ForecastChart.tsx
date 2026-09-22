"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

interface ForecastData {
  category: string;
  current: number;
  projected: number;
  budget?: number;
}

interface ForecastChartProps {
  data: ForecastData[];
}

const formatK = (n: number) => `K${n.toLocaleString()}`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-border p-3 text-xs">
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.fill || entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono font-medium">{formatK(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function ForecastChart({ data }: ForecastChartProps) {
  if (!data || data.length === 0) return null;

  // Transform data for grouped bars
  const chartData = data.map((d) => ({
    name: d.category,
    "Spent so far": d.current,
    "Projected total": d.projected,
  }));

  return (
    <div className="w-full min-w-0">
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <BarChart data={chartData} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="Spent so far"
          fill="#3066be"
          radius={[4, 4, 0, 0]}
          barSize={16}
        />
        <Bar
          dataKey="Projected total"
          fill="#3066be"
          fillOpacity={0.35}
          radius={[4, 4, 0, 0]}
          barSize={16}
          stroke="#3066be"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
