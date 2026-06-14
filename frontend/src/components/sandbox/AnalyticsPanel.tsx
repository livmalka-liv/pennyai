"use client";

import { useState } from "react";
import {
  TrendingUp, Target, BarChart2, ArrowDownRight, Clock, Award,
  ChevronDown, ChevronUp, Calendar, DollarSign, Zap, Activity,
  Trophy, AlertTriangle, Filter, FileText, CheckCircle, XCircle, MinusCircle
} from "lucide-react";
import dynamic from "next/dynamic";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import TradeModal from "@/components/sandbox/TradeModal";
import { cn, formatPercent, formatNumber, formatCurrency } from "@/lib/utils";
import type { BacktestResult, Trade } from "@/types";

const EquityCurve = dynamic(() => import("@/components/charts/EquityCurve"), { ssr: false });

interface AnalyticsPanelProps {
  result: BacktestResult | null;
  isRunning: boolean;
  startingCapital: number;
  riskPerTrade: number;
}

type TradeFilter = "all" | "wins" | "losses" | "take_profit" | "stop_loss";

export default function AnalyticsPanel({ result, isRunning, startingCapital, riskPerTrade }: AnalyticsPanelProps) {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "trades" | "durability" | "dca" | "opinion">("overview");
  const [monthlyDca, setMonthlyDca] = useState(500);

  if (isRunning) return <RunningState />;
  if (!result) return <EmptyState />;

  const { metrics, equityCurve, trades, durabilityByYear, strategy } = result;
  const finalEquity = startingCapital * (1 + metrics.totalRoi / 100);
  const profit = finalEquity - startingCapital;

  // Risk-per-trade adjusted P&L: each trade used riskPerTrade dollars as position
  const riskAdjustedPnl = trades.reduce((sum, t) => sum + riskPerTrade * (t.returnPct / 100), 0);
  const riskAdjustedFinal = startingCapital + riskAdjustedPnl;
  const riskAdjustedRoi = (riskAdjustedPnl / startingCapital) * 100;

  // Recalculate max drawdown using the user's risk-per-trade (not backend's fixed $9,500)
  const riskAdjustedMaxDd = (() => {
    let eq = startingCapital, peak = startingCapital, maxDd = 0;
    for (const t of trades) {
      eq = Math.max(0, eq + riskPerTrade * (t.returnPct / 100));
      if (eq > peak) peak = eq;
      if (peak > 0) maxDd = Math.max(maxDd, (peak - eq) / peak * 100);
    }
    return -maxDd;
  })();

  const recommendation: { label: string; color: string; bg: string; border: string } =
    metrics.totalRoi > 15 && metrics.winRate > 55 && metrics.profitFactor >= 1.5 && metrics.maxDrawdown > -25
      ? { label: "מומלץ מאוד ✅", color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30" }
      : metrics.totalRoi > 0 && metrics.profitFactor >= 1.2
      ? { label: "מומלץ בזהירות 🟡", color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30" }
      : { label: "לא מומלץ ❌", color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30" };

  const filteredTrades = trades.filter(t => {
    if (tradeFilter === "wins") return t.returnPct > 0;
    if (tradeFilter === "losses") return t.returnPct <= 0;
    if (tradeFilter === "take_profit") return t.exitReason === "take_profit";
    if (tradeFilter === "stop_loss") return t.exitReason === "stop_loss";
    return true;
  });

  const displayedTrades = showAllTrades ? filteredTrades : filteredTrades.slice(0, 25);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Tab bar */}
      <div className="flex border-b border-[#1E293B] px-4 pt-3 gap-1 shrink-0">
        {([
          { key: "overview", label: "סקירה כללית", icon: BarChart2 },
          { key: "trades", label: `כל העסקאות (${trades.length})`, icon: Target },
          { key: "durability", label: "עמידות לפי שנה", icon: Calendar },
          { key: "dca", label: "סימולטור DCA", icon: DollarSign },
          { key: "opinion", label: "חוות דעת", icon: FileText },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-all border-b-2",
              activeTab === tab.key
                ? "border-[#6366F1] text-[#6366F1] bg-[#6366F1]/5"
                : "border-transparent text-[#64748B] hover:text-[#94A3B8]"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <>
            {/* Risk-adjusted result + recommendation */}
            <div className={cn("glass-card p-4 border", recommendation.border, recommendation.bg)}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs text-[#64748B] uppercase tracking-widest mb-1">תוצאה עם ${riskPerTrade.toLocaleString()} לעסקה — {strategy.lookbackYears} שנים</p>
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-bold", riskAdjustedPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                      {formatCurrency(riskAdjustedFinal)}
                    </span>
                    <span className="text-sm text-[#64748B]">מתוך {formatCurrency(startingCapital)}</span>
                  </div>
                  <p className={cn("text-sm font-semibold mt-0.5", riskAdjustedPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                    {riskAdjustedPnl >= 0 ? "+" : ""}{formatCurrency(riskAdjustedPnl)} רווח ({formatPercent(riskAdjustedRoi)})
                  </p>
                </div>
                <div className={cn("rounded-lg border px-3 py-2 text-center shrink-0", recommendation.border, recommendation.bg)}>
                  <p className={cn("text-sm font-bold", recommendation.color)}>{recommendation.label}</p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">המלצה</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1E293B]/50 text-center">
                <div>
                  <p className="text-xs font-bold text-[#F8FAFC] tabular-nums">
                    {formatPercent(Math.pow(Math.max(1 + riskAdjustedRoi / 100, 0.001), 1 / strategy.lookbackYears) * 100 - 100)}
                  </p>
                  <p className="text-[10px] text-[#64748B]">CAGR</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#F8FAFC] tabular-nums">{metrics.winRate}%</p>
                  <p className="text-[10px] text-[#64748B]">אחוז הצלחה</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#F8FAFC] tabular-nums">{metrics.profitFactor}</p>
                  <p className="text-[10px] text-[#64748B]">Profit Factor</p>
                </div>
              </div>
            </div>

            {/* Main KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="תשואה כוללת" value={formatPercent(riskAdjustedRoi)} sub={`${strategy.lookbackYears} שנות בדיקה`} trend={riskAdjustedRoi >= 0 ? "up" : "down"} />
              <StatCard label="אחוז הצלחה" value={`${metrics.winRate}%`} sub={`${metrics.winningTrades}W / ${metrics.losingTrades}L`} trend={metrics.winRate >= 50 ? "up" : "down"} />
              <StatCard label="Profit Factor" value={String(metrics.profitFactor)} sub="רווח גולמי / הפסד גולמי" trend={metrics.profitFactor >= 1.5 ? "up" : "neutral"} />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: ArrowDownRight, label: "Max Drawdown", value: formatPercent(riskAdjustedMaxDd), color: "text-[#EF4444]" },
                { icon: Award, label: "Sharpe Ratio", value: String(metrics.sharpeRatio), color: "text-[#6366F1]" },
                { icon: TrendingUp, label: "עסקה ממוצעת", value: formatPercent(metrics.avgReturnPerTrade), color: "text-[#10B981]" },
                { icon: Clock, label: "המתנה ממוצעת", value: `${metrics.avgHoldingMinutes}min`, color: "text-[#94A3B8]" },
              ].map(item => (
                <div key={item.label} className="glass-card flex flex-col gap-1 p-3">
                  <div className="flex items-center gap-1.5">
                    <item.icon className={cn("h-3.5 w-3.5", item.color)} />
                    <span className="text-[10px] uppercase tracking-widest text-[#64748B]">{item.label}</span>
                  </div>
                  <span className={cn("text-lg font-bold tabular-nums", item.color)}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Frequency metrics */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6366F1] mb-3 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> תדירות עסקאות
              </p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-[#F8FAFC] tabular-nums">{metrics.avgTradesPerMonth}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">עסקאות ממוצע לחודש</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#F8FAFC] tabular-nums">{metrics.avgOpportunitiesPerDay}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">הזדמנויות ממוצע ליום</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#F8FAFC] tabular-nums">{metrics.totalTrades}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">סה"כ עסקאות</p>
                </div>
              </div>
            </div>

            {/* Win/Loss breakdown */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-3 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> פירוט ביצועים
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "עסקת שיא", value: formatPercent(metrics.bestTrade), icon: Trophy, color: "text-[#10B981]" },
                  { label: "עסקה גרועה", value: formatPercent(metrics.worstTrade), icon: AlertTriangle, color: "text-[#EF4444]" },
                  { label: "רווח ממוצע בזכייה", value: formatPercent(metrics.avgWin), icon: TrendingUp, color: "text-[#10B981]" },
                  { label: "הפסד ממוצע בהפסד", value: formatPercent(metrics.avgLoss), icon: ArrowDownRight, color: "text-[#EF4444]" },
                  { label: "רצף זכיות מקסימלי", value: `${metrics.consecutiveWins} עסקאות`, icon: Award, color: "text-[#6366F1]" },
                  { label: "רצף הפסדים מקסימלי", value: `${metrics.consecutiveLosses} עסקאות`, icon: AlertTriangle, color: "text-[#94A3B8]" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg bg-[#0B0E14]/60 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <item.icon className={cn("h-3 w-3", item.color)} />
                      <span className="text-xs text-[#64748B]">{item.label}</span>
                    </div>
                    <span className={cn("text-xs font-bold", item.color)}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Equity Curve */}
            <div className="glass-card p-4" style={{ height: 220 }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-[#10B981]" />
                  <span className="text-sm font-semibold text-[#F8FAFC]">עקומת הון</span>
                </div>
                <span className="text-xs text-[#64748B]">הון התחלתי {formatCurrency(startingCapital)}</span>
              </div>
              <div style={{ height: 155 }}>
                <EquityCurve data={equityCurve} startingCapital={startingCapital} />
              </div>
            </div>
          </>
        )}

        {/* ── TRADES TAB ── */}
        {activeTab === "trades" && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-[#64748B]" />
              {([
                { key: "all", label: `הכל (${trades.length})` },
                { key: "wins", label: `זכיות (${trades.filter(t => t.returnPct > 0).length})` },
                { key: "losses", label: `הפסדים (${trades.filter(t => t.returnPct <= 0).length})` },
                { key: "take_profit", label: `TP (${trades.filter(t => t.exitReason === "take_profit").length})` },
                { key: "stop_loss", label: `SL (${trades.filter(t => t.exitReason === "stop_loss").length})` },
              ] as { key: TradeFilter; label: string }[]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setTradeFilter(f.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-all",
                    tradeFilter === f.key
                      ? "bg-[#6366F1] text-white"
                      : "border border-[#1E293B] text-[#94A3B8] hover:border-[#263147]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Full trade table */}
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B]">
                      {["#", "מניה", "תאריך", "קטליסט", "כניסה", "יציאה", "תשואה", "יציאה סיבה", "Rvol", "Float", "המתנה"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-[#64748B] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTrades.map((trade, idx) => (
                      <tr
                        key={trade.id}
                        className="border-b border-[#1E293B]/50 cursor-pointer transition-colors hover:bg-[#131A26]/60"
                        onClick={() => setSelectedTrade(trade)}
                      >
                        <td className="px-3 py-2 text-[#64748B]">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold text-[#F8FAFC]">{trade.ticker}</td>
                        <td className="px-3 py-2 text-[#94A3B8] whitespace-nowrap">{trade.date}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] text-[#8B5CF6]">{trade.catalyst}</span>
                        </td>
                        <td className="px-3 py-2 text-[#94A3B8]">${trade.entryPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-[#94A3B8]">${trade.exitPrice.toFixed(2)}</td>
                        <td className={cn("px-3 py-2 font-bold tabular-nums whitespace-nowrap", trade.returnPct >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                          {formatPercent(trade.returnPct)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={trade.exitReason === "take_profit" ? "green" : trade.exitReason === "stop_loss" ? "red" : "muted"}>
                            {trade.exitReason === "take_profit" ? "TP" : trade.exitReason === "stop_loss" ? "SL" : "EOD"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-[#94A3B8]">{trade.rvol?.toFixed(1)}x</td>
                        <td className="px-3 py-2 text-[#94A3B8]">{((trade.float || 0) / 1e6).toFixed(1)}M</td>
                        <td className="px-3 py-2 text-[#64748B]">{trade.holdingMinutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredTrades.length > 25 && (
                <button
                  onClick={() => setShowAllTrades(!showAllTrades)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-[#1E293B] py-3 text-xs font-medium text-[#6366F1] hover:bg-[#6366F1]/5 transition-colors"
                >
                  {showAllTrades ? <><ChevronUp className="h-3.5 w-3.5" /> הצג פחות</> : <><ChevronDown className="h-3.5 w-3.5" /> הצג את כל {filteredTrades.length} העסקאות</>}
                </button>
              )}
            </div>
          </>
        )}

        {/* ── DURABILITY TAB ── */}
        {activeTab === "durability" && (
          <>
            <div className="glass-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6366F1] mb-1 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> עמידות האסטרטגיה לפי שנה
              </p>
              <p className="text-xs text-[#64748B] mb-4">
                כל שנה נבדקת בנפרד — ככה תדע אם האסטרטגיה עמידה לאורך זמן או רק עבדה בתנאי שוק ספציפיים.
              </p>

              <div className="space-y-2">
                {durabilityByYear.map((period, i) => {
                  const isPositive = period.roi >= 0;
                  const barWidth = Math.min(Math.abs(period.roi) / 2, 100);
                  return (
                    <div key={i} className="rounded-lg border border-[#1E293B] bg-[#0B0E14]/40 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[#F8FAFC]">{period.period}</span>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-sm font-bold tabular-nums", isPositive ? "text-[#10B981]" : "text-[#EF4444]")}>
                            {formatPercent(period.roi)}
                          </span>
                          <Badge variant={period.winRate >= 55 ? "green" : period.winRate >= 45 ? "muted" : "red"}>
                            {period.winRate}% WR
                          </Badge>
                          <span className="text-xs text-[#64748B]">{period.trades} עסקאות</span>
                          <span className="text-xs text-[#64748B]">Sharpe {period.sharpe}</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#1E293B]">
                        <div
                          className={cn("h-1.5 rounded-full transition-all", isPositive ? "bg-[#10B981]" : "bg-[#EF4444]")}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="mt-4 rounded-lg border border-[#6366F1]/20 bg-[#6366F1]/5 p-3">
                <p className="text-xs font-semibold text-[#6366F1] mb-2">סיכום עמידות</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-[#10B981]">{durabilityByYear.filter(p => p.roi > 0).length}/{durabilityByYear.length}</p>
                    <p className="text-[10px] text-[#64748B]">שנים רווחיות</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#F8FAFC]">
                      {(durabilityByYear.reduce((a, p) => a + p.roi, 0) / durabilityByYear.length).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-[#64748B]">תשואה שנתית ממוצעת</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#F8FAFC]">
                      {(durabilityByYear.reduce((a, p) => a + p.winRate, 0) / durabilityByYear.length).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-[#64748B]">אחוז הצלחה ממוצע</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── OPINION TAB ── */}
        {activeTab === "opinion" && <ProfessionalOpinion metrics={metrics} strategy={strategy} trades={trades} riskPerTrade={riskPerTrade} riskAdjustedMaxDd={riskAdjustedMaxDd} />}

        {/* ── DCA TAB ── */}
        {activeTab === "dca" && <DcaSimulator
          strategy={strategy}
          finalEquity={finalEquity}
          startingCapital={startingCapital}
          metrics={metrics}
          monthlyDca={monthlyDca}
          onMonthlyDcaChange={setMonthlyDca}
        />}
      </div>

      {selectedTrade && <TradeModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />}
    </div>
  );
}

function ProfessionalOpinion({
  metrics, strategy, trades, riskPerTrade, riskAdjustedMaxDd,
}: {
  metrics: BacktestResult["metrics"];
  strategy: BacktestResult["strategy"];
  trades: BacktestResult["trades"];
  riskPerTrade: number;
  riskAdjustedMaxDd: number;
}) {
  type Grade = "good" | "ok" | "bad";

  const items: { label: string; value: string; grade: Grade; note: string }[] = [
    {
      label: "אחוז הצלחה",
      value: `${metrics.winRate}%`,
      grade: metrics.winRate >= 55 ? "good" : metrics.winRate >= 45 ? "ok" : "bad",
      note:
        metrics.winRate >= 60
          ? "מצוין — רוב העסקאות מסתיימות ברווח, יתרון פסיכולוגי חשוב למסחר יומי."
          : metrics.winRate >= 55
          ? "טוב — win rate מעל הממוצע, מספיק לעבוד איתו."
          : metrics.winRate >= 45
          ? "בינוני — פחות ממחצית הזמן אתה מנצח. חייב profit factor חזק כדי לפצות."
          : "חלש — אחוז הצלחה נמוך מ-45%. האסטרטגיה עלולה להיות קשה לביצוע בפועל.",
    },
    {
      label: "Profit Factor",
      value: String(metrics.profitFactor),
      grade: metrics.profitFactor >= 1.5 ? "good" : metrics.profitFactor >= 1.1 ? "ok" : "bad",
      note:
        metrics.profitFactor >= 2.0
          ? "מצוין — הרווחים גדולים פי 2 מההפסדים. זהו יחס R:R חזק מאוד."
          : metrics.profitFactor >= 1.5
          ? "טוב — הרווחים עולים משמעותית על ההפסדים."
          : metrics.profitFactor >= 1.2
          ? "סביר — יש עדיפות קלה לרווחים. נדרשת משמעת ביצוע קפדנית."
          : "בעייתי — הפרש קטן מדי בין רווחים להפסדים. עלות ביצוע בפועל עלולה למחוק את הרווח.",
    },
    {
      label: "Max Drawdown",
      value: `${riskAdjustedMaxDd.toFixed(1)}%`,
      grade: riskAdjustedMaxDd > -15 ? "good" : riskAdjustedMaxDd > -30 ? "ok" : "bad",
      note:
        metrics.maxDrawdown > -10
          ? "מצוין — ירידת שווי מקסימלית קטנה מ-10%, ניהול סיכון מדהים."
          : metrics.maxDrawdown > -20
          ? "טוב — ירידה מקסימלית מתקבלת, ניהול ההון סביר."
          : metrics.maxDrawdown > -30
          ? "גבוה — ירידה של עד 30% בהון. דורשת חוסן נפשי ואסור לצאת מהאסטרטגיה תוך כדי."
          : "גבוה מדי — ירידה של יותר מ-30% בהון. רוב הסוחרים ייזנחו את האסטרטגיה לפני שתחזור.",
    },
    {
      label: "Sharpe Ratio",
      value: String(metrics.sharpeRatio),
      grade: metrics.sharpeRatio >= 1 ? "good" : metrics.sharpeRatio >= 0.5 ? "ok" : "bad",
      note:
        metrics.sharpeRatio >= 2
          ? "מצוין — תשואה גבוהה ביחס לסיכון. אחד המדדים הטובים ביותר."
          : metrics.sharpeRatio >= 1
          ? "טוב — יחס תשואה/סיכון חיובי ומקובל בתעשייה."
          : metrics.sharpeRatio >= 0.5
          ? "בינוני — תשואה לא מפצה מספיק על הסיכון."
          : "חלש — הסיכון גבוה ביחס לתשואה. שקול לצמצם גודל עסקה.",
    },
    {
      label: "רצף הפסדים מקסימלי",
      value: `${metrics.consecutiveLosses} עסקאות`,
      grade: metrics.consecutiveLosses <= 5 ? "good" : metrics.consecutiveLosses <= 9 ? "ok" : "bad",
      note:
        metrics.consecutiveLosses <= 3
          ? "מצוין — לעולם לא הפסדת יותר מ-3 פעמים ברצף. קל מאוד לשמור על משמעת."
          : metrics.consecutiveLosses <= 5
          ? "טוב — רצף הפסדים קצר, ניתן לנהל פסיכולוגית."
          : metrics.consecutiveLosses <= 9
          ? `אתגר — ${metrics.consecutiveLosses} הפסדות ברצף. חייב תוכנית מראש: מה עושים בהפסד שישי?`
          : `קריטי — ${metrics.consecutiveLosses} הפסדות ברצף. רוב הסוחרים יפסיקו לפני הסוף ויחמיצו את ההתאוששות.`,
    },
    {
      label: "ממוצע עסקאות לחודש",
      value: String(metrics.avgTradesPerMonth),
      grade: metrics.avgTradesPerMonth >= 5 && metrics.avgTradesPerMonth <= 60 ? "good" : metrics.avgTradesPerMonth >= 2 ? "ok" : "bad",
      note:
        metrics.avgTradesPerMonth >= 5 && metrics.avgTradesPerMonth <= 60
          ? `${metrics.avgTradesPerMonth} עסקאות בחודש — תדירות ריאלית למסחר יומי פעיל.`
          : metrics.avgTradesPerMonth > 60
          ? `${metrics.avgTradesPerMonth} עסקאות בחודש — גבוה מדי. בפועל תהיה עייפות החלטות ועמלות גדולות.`
          : `${metrics.avgTradesPerMonth} עסקאות בחודש — נמוך. יקשה לבנות רצף ולשפר אחוזי הצלחה.`,
    },
    {
      label: "תשואה ממוצעת לעסקה",
      value: `${metrics.avgReturnPerTrade}%`,
      grade: metrics.avgReturnPerTrade >= 2 ? "good" : metrics.avgReturnPerTrade >= 0.5 ? "ok" : "bad",
      note:
        metrics.avgReturnPerTrade >= 3
          ? "מצוין — קל לכסות עלויות מסחר ועדיין להישאר רווחי."
          : metrics.avgReturnPerTrade >= 1.5
          ? "טוב — מרווח מספיק מעל עמלות ו-slippage."
          : metrics.avgReturnPerTrade >= 0.5
          ? "דחוק — לאחר עמלות ו-slippage אמיתיים יתכן שהרווח יצטמצם משמעותית."
          : "בעייתי — תשואה ממוצעת נמוכה מ-0.5%. עמלות מסחר בפועל עלולות להפוך זאת להפסד.",
    },
  ];

  const goodCount = items.filter(i => i.grade === "good").length;
  const badCount = items.filter(i => i.grade === "bad").length;
  const score = goodCount * 2 - badCount;

  const verdict =
    score >= 9
      ? { text: "מומלץ מאוד למסחר יומי", icon: CheckCircle, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30" }
      : score >= 5
      ? { text: "מומלץ בזהירות", icon: MinusCircle, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30" }
      : score >= 2
      ? { text: "לא מומלץ ללא שיפורים", icon: MinusCircle, color: "text-[#F97316]", bg: "bg-[#F97316]/10", border: "border-[#F97316]/30" }
      : { text: "לא מומלץ למסחר יומי", icon: XCircle, color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30" };

  const strengths = items.filter(i => i.grade === "good").map(i => i.label);
  const weaknesses = items.filter(i => i.grade === "bad").map(i => i.label);

  const riskAdjustedPnl = trades.reduce((s, t) => s + riskPerTrade * (t.returnPct / 100), 0);
  const perTradePnlAvg = trades.length > 0 ? riskAdjustedPnl / trades.length : 0;

  const gradeIcon = (g: Grade) =>
    g === "good" ? <CheckCircle className="h-4 w-4 text-[#10B981] shrink-0" /> :
    g === "bad"  ? <XCircle    className="h-4 w-4 text-[#EF4444] shrink-0" /> :
                   <MinusCircle className="h-4 w-4 text-[#F59E0B] shrink-0" />;

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <div className={cn("glass-card p-5 border", verdict.border, verdict.bg)}>
        <div className="flex items-center gap-3 mb-3">
          <verdict.icon className={cn("h-7 w-7", verdict.color)} />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#64748B]">פסיקה מקצועית — {strategy.lookbackYears} שנות נתונים</p>
            <p className={cn("text-xl font-bold", verdict.color)}>{verdict.text}</p>
          </div>
        </div>
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          {score >= 9
            ? `הנתונים מצביעים על אסטרטגיה עם ${goodCount} מדדים חזקים מתוך ${items.length}. עם ${riskPerTrade.toLocaleString()}$ לעסקה, הרווח הממוצע הצפוי הוא ${perTradePnlAvg >= 0 ? "+" : ""}${perTradePnlAvg.toFixed(1)}$ לעסקה. אסטרטגיה זו ראויה למסחר אמיתי בכפוף לניהול סיכון קפדני.`
            : score >= 5
            ? `יש פוטנציאל אבל גם חולשות שדורשות תשומת לב. רוב המדדים חיוביים, אך ${badCount > 0 ? "נקודות חולשה ב" + weaknesses.join(", ") + " עלולות לפגוע בביצוע בפועל" : "יש לבחון את העקביות לאורך זמן"}. מומלץ להתחיל עם גודל עסקה קטן.`
            : score >= 2
            ? `האסטרטגיה זקוקה לשיפורים לפני מסחר אמיתי. ${weaknesses.length > 0 ? "חולשות עיקריות: " + weaknesses.join(", ") + "." : ""} נדרש אופטימיזציה של פרמטרים לפני הפעלה.`
            : `המדדים מצביעים על סיכון גבוה מדי ביחס לתשואה. ${weaknesses.length > 0 ? "בעיות קריטיות: " + weaknesses.join(", ") + "." : ""} לא מומלץ להשתמש באסטרטגיה זו בכסף אמיתי בשלב זה.`
          }
        </p>
      </div>

      {/* Metric-by-metric breakdown */}
      <div className="glass-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-3">ניתוח מדד אחר מדד</p>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              {gradeIcon(item.grade)}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-[#F8FAFC]">{item.label}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    item.grade === "good" ? "bg-[#10B981]/15 text-[#10B981]" :
                    item.grade === "bad"  ? "bg-[#EF4444]/15 text-[#EF4444]" :
                                           "bg-[#F59E0B]/15 text-[#F59E0B]"
                  )}>{item.value}</span>
                </div>
                <p className="text-[11px] text-[#94A3B8] leading-snug">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths + Weaknesses */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="glass-card p-3 border-[#10B981]/20">
              <p className="text-xs font-semibold text-[#10B981] mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> חוזקות ({strengths.length})
              </p>
              <ul className="space-y-1">
                {strengths.map(s => <li key={s} className="text-[11px] text-[#94A3B8]">• {s}</li>)}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="glass-card p-3 border-[#EF4444]/20">
              <p className="text-xs font-semibold text-[#EF4444] mb-2 flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> חולשות ({weaknesses.length})
              </p>
              <ul className="space-y-1">
                {weaknesses.map(w => <li key={w} className="text-[11px] text-[#94A3B8]">• {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Bottom disclaimer */}
      <div className="rounded-lg border border-[#1E293B] bg-[#0B0E14]/40 p-3">
        <p className="text-[10px] text-[#475569] leading-relaxed">
          ⚠️ חוות דעת זו מבוססת על נתוני backtest היסטוריים בלבד. ביצועי עבר אינם מבטיחים תוצאות עתידיות.
          נתוני הפלוואט מגיעים מדיווחי EDGAR (דיוק רבעוני) ונתוני המחירים מ-Polygon.io.
          המלצה זו אינה ייעוץ השקעות.
        </p>
      </div>
    </div>
  );
}

function DcaSimulator({
  strategy, finalEquity, startingCapital, metrics, monthlyDca, onMonthlyDcaChange,
}: {
  strategy: { lookbackYears: number };
  finalEquity: number;
  startingCapital: number;
  metrics: { totalRoi: number };
  monthlyDca: number;
  onMonthlyDcaChange: (v: number) => void;
}) {
  const years = strategy.lookbackYears;
  const months = years * 12;
  const totalInvested = startingCapital + monthlyDca * months;

  // CAGR helper: annualised return on total invested
  const cagr = (finalVal: number) =>
    totalInvested > 0 ? (Math.pow(Math.max(finalVal / totalInvested, 0.001), 1 / years) - 1) * 100 : 0;

  // S&P 500 @ 10%/yr
  const mSp = 0.10 / 12;
  const spFactor = Math.pow(1 + mSp, months);
  const spFinal = startingCapital * spFactor + monthlyDca * (spFactor - 1) / mSp;

  // Inflation only @ 3%/yr (just deposits, no real return)
  const mInfl = 0.03 / 12;
  const inflFactor = Math.pow(1 + mInfl, months);
  const inflFinal = startingCapital * inflFactor + monthlyDca * (inflFactor - 1) / mInfl;

  // Strategy + DCA: each monthly deposit earns strategy's monthly rate for remaining months
  const monthlyStratRate = Math.pow(Math.max(1 + metrics.totalRoi / 100, 0.001), 1 / months) - 1;
  let stratDcaFinal = finalEquity;
  for (let m = 1; m <= months; m++) {
    stratDcaFinal += monthlyDca * Math.pow(1 + monthlyStratRate, months - m);
  }

  type Verdict = { text: string; color: string; bg: string; border: string };
  const verdict = (finalVal: number, invested: number): Verdict => {
    const c = cagr(finalVal);
    if (c >= 15)  return { text: "רווחי מאוד ✅", color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/25" };
    if (c >= 10)  return { text: "רווחי טוב ✅", color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/25" };
    if (c >= 5)   return { text: "רווחי — מתחת ל-S&P 🟡", color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/25" };
    if (c >= 3)   return { text: "בקושי מכסה אינפלציה 🟠", color: "text-[#F97316]", bg: "bg-[#F97316]/10", border: "border-[#F97316]/25" };
    if (finalVal >= invested) return { text: "לא מפסיד אך לא רווחי ⚪", color: "text-[#64748B]", bg: "bg-[#64748B]/10", border: "border-[#64748B]/25" };
    return { text: "מפסיד כסף ❌", color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/25" };
  };

  const scenarios = [
    {
      title: "הפקדה בלבד (חשבון עו\"ש)",
      desc: "הכסף יושב ללא ריבית — ממחיש את ערך הזמן",
      final: totalInvested,
      accentColor: "text-[#64748B]",
      barColor: "bg-[#334155]",
      v: verdict(totalInvested, totalInvested),
    },
    {
      title: "הצמדה לאינפלציה (3%/שנה)",
      desc: "מינימום שצריך לעשות כדי לא להפסיד ערך קנייה",
      final: inflFinal,
      accentColor: "text-[#94A3B8]",
      barColor: "bg-[#475569]",
      v: verdict(inflFinal, totalInvested),
    },
    {
      title: "S&P 500 — השוואת שוק (10%/שנה)",
      desc: "תשואת המדד הפסיבי ההיסטורית — קנה מדד וישן",
      final: spFinal,
      accentColor: "text-[#6366F1]",
      barColor: "bg-[#6366F1]",
      v: verdict(spFinal, totalInvested),
    },
    {
      title: "האסטרטגיה שלך + הפקדות חודשיות",
      desc: "כל הפקדה חדשה מרוויחה את תשואת האסטרטגיה",
      final: stratDcaFinal,
      accentColor: "text-[#F59E0B]",
      barColor: "bg-[#F59E0B]",
      v: verdict(stratDcaFinal, totalInvested),
    },
  ];

  const maxFinal = Math.max(...scenarios.map(s => s.final));

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="glass-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6366F1] mb-3 flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> הפקדה חודשית קבועה
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-[#64748B] shrink-0">כל חודש מפקיד:</span>
          <div className="relative max-w-[120px]">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">$</span>
            <input
              type="number"
              value={monthlyDca}
              onChange={e => onMonthlyDcaChange(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              step={100}
              className="w-full rounded border border-[#1E293B] bg-[#0B0E14] py-1.5 pl-5 pr-2 text-xs text-[#F8FAFC] focus:border-[#6366F1]/50 focus:outline-none"
            />
          </div>
          <div className="text-xs text-[#64748B]">
            <span className="text-[#F8FAFC] font-medium">{formatCurrency(monthlyDca)}</span> × {months} חודשים
            {" = "}
            <span className="text-[#F59E0B] font-semibold">{formatCurrency(monthlyDca * months)}</span> הפקדות
            {" + "}
            <span className="text-[#F8FAFC] font-medium">{formatCurrency(startingCapital)}</span> הון ראשוני
            {" = "}
            <span className="text-[#F8FAFC] font-bold">{formatCurrency(totalInvested)}</span> סה"כ מושקע
          </div>
        </div>
      </div>

      {/* Scenario cards */}
      <div className="space-y-3">
        {scenarios.map((s, i) => {
          const netProfit = s.final - totalInvested;
          const scenarioCagr = cagr(s.final);
          const barPct = maxFinal > 0 ? Math.min((s.final / maxFinal) * 100, 100) : 0;
          return (
            <div key={i} className={cn("glass-card p-4 border", s.v.border, s.v.bg)}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-xs font-bold text-[#F8FAFC]">{s.title}</p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{s.desc}</p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0", s.v.color, s.v.border, s.v.bg)}>
                  {s.v.text}
                </span>
              </div>

              {/* Numbers row */}
              <div className="grid grid-cols-4 gap-2 mb-2 text-center">
                <div className="rounded bg-[#0B0E14]/60 px-2 py-1.5">
                  <p className={cn("text-sm font-bold tabular-nums", s.accentColor)}>{formatCurrency(s.final)}</p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">שווי סופי</p>
                </div>
                <div className="rounded bg-[#0B0E14]/60 px-2 py-1.5">
                  <p className={cn("text-sm font-bold tabular-nums", netProfit >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                    {netProfit >= 0 ? "+" : ""}{formatCurrency(netProfit)}
                  </p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">רווח נקי</p>
                </div>
                <div className="rounded bg-[#0B0E14]/60 px-2 py-1.5">
                  <p className={cn("text-sm font-bold tabular-nums", netProfit >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                    {netProfit >= 0 ? "+" : ""}{formatPercent(((s.final - totalInvested) / totalInvested) * 100)}
                  </p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">תשואה כוללת</p>
                </div>
                <div className="rounded bg-[#0B0E14]/60 px-2 py-1.5">
                  <p className={cn("text-sm font-bold tabular-nums", scenarioCagr >= 10 ? "text-[#10B981]" : scenarioCagr >= 5 ? "text-[#F59E0B]" : "text-[#EF4444]")}>
                    {scenarioCagr >= 0 ? "+" : ""}{scenarioCagr.toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">תשואה שנתית</p>
                </div>
              </div>

              {/* Bar */}
              <div className="h-1.5 w-full rounded-full bg-[#1E293B]">
                <div className={cn("h-1.5 rounded-full transition-all duration-500", s.barColor)} style={{ width: `${barPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary verdict */}
      {(() => {
        const stratCagr = cagr(stratDcaFinal);
        const spCagr = cagr(spFinal);
        const beatsMarket = stratDcaFinal > spFinal;
        const netProfit = stratDcaFinal - totalInvested;
        return (
          <div className={cn("glass-card p-4 border", beatsMarket ? "border-[#10B981]/25 bg-[#10B981]/5" : "border-[#F59E0B]/25 bg-[#F59E0B]/5")}>
            <p className={cn("text-xs font-bold mb-2", beatsMarket ? "text-[#10B981]" : "text-[#F59E0B]")}>
              {beatsMarket ? "✅ האסטרטגיה מכה את השוק" : "🟡 האסטרטגיה מתחת ל-S&P"}
            </p>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              השקעת בסה"כ <span className="text-[#F8FAFC] font-semibold">{formatCurrency(totalInvested)}</span> על פני {years} שנים
              ({formatCurrency(startingCapital)} ראשוני + {formatCurrency(monthlyDca * months)} הפקדות).{" "}
              עם האסטרטגיה + הפקדות חודשיות — תסיים עם{" "}
              <span className={cn("font-bold", beatsMarket ? "text-[#10B981]" : "text-[#F59E0B]")}>{formatCurrency(stratDcaFinal)}</span>,
              כלומר רווח נקי של{" "}
              <span className={cn("font-bold", netProfit >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>{formatCurrency(Math.abs(netProfit))}</span>
              {netProfit >= 0 ? " מעל ההשקעה" : " הפסד"}.{" "}
              תשואה שנתית ממוצעת: <span className="text-[#F8FAFC] font-bold">{stratCagr.toFixed(1)}%</span>
              {beatsMarket
                ? ` — עדיף על S&P (${spCagr.toFixed(1)}%) ב-${(stratCagr - spCagr).toFixed(1)}% בשנה.`
                : ` — נמוך מ-S&P (${spCagr.toFixed(1)}%) ב-${(spCagr - stratCagr).toFixed(1)}% בשנה.`}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#131A26] border border-[#1E293B]">
        <BarChart2 className="h-8 w-8 text-[#64748B]" />
      </div>
      <div>
        <p className="text-base font-semibold text-[#F8FAFC]">אין בדיקה עדיין</p>
        <p className="mt-1 text-sm text-[#64748B]">תאר את האסטרטגיה שלך בצ'אט כדי להתחיל.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {["VWAP Cross", "Float Filter", "Rvol > 3x", "5-Year Data", "Full Trade Log"].map(tag => (
          <Badge key={tag} variant="muted">{tag}</Badge>
        ))}
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-[#10B981]/20" />
        <div className="absolute inset-0 rounded-full border-t-2 border-[#10B981] animate-spin" />
        <TrendingUp className="h-8 w-8 text-[#10B981]" />
      </div>
      <div>
        <p className="text-base font-semibold text-[#F8FAFC]">מריץ בדיקה</p>
        <p className="mt-1 text-sm text-[#64748B]">סורק שנות נתונים היסטוריים של מניות פני...</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {["טוען רשימת קטליסטים", "מסנן יקניבר מניות פני", "מדמה עסקאות", "מחשב מדדים"].map((step, i) => (
          <div key={step} className="flex items-center gap-2 text-xs text-[#64748B]">
            <div className={cn("h-1.5 w-1.5 rounded-full", i < 2 ? "bg-[#10B981]" : "bg-[#1E293B] animate-pulse")} />
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
