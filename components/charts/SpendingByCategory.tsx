"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { colorFor, percentLabel } from "./palette";

interface CategoryData {
  name: string;
  total: number;
  color?: string;
  icon?: string;
  percentage: number;
}

interface SpendingByCategoryProps {
  data: CategoryData[];
}

const formatK = (n: number) => `K${n.toLocaleString()}`;

const RADIAN = Math.PI / 180;

/**
 * Every slice shows its share: big slices carry a larger label inside,
 * small slices get a leader line and a label outside so they are never
 * hidden by the dominant categories.
 */
function renderCustomLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (!percent) return null;

  const share = percent * 100;

  // Large enough for an inside label — size follows the share.
  if (share >= 5) {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={share >= 20 ? 13 : share >= 10 ? 12 : 10}
        fontWeight={600}
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.3)", strokeWidth: 2 }}
      >
        {percentLabel(share)}
      </text>
    );
  }

  // Small slice — step outside so its percentage stays visible.
  const lineStart = outerRadius + 2;
  const lineEnd = outerRadius + 12;
  const x1 = cx + lineStart * Math.cos(-midAngle * RADIAN);
  const y1 = cy + lineStart * Math.sin(-midAngle * RADIAN);
  const x2 = cx + lineEnd * Math.cos(-midAngle * RADIAN);
  const y2 = cy + lineEnd * Math.sin(-midAngle * RADIAN);
  const onRight = x2 >= cx;
  const x3 = x2 + (onRight ? 6 : -6);

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth={1} />
      <text
        x={x3}
        y={y2}
        fill="currentColor"
        textAnchor={onRight ? "start" : "end"}
        dominantBaseline="central"
        fontSize={10}
        fontWeight={600}
      >
        {percentLabel(share)}
      </text>
    </g>
  );
}

export default function SpendingByCategory({ data }: SpendingByCategoryProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d, index) => ({
    ...d,
    value: d.total,
    fill: colorFor(index, d.color),
  }));

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={260} minWidth={0}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={renderCustomLabel}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, _name: any, item: any) => {
              const entry = item?.payload || {};
              return [
                `${formatK(Number(value))} · ${percentLabel(Number(entry.percentage ?? 0))}`,
                entry.name || "Category",
              ];
            }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend — every category with its share */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
        {data.map((d, index) => (
          <div key={d.name} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: colorFor(index, d.color) }}
            />
            <span className="text-xs text-muted-foreground truncate flex-1">
              {d.icon} {d.name}
            </span>
            <span className="text-xs font-mono font-medium shrink-0">
              {formatK(d.total)} · {percentLabel(d.percentage)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
