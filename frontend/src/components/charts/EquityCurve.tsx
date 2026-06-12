"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface EquityCurveProps {
  data: { date: string; equity: number }[];
  startingCapital?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-xs">
      <p className="text-[#94A3B8]">{label}</p>
      <p className="font-bold text-[#10B981]">${payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export default function EquityCurve({ data, startingCapital = 10000 }: EquityCurveProps) {
  const scale = startingCapital / 10000;
  const scaled = data.map(d => ({ ...d, equity: Math.round(d.equity * scale) }));
  const visible = scaled.filter((_, i) => i % Math.ceil(scaled.length / 80) === 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={visible} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" tickFormatter={v => v.slice(0, 7)} />
        <YAxis tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`} width={48} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="equity" stroke="#10B981" strokeWidth={2} fill="url(#equityGradient)" dot={false}
          activeDot={{ r: 4, fill: "#10B981", stroke: "#0B0E14", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
