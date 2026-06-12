"use client";

import { useState } from "react";
import ChatPanel from "@/components/sandbox/ChatPanel";
import AnalyticsPanel from "@/components/sandbox/AnalyticsPanel";
import type { BacktestResult, StrategyConfig, LookbackYears } from "@/types";

export default function SandboxPage() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [preloadStrategy, setPreloadStrategy] = useState<StrategyConfig | undefined>();
  const [startingCapital, setStartingCapital] = useState(10000);
  const [lookbackYears, setLookbackYears] = useState<LookbackYears>(5);
  const [riskPerTrade, setRiskPerTrade] = useState(500);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <div className="w-[440px] shrink-0 border-r border-[#1E293B] flex flex-col">
        <ChatPanel
          onBacktestResult={setResult}
          onRunning={setIsRunning}
          preloadStrategy={preloadStrategy}
          startingCapital={startingCapital}
          lookbackYears={lookbackYears}
          riskPerTrade={riskPerTrade}
          onCapitalChange={setStartingCapital}
          onLookbackChange={setLookbackYears}
          onRiskPerTradeChange={setRiskPerTrade}
        />
      </div>
      <div className="flex-1 overflow-hidden bg-[#0B0E14]">
        <AnalyticsPanel
          result={result}
          isRunning={isRunning}
          startingCapital={startingCapital}
          riskPerTrade={riskPerTrade}
        />
      </div>
    </div>
  );
}
