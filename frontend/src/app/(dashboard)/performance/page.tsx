"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Calendar, BarChart2, RefreshCw, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const API = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://pennyai-backend-production.up.railway.app/api/v1"
).replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface StrategySummary {
  strategy: string;
  total_trades: number;
  wins: number;
  win_rate: number;
  total_return_pct: number;
  total_pnl: number;
}

interface PeriodRow {
  period: string;
  trades: number;
  wins: number;
  win_rate: number;
  return_pct: number;
  pnl: number;
}

interface DailyReport {
  strategy: string;
  today_pct: number;
  today_trades: number;
  week_pct: number;
  week_trades: number;
  month_pct: number;
  month_trades: number;
}

type PeriodType = "daily" | "weekly" | "monthly" | "yearly";

const PERIOD_LABELS: { id: PeriodType; label: string }[] = [
  { id: "daily",   label: "יומי"   },
  { id: "weekly",  label: "שבועי"  },
  { id: "monthly", label: "חודשי"  },
  { id: "yearly",  label: "שנתי"   },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function money(v: number) {
  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
}

function ColorNum({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  return (
    <span className={value >= 0 ? "text-emerald-400" : "text-rose-400"}>
      {formatter(value)}
    </span>
  );
}

function WinBadge({ rate }: { rate: number }) {
  const color =
    rate >= 60
      ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
      : rate >= 45
      ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
      : "text-rose-400 bg-rose-400/10 border-rose-400/30";
  return (
    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", color)}>
      {rate.toFixed(1)}%
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [summaries, setSummaries] = useState<StrategySummary[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [periodRows, setPeriodRows] = useState<PeriodRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingPeriod, setLoadingPeriod]   = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport[]>([]);

  // Load summary list — no selectedStrategy in deps to avoid infinite loop
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API}/performance/summary`);
      if (!res.ok) throw new Error("summary fetch failed");
      const data: StrategySummary[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSummaries(list);
      // Only set default once — use functional update to read current state
      setSelectedStrategy((prev) => (prev || (list.length > 0 ? list[0].strategy : "")));
      // Also load daily report
      try {
        const dr = await fetch(`${API}/performance/daily-report`);
        if (dr.ok) setDailyReport(await dr.json());
      } catch { /* non-critical */ }
    } catch {
      setSummaries([]);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // Load period breakdown
  const loadPeriod = useCallback(async () => {
    if (!selectedStrategy) return;
    setLoadingPeriod(true);
    try {
      const res = await fetch(
        `${API}/performance/by-period?strategy=${encodeURIComponent(selectedStrategy)}&period=${period}`
      );
      if (!res.ok) throw new Error("period fetch failed");
      const data: PeriodRow[] = await res.json();
      setPeriodRows(Array.isArray(data) ? data : []);
    } catch {
      setPeriodRows([]);
    } finally {
      setLoadingPeriod(false);
    }
  }, [selectedStrategy, period]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadPeriod(); },  [loadPeriod]);

  const isLoading = loadingSummary || loadingPeriod;
  const isEmpty   = !loadingSummary && summaries.length === 0;

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] px-6 py-8">
      <div className="mx-auto max-w-screen-xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6366F1]/10 border border-[#6366F1]/20">
              <TrendingUp className="h-5 w-5 text-[#6366F1]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Performance</h1>
              <p className="mt-0.5 text-sm text-[#64748B]">
                ביצועי אסטרטגיות live לפי תקופה
              </p>
            </div>
          </div>

          <button
            onClick={() => { loadSummary(); loadPeriod(); }}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D1117] px-4 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            רענן
          </button>
        </div>

        {/* Daily Report */}
        {dailyReport.length > 0 && (
          <div className="mb-8 rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[#1E293B] px-5 py-3">
              <Sun className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-semibold text-[#F8FAFC]">דוח יומי</span>
              <span className="text-xs text-[#475569]">{new Date().toLocaleDateString("he-IL")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[#64748B] text-xs">
                    <th className="px-5 py-2.5 text-right font-medium">אסטרטגיה</th>
                    <th className="px-4 py-2.5 text-center font-medium">היום</th>
                    <th className="px-4 py-2.5 text-center font-medium">השבוע</th>
                    <th className="px-4 py-2.5 text-center font-medium">החודש</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {dailyReport.map((row) => (
                    <tr key={row.strategy} className="hover:bg-[#131A26] transition-colors">
                      <td className="px-5 py-3 text-right font-medium text-[#F8FAFC]">{row.strategy}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-semibold", row.today_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {pct(row.today_pct)}
                        </span>
                        {row.today_trades > 0 && <span className="ml-1 text-[10px] text-[#475569]">({row.today_trades})</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-semibold", row.week_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {pct(row.week_pct)}
                        </span>
                        {row.week_trades > 0 && <span className="ml-1 text-[10px] text-[#475569]">({row.week_trades})</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-semibold", row.month_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {pct(row.month_pct)}
                        </span>
                        {row.month_trades > 0 && <span className="ml-1 text-[10px] text-[#475569]">({row.month_trades})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-20 text-center">
            <BarChart2 className="mx-auto mb-4 h-12 w-12 text-[#1E293B]" />
            <p className="text-[#94A3B8] font-medium">
              אין עסקאות live עדיין — הפעל אסטרטגיות מה-Live Lab
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              לאחר שאסטרטגיה תרשום עסקאות, הן יופיעו כאן.
            </p>
          </div>
        )}

        {!isEmpty && (
          <>
            {/* Strategy selector */}
            {summaries.length > 0 && (
              <div className="mb-6">
                <label className="mb-2 block text-xs font-medium text-[#64748B] uppercase tracking-wider">
                  אסטרטגיה
                </label>
                <div className="flex flex-wrap gap-2">
                  {summaries.map((s) => (
                    <button
                      key={s.strategy}
                      onClick={() => setSelectedStrategy(s.strategy)}
                      className={cn(
                        "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                        selectedStrategy === s.strategy
                          ? "border-[#6366F1] bg-[#6366F1]/10 text-[#6366F1]"
                          : "border-[#1E293B] text-[#64748B] hover:border-[#263147] hover:text-[#94A3B8]"
                      )}
                    >
                      {s.strategy}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Summary cards for selected strategy */}
            {selectedStrategy && (() => {
              const s = summaries.find((x) => x.strategy === selectedStrategy);
              if (!s) return null;
              return (
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "עסקאות", value: String(s.total_trades), icon: BarChart2 },
                    { label: "Win Rate", value: `${s.win_rate.toFixed(1)}%`, icon: TrendingUp,
                      color: s.win_rate >= 55 ? "text-emerald-400" : s.win_rate >= 45 ? "text-yellow-400" : "text-rose-400" },
                    { label: "תשואה כוללת", value: pct(s.total_return_pct), icon: Calendar,
                      color: s.total_return_pct >= 0 ? "text-emerald-400" : "text-rose-400" },
                    { label: "P&L", value: money(s.total_pnl), icon: TrendingUp,
                      color: s.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-[#1E293B] bg-[#0D1117] px-4 py-4"
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </div>
                      <div className={cn("text-xl font-bold", color ?? "text-[#F8FAFC]")}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Period tabs */}
            <div className="mb-6 flex gap-1 rounded-xl border border-[#1E293B] bg-[#0D1117] p-1 w-fit">
              {PERIOD_LABELS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setPeriod(id)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                    period === id
                      ? "bg-[#131A26] text-[#F8FAFC]"
                      : "text-[#64748B] hover:text-[#94A3B8]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Period table */}
            <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
              {loadingPeriod ? (
                <div className="flex justify-center py-16">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
                </div>
              ) : periodRows.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="mx-auto mb-3 h-10 w-10 text-[#1E293B]" />
                  <p className="text-sm text-[#64748B]">אין נתונים לתקופה זו</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[#64748B]">
                        <th className="px-4 py-3 text-right font-medium">תקופה</th>
                        <th className="px-4 py-3 text-center font-medium">עסקאות</th>
                        <th className="px-4 py-3 text-center font-medium">הצלחות</th>
                        <th className="px-4 py-3 text-center font-medium">Win%</th>
                        <th className="px-4 py-3 text-center font-medium">תשואה%</th>
                        <th className="px-4 py-3 text-center font-medium">P&amp;L$</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {periodRows.map((row) => (
                        <tr
                          key={row.period}
                          className="hover:bg-[#131A26] transition-colors"
                        >
                          <td className="px-4 py-3 text-right font-mono text-[#94A3B8]">
                            {row.period}
                          </td>
                          <td className="px-4 py-3 text-center text-[#94A3B8]">
                            {row.trades}
                          </td>
                          <td className="px-4 py-3 text-center text-[#94A3B8]">
                            {row.wins}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <WinBadge rate={row.win_rate} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ColorNum value={row.return_pct} formatter={pct} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ColorNum value={row.pnl} formatter={money} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Global loading spinner (summary fetch) */}
        {loadingSummary && (
          <div className="mt-12 flex justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
          </div>
        )}
      </div>
    </div>
  );
}
