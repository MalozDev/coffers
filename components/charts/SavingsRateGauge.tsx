"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface SavingsRateGaugeProps {
  rate: number; // 0-100
  label?: string;
}

export default function SavingsRateGauge({
  rate,
  label = "Savings Rate",
}: SavingsRateGaugeProps) {
  const clampedRate = Math.min(Math.max(rate, 0), 100);
  const remaining = 100 - clampedRate;

  const getColor = (r: number) => {
    if (r >= 20) return "#22c55e"; // green
    if (r >= 10) return "#eab308"; // yellow
    if (r >= 0) return "#f97316"; // orange
    return "#ef4444"; // red
  };

  const color = getColor(clampedRate);

  const gaugeData = [
    { value: clampedRate },
    { value: remaining },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={55}
              outerRadius={75}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="#f3f4f6" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <p className="text-2xl font-mono font-bold" style={{ color }}>
            {Math.round(clampedRate)}%
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
