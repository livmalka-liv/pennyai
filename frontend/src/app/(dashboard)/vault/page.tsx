"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, TrendingUp, Shield, Zap } from "lucide-react";
import StrategyCard from "@/components/vault/StrategyCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { VAULT_STRATEGIES } from "@/lib/mockData";
import type { VaultStrategy } from "@/types";

const USER_TIER = "pro"; // mock — replace with real auth

const TIER_FILTERS = ["All", "Tester", "Pro", "Elite"] as const;

export default function VaultPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const filtered = VAULT_STRATEGIES.filter((s) => {
    if (activeFilter === "All") return true;
    return s.tier === activeFilter.toLowerCase();
  });

  function handleLoadIntoChat(strategy: VaultStrategy) {
    // Store in sessionStorage so sandbox can pick it up
    sessionStorage.setItem("preloadStrategy", JSON.stringify(strategy.config));
    router.push("/sandbox");
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      {/* Hero Banner */}
      <div className="relative overflow-hidden border-b border-[#1E293B]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#6366F1]/10 via-transparent to-[#10B981]/10" />
        <div className="relative mx-auto max-w-screen-xl px-6 py-12">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="h-5 w-5 text-[#6366F1]" />
            <Badge variant="brand">Premium Vault</Badge>
          </div>
          <h1 className="text-3xl font-bold text-[#F8FAFC] max-w-2xl leading-tight">
            Learn the{" "}
            <span className="gradient-text">5-Year Verified</span>{" "}
            Penny Stock Frameworks
          </h1>
          <p className="mt-3 text-[#94A3B8] max-w-xl text-sm leading-relaxed">
            Every strategy in the vault has been backtested against 5 years of real intraday data
            with realistic slippage. No cherry-picking. No curve-fitting.
          </p>

          {/* Stats row */}
          <div className="mt-8 flex flex-wrap gap-6">
            {[
              { icon: TrendingUp, label: "Avg Verified ROI", value: "154%" },
              { icon: Shield, label: "Strategies Verified", value: "6 Live" },
              { icon: Zap, label: "Total Backtest Trades", value: "1,845" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <stat.icon className="h-4 w-4 text-[#6366F1]" />
                <div>
                  <p className="text-base font-bold text-[#F8FAFC]">{stat.value}</p>
                  <p className="text-xs text-[#64748B]">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter + Grid */}
      <div className="mx-auto max-w-screen-xl px-6 py-8">
        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {TIER_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={
                  activeFilter === filter
                    ? "rounded-lg bg-[#6366F1] px-3 py-1.5 text-sm font-semibold text-white"
                    : "rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-1.5 text-sm font-medium text-[#94A3B8] hover:border-[#263147] hover:text-[#F8FAFC] transition-all"
                }
              >
                {filter}
              </button>
            ))}
          </div>
          <p className="text-sm text-[#64748B]">
            {filtered.length} {filtered.length === 1 ? "strategy" : "strategies"}
          </p>
        </div>

        {/* Strategy grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              userTier={USER_TIER}
              onLoadIntoChat={handleLoadIntoChat}
            />
          ))}
        </div>

        {/* Upgrade CTA */}
        <div className="mt-12 rounded-2xl border border-[#6366F1]/20 bg-gradient-to-br from-[#6366F1]/10 to-[#8B5CF6]/5 p-8 text-center">
          <Crown className="mx-auto h-10 w-10 text-[#6366F1] mb-3" />
          <h2 className="text-xl font-bold text-[#F8FAFC]">Unlock the Full Vault + Academy</h2>
          <p className="mt-2 text-sm text-[#94A3B8] max-w-md mx-auto">
            Get access to all 6 verified strategies, HD video breakdowns with Level 2 tape reading,
            and unlimited AI backtesting.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="primary" size="lg">
              Upgrade to Elite — $149/mo
            </Button>
            <Button variant="secondary" size="lg">
              View All Plans
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
