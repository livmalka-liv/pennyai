"use client";

import { Play, Settings, Lock, TrendingUp, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { VaultStrategy } from "@/types";

const TIER_LABELS: Record<string, string> = {
  tester: "Tester",
  pro: "Pro",
  elite: "Elite",
};

const TIER_VARIANTS: Record<string, "muted" | "brand" | "violet"> = {
  tester: "muted",
  pro: "brand",
  elite: "violet",
};

interface StrategyCardProps {
  strategy: VaultStrategy;
  userTier: string;
  onLoadIntoChat: (strategy: VaultStrategy) => void;
}

export default function StrategyCard({ strategy, userTier, onLoadIntoChat }: StrategyCardProps) {
  const tierOrder = ["free", "tester", "pro", "elite"];
  const hasAccess = tierOrder.indexOf(userTier) >= tierOrder.indexOf(strategy.tier);

  return (
    <div
      className={cn(
        "glass-card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[#263147]",
        !hasAccess && "opacity-80"
      )}
    >
      {/* Thumbnail */}
      <div className={cn("relative h-36 bg-gradient-to-br", strategy.thumbnailGradient)}>
        <div className="absolute inset-0 bg-black/20" />

        {/* ROI Badge */}
        <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 backdrop-blur-sm">
          <span className="text-xs font-bold text-white">
            5-Yr Verified: +{strategy.verifiedRoi}%
          </span>
        </div>

        {/* Tier lock */}
        {!hasAccess && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Lock className="h-8 w-8 text-white/80" />
              <span className="text-xs font-semibold text-white/80">
                {TIER_LABELS[strategy.tier]} Required
              </span>
            </div>
          </div>
        )}

        {/* Play button overlay */}
        {hasAccess && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30">
              <Play className="h-5 w-5 text-white" fill="white" />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F8FAFC] leading-tight">{strategy.name}</h3>
          <Badge variant={TIER_VARIANTS[strategy.tier]}>{TIER_LABELS[strategy.tier]}</Badge>
        </div>

        <p className="text-xs text-[#94A3B8] leading-relaxed line-clamp-2">
          {strategy.tagline}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#0B0E14]/60 p-2">
          {[
            { icon: TrendingUp, label: "ROI", value: `+${strategy.verifiedRoi}%`, color: "text-[#10B981]" },
            { icon: Target, label: "Win Rate", value: `${strategy.winRate}%`, color: "text-[#6366F1]" },
            { icon: Users, label: "Trades", value: `${strategy.totalTrades}`, color: "text-[#94A3B8]" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5">
              <stat.icon className={cn("h-3 w-3", stat.color)} />
              <span className={cn("text-xs font-bold tabular-nums", stat.color)}>{stat.value}</span>
              <span className="text-[9px] text-[#64748B]">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={!hasAccess}
          >
            <Play className="h-3.5 w-3.5" />
            Watch Guide
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={!hasAccess}
            onClick={() => hasAccess && onLoadIntoChat(strategy)}
          >
            <Settings className="h-3.5 w-3.5" />
            Load in Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
