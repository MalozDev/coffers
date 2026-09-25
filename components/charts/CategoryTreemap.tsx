"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { colorFor, percentLabel } from "./palette";

interface CategoryTreemapProps {
  data: Array<{ name: string; total: number; color?: string; percentage?: number }>;
}

const formatK = (value: number) => `K${value.toLocaleString()}`;

/** Trim a name so it fits the tile it is drawn in. */
function fit(text: string, maxChars: number) {
  if (maxChars < 2) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/** Keeps white text readable on light category colours. */
const legible = {
  paintOrder: "stroke",
  stroke: "rgba(0,0,0,0.35)",
  strokeWidth: 2,
  strokeLinejoin: "round",
} as const;

/**
 * recharts spreads the data item straight onto the node props (payload is
 * only set on tooltip entries), so the category fields — name, total,
 * percentage, colour — are read from the props themselves.
 */
function Tile(props: any) {
  const { x, y, width, height } = props;
  const item = props.payload?.payload || props.payload || props;
  const name = item.name || "Other";
  const total = Number(item.total ?? item.size ?? 0);
  const rootTotal = Number(props.root?.value ?? 0);
  const percentage = Number.isFinite(Number(item.percentage))
    ? Number(item.percentage)
    : rootTotal > 0
    ? (total / rootTotal) * 100
    : 0;
  const fill = item.fill || item.color || colorFor(0);

  // Smallest tiles stay coloured (the tooltip carries the detail).
  if (width < 24 || height < 18) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />;
  }

  // Bigger tiles get the bigger type — a dominant category reads first and
  // a small one still shows whatever fits: name, share, then amount.
  const nameSize = width >= 130 ? 12 : width >= 80 ? 11 : width >= 50 ? 10 : 8;
  const pctSize = width >= 80 ? 11 : 10;
  const totalSize = 10;
  const maxChars = Math.max(3, Math.floor((width - 12) / (nameSize * 0.58)));

  const lines: { text: string; size: number; bold?: boolean }[] = [];
  const roomFor = (size: number) =>
    height >= lines.reduce((sum, line) => sum + line.size + 8, 0) + size + 8;

  if (width >= 34 && roomFor(nameSize)) {
    lines.push({ text: fit(name, maxChars), size: nameSize, bold: true });
  }
  if (width >= 30 && roomFor(pctSize)) {
    lines.push({ text: percentLabel(percentage), size: pctSize, bold: true });
  }
  if (width >= 92 && roomFor(totalSize)) {
    lines.push({ text: formatK(total), size: totalSize });
  }

  const blockHeight = lines.reduce((sum, line) => sum + line.size + 8, 0) - (lines.length ? 8 : 0);
  let cursor = y + Math.max(4, (height - blockHeight) / 2);
  const placed = lines.map((line) => {
    cursor += line.size;
    const baseline = cursor;
    cursor += 8;
    return { ...line, baseline };
  });

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
        rx={4}
      />
      {placed.map((line, index) => (
        <text
          key={index}
          x={x + 7}
          y={line.baseline}
          fill="#fff"
          fontSize={line.size}
          fontWeight={line.bold ? 600 : 400}
          {...legible}
        >
          {line.text}
        </text>
      ))}
    </g>
  );
}

export default function CategoryTreemap({ data }: CategoryTreemapProps) {
  if (!data.length) return null;
  const chartData = data.map((item, index) => ({
    ...item,
    size: item.total,
    fill: colorFor(index, item.color),
  }));

  return (
    <ResponsiveContainer width="100%" height={270} minWidth={0}>
      <Treemap
        data={chartData}
        dataKey="size"
        nameKey="name"
        stroke="#fff"
        aspectRatio={1.5}
        content={<Tile />}
      >
        <Tooltip
          formatter={(value: any, _name: any, item: any) => {
            const entry = item?.payload?.payload || item?.payload || item || {};
            const share = percentLabel(Number(entry.percentage ?? 0));
            return [`${formatK(Number(value))} · ${share}`, entry.name || "Category"];
          }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
