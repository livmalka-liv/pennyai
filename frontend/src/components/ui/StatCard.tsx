import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export default function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  const trendColor =
    trend === "up"
      ? "text-[#10B981]"
      : trend === "down"
      ? "text-[#EF4444]"
      : "text-[#F8FAFC]";

  return (
    <div
      className={cn(
        "glass-card flex flex-col gap-1 p-4",
        className
      )}
    >
      <span className="text-xs font-medium uppercase tracking-widest text-[#64748B]">
        {label}
      </span>
      <span className={cn("text-2xl font-bold tabular-nums", trendColor)}>
        {value}
      </span>
      {sub && (
        <span className="text-xs text-[#94A3B8]">{sub}</span>
      )}
    </div>
  );
}
