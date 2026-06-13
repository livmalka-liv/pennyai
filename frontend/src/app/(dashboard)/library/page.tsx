"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Target,
  ShieldAlert,
  Clock,
  BarChart2,
  BookOpen,
  ChevronRight,
  Star,
  Flame,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LIBRARY,
  ASSET_LABELS,
  DIFFICULTY_COLOR,
  type AssetClass,
  type LibraryStrategy,
} from "@/lib/strategyLibrary";

const FILTERS: { value: "all" | AssetClass; label: string; icon: React.ReactNode }[] = [
  { value: "all",      label: "הכל",           icon: <Layers className="h-3.5 w-3.5" /> },
  { value: "penny",    label: "מניות פני",      icon: <Flame className="h-3.5 w-3.5" /> },
  { value: "largecap", label: "מניות גדולות",   icon: <BarChart2 className="h-3.5 w-3.5" /> },
  { value: "forex",    label: "פורקס",           icon: <TrendingUp className="h-3.5 w-3.5" /> },
];

export default function LibraryPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<"all" | AssetClass>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = activeFilter === "all"
    ? LIBRARY
    : LIBRARY.filter(s => s.assetClass === activeFilter);

  function loadToSandbox(strategy: LibraryStrategy) {
    const config = {
      ...strategy.config,
      lookbackYears: 5,
    };
    localStorage.setItem("preload_strategy", JSON.stringify(config));
    router.push("/sandbox");
  }

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#F8FAFC]">ספריית אסטרטגיות</h1>
            <p className="text-sm text-[#64748B]">
              {LIBRARY.length} אסטרטגיות מקצועיות מתועדות — מניות פני, מניות גדולות, ופורקס
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeFilter === f.value
                ? "bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/20"
                : "border border-[#1E293B] bg-[#0B0E14] text-[#64748B] hover:border-[#263147] hover:text-[#94A3B8]"
            )}
          >
            {f.icon}
            {f.label}
            <span className={cn(
              "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              activeFilter === f.value ? "bg-white/20" : "bg-[#131A26]"
            )}>
              {f.value === "all" ? LIBRARY.length : LIBRARY.filter(s => s.assetClass === f.value).length}
            </span>
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(strategy => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            expanded={expandedId === strategy.id}
            onToggle={() => setExpandedId(expandedId === strategy.id ? null : strategy.id)}
            onLoad={() => loadToSandbox(strategy)}
          />
        ))}
      </div>
    </div>
  );
}

function StrategyCard({
  strategy,
  expanded,
  onToggle,
  onLoad,
}: {
  strategy: LibraryStrategy;
  expanded: boolean;
  onToggle: () => void;
  onLoad: () => void;
}) {
  const assetLabel = ASSET_LABELS[strategy.assetClass];
  const diffColor = DIFFICULTY_COLOR[strategy.difficulty];

  const rrRatio = strategy.typicalTp / strategy.typicalSl;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        expanded
          ? "border-[#6366F1]/40 bg-[#0D1117] shadow-lg shadow-[#6366F1]/10"
          : "border-[#1E293B] bg-[#0B0E14] hover:border-[#263147]"
      )}
    >
      {/* Card header */}
      <button className="w-full p-4 text-right" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {/* Asset class badge */}
              <span className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                assetLabel.bg, assetLabel.border, assetLabel.color
              )}>
                {assetLabel.label}
              </span>
              {/* Difficulty */}
              <span className={cn("text-[10px] font-semibold", diffColor)}>
                {strategy.difficulty}
              </span>
              {/* Timeframe */}
              <span className="rounded bg-[#131A26] px-1.5 py-0.5 text-[10px] text-[#64748B]">
                {strategy.timeframe}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-[#F8FAFC] leading-snug">
              {strategy.name}
            </h3>
          </div>
          <ChevronRight className={cn(
            "h-4 w-4 shrink-0 text-[#64748B] transition-transform mt-1",
            expanded && "rotate-90"
          )} />
        </div>

        {/* Key stats row */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat
            label="Win Rate"
            value={`${strategy.winRate}%`}
            color={strategy.winRate >= 55 ? "text-[#10B981]" : strategy.winRate >= 50 ? "text-[#F59E0B]" : "text-[#EF4444]"}
          />
          <Stat
            label="Profit F."
            value={strategy.profitFactor.toFixed(2)}
            color={strategy.profitFactor >= 1.8 ? "text-[#10B981]" : "text-[#F59E0B]"}
          />
          <Stat
            label="R:R"
            value={`1:${rrRatio.toFixed(1)}`}
            color="text-[#6366F1]"
          />
          <Stat
            label="החזקה"
            value={strategy.avgHoldMinutes >= 60
              ? `${(strategy.avgHoldMinutes / 60).toFixed(1)}ש'`
              : `${strategy.avgHoldMinutes}ד'`}
            color="text-[#94A3B8]"
          />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#1E293B] px-4 pb-4 space-y-4">
          {/* Description */}
          <div className="pt-3">
            <p className="text-xs text-[#94A3B8] leading-relaxed">{strategy.description}</p>
          </div>

          {/* Logic */}
          <div className="rounded-lg border border-[#1E293B] bg-[#131A26] p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#6366F1]">הרציונל</p>
            <p className="text-xs text-[#94A3B8] leading-relaxed">{strategy.logic}</p>
          </div>

          {/* TP / SL */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg border border-[#10B981]/20 bg-[#10B981]/5 p-2.5 text-center">
              <Target className="mx-auto mb-1 h-3.5 w-3.5 text-[#10B981]" />
              <p className="text-[10px] text-[#64748B]">Take Profit</p>
              <p className="text-sm font-bold text-[#10B981]">+{strategy.typicalTp}%</p>
            </div>
            <div className="flex-1 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 p-2.5 text-center">
              <ShieldAlert className="mx-auto mb-1 h-3.5 w-3.5 text-[#EF4444]" />
              <p className="text-[10px] text-[#64748B]">Stop Loss</p>
              <p className="text-sm font-bold text-[#EF4444]">-{strategy.typicalSl}%</p>
            </div>
            <div className="flex-1 rounded-lg border border-[#6366F1]/20 bg-[#6366F1]/5 p-2.5 text-center">
              <Clock className="mx-auto mb-1 h-3.5 w-3.5 text-[#6366F1]" />
              <p className="text-[10px] text-[#64748B]">זמן ממוצע</p>
              <p className="text-sm font-bold text-[#6366F1]">
                {strategy.avgHoldMinutes >= 60
                  ? `${(strategy.avgHoldMinutes / 60).toFixed(1)}ש'`
                  : `${strategy.avgHoldMinutes}ד'`}
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {strategy.tags.map(tag => (
              <span key={tag} className="rounded bg-[#131A26] px-2 py-0.5 text-[10px] text-[#64748B]">
                #{tag}
              </span>
            ))}
          </div>

          {/* Sources */}
          <div className="flex items-start gap-1.5">
            <Star className="mt-0.5 h-3 w-3 shrink-0 text-[#F59E0B]" />
            <p className="text-[10px] text-[#64748B] leading-relaxed">{strategy.sources}</p>
          </div>

          {/* Load button */}
          <button
            onClick={onLoad}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
          >
            טען לסנדבוקס
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-[#131A26] px-1.5 py-1.5 text-center">
      <p className="text-[9px] text-[#64748B] mb-0.5">{label}</p>
      <p className={cn("text-xs font-bold", color)}>{value}</p>
    </div>
  );
}
