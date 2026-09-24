"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

interface CategoryTreemapProps {
  data: Array<{ name: string; total: number; color?: string }>;
}

const formatK = (value: number) => `K${value.toLocaleString()}`;

function Tile({ x, y, width, height, payload }: any) {
  if (width < 58 || height < 42) return <g />;
  const item = payload?.payload || payload || {};
  const name = item.name || "Other";
  const total = Number(item.total ?? item.size ?? 0);
  const color = item.color;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color || "#3066be"} stroke="#fff" strokeWidth={2} rx={4} />
      <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>
      {height > 56 && <text x={x + 8} y={y + 35} fill="#fff" fontSize={10}>{formatK(total)}</text>}
    </g>
  );
}

export default function CategoryTreemap({ data }: CategoryTreemapProps) {
  if (!data.length) return null;
  const chartData = data.map((item) => ({ ...item, size: item.total }));

  return (
    <ResponsiveContainer width="100%" height={270} minWidth={0}>
      <Treemap data={chartData} dataKey="size" nameKey="name" stroke="#fff" aspectRatio={1.5} content={<Tile />}>
        <Tooltip formatter={(value) => formatK(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
      </Treemap>
    </ResponsiveContainer>
  );
}