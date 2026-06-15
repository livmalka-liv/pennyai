"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, BarChart2, Calendar, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

interface StrategyRow {
  strategy: string;
  runs: number;
  total_trades: number;
  win_rate: number;
  avg_return_pct: number;
  best_trade: number;
  worst_trade: number;
  unique_tickers: number;
}

interface TradeDetail {
  ticker: string;
  return_pct: number | null;
  exit_reason: string | null;
  rvol: number | null;
  catalyst: string | null;
  holding_min: number | null;
}

interface DayStrategy {
  strategy: string;
  trades: number;
  wins: number;
  win_rate: number;
  avg_return: number;
  tickers: string[];
  details: TradeDetail[];
}

interface DayReport {
  date: string;
  strategies: DayStrategy[];
}

interface TopTicker {
  ticker: string;
  appearances: number;
  avg_return: number;
  win_rate: number;
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function WinRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 60 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
    : rate >= 45 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
    : "text-rose-400 bg-rose-400/10 border-rose-400/30";
  return (
    <span className={cn("border rounded-md px-2 py-0.5 text-xs font-semibold", color)}>
      {rate.toFixed(1)}%
    </span>
  );
}

function ReturnCell({ v }: { v: number }) {
  return (
    <span className={v >= 0 ? "text-emerald-400" : "text-rose-400"}>
      {pct(v)}
    </span>
  );
}

export default function TrackerPage() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [dailyReport, setDailyReport] = useState<DayReport[]>([]);
  const [topTickers, setTopTickers] = useState<TopTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"strategies" | "daily" | "tickers">("strategies");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, t] = await Promise.all([
        fetch(`${API}/tracker/strategies`).then(r => r.json()),
        fetch(`${API}/tracker/daily-report?days=${days}`).then(r => r.json()),
        fetch(`${API}/tracker/top-tickers?limit=20`).then(r => r.json()),
      ]);
      setStrategies(Array.isArray(s) ? s : []);
      setDailyReport(Array.isArray(d) ? d : []);
      setTopTickers(Array.isArray(t) ? t : []);
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  const tabs = [
    { id: "strategies" as const, label: "Strategy Table", icon: BarChart2 },
    { id: "daily" as const,      label: "Daily Report",   icon: Calendar },
    { id: "tickers" as const,    label: "Top Tickers",    icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] px-6 py-8">
      <div className="mx-auto max-w-screen-xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Strategy Tracker</h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Auto-saved results from every backtest run
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D1117] px-4 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-[#1E293B] bg-[#0D1117] p-1 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                tab === id
                  ? "bg-[#131A26] text-[#F8FAFC]"
                  : "text-[#64748B] hover:text-[#94A3B8]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {!loading && strategies.length === 0 && tab === "strategies" && (
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-16 text-center">
            <BarChart2 className="mx-auto mb-4 h-12 w-12 text-[#1E293B]" />
            <p className="text-[#64748B]">No backtest runs saved yet.</p>
            <p className="mt-1 text-sm text-[#475569]">Run a backtest in Sandbox to start tracking.</p>
          </div>
        )}

        {/* ── Strategy Table ── */}
        {tab === "strategies" && strategies.length > 0 && (
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[#64748B]">
                    <th className="px-4 py-3 text-left font-medium">Strategy</th>
                    <th className="px-4 py-3 text-center font-medium">Runs</th>
                    <th className="px-4 py-3 text-center font-medium">Trades</th>
                    <th className="px-4 py-3 text-center font-medium">Win Rate</th>
                    <th className="px-4 py-3 text-center font-medium">Avg Return</th>
                    <th className="px-4 py-3 text-center font-medium">Best Trade</th>
                    <th className="px-4 py-3 text-center font-medium">Worst Trade</th>
                    <th className="px-4 py-3 text-center font-medium">Tickers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {strategies.map((row) => (
                    <tr key={row.strategy} className="hover:bg-[#131A26] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#F8FAFC]">{row.strategy}</td>
                      <td className="px-4 py-3 text-center text-[#94A3B8]">{row.runs}</td>
                      <td className="px-4 py-3 text-center text-[#94A3B8]">{row.total_trades}</td>
                      <td className="px-4 py-3 text-center"><WinRateBadge rate={row.win_rate} /></td>
                      <td className="px-4 py-3 text-center"><ReturnCell v={row.avg_return_pct} /></td>
                      <td className="px-4 py-3 text-center text-emerald-400">{pct(row.best_trade)}</td>
                      <td className="px-4 py-3 text-center text-rose-400">{pct(row.worst_trade)}</td>
                      <td className="px-4 py-3 text-center text-[#94A3B8]">{row.unique_tickers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Daily Report ── */}
        {tab === "daily" && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-[#64748B]">Show last</span>
              {[7, 14, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-sm transition-all",
                    days === d
                      ? "border-[#6366F1] bg-[#6366F1]/10 text-[#6366F1]"
                      : "border-[#1E293B] text-[#64748B] hover:text-[#94A3B8]"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>

            {dailyReport.length === 0 && !loading && (
              <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-16 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-[#1E293B]" />
                <p className="text-[#64748B]">No daily data yet.</p>
              </div>
            )}

            <div className="space-y-3">
              {dailyReport.map((day) => {
                const expanded = expandedDays.has(day.date);
                const totalTrades = day.strategies.reduce((s, x) => s + x.trades, 0);
                const totalWins = day.strategies.reduce((s, x) => s + x.wins, 0);
                return (
                  <div key={day.date} className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
                    <button
                      onClick={() => toggleDay(day.date)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#131A26] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {expanded ? <ChevronDown className="h-4 w-4 text-[#64748B]" /> : <ChevronRight className="h-4 w-4 text-[#64748B]" />}
                        <span className="font-mono text-sm text-[#F8FAFC]">{day.date}</span>
                        <span className="text-xs text-[#64748B]">{day.strategies.length} strategies · {totalTrades} trades</span>
                      </div>
                      <WinRateBadge rate={totalTrades ? Math.round(totalWins / totalTrades * 100) : 0} />
                    </button>

                    {expanded && (
                      <div className="border-t border-[#1E293B] divide-y divide-[#1E293B]/60">
                        {day.strategies.map((s) => (
                          <div key={s.strategy} className="px-6 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-[#F8FAFC]">{s.strategy}</span>
                              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                                <span>{s.trades} trades</span>
                                <WinRateBadge rate={s.win_rate} />
                                <ReturnCell v={s.avg_return} />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {s.tickers.map((tk) => (
                                <span key={tk} className="rounded-md bg-[#131A26] border border-[#1E293B] px-2 py-0.5 text-xs text-[#94A3B8] font-mono">
                                  {tk}
                                </span>
                              ))}
                            </div>
                            {s.details.length > 0 && (
                              <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[#475569]">
                                      <th className="text-left py-1 pr-4">Ticker</th>
                                      <th className="text-right pr-4">Return</th>
                                      <th className="text-right pr-4">Exit</th>
                                      <th className="text-right pr-4">RVOL</th>
                                      <th className="text-right">Hold</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.details.map((d, i) => (
                                      <tr key={i} className="border-t border-[#1E293B]/40">
                                        <td className="py-1 pr-4 font-mono text-[#94A3B8]">{d.ticker}</td>
                                        <td className="py-1 pr-4 text-right">
                                          {d.return_pct != null ? <ReturnCell v={d.return_pct} /> : "—"}
                                        </td>
                                        <td className="py-1 pr-4 text-right text-[#64748B]">{d.exit_reason ?? "—"}</td>
                                        <td className="py-1 pr-4 text-right text-[#64748B]">{d.rvol != null ? `${d.rvol.toFixed(1)}x` : "—"}</td>
                                        <td className="py-1 text-right text-[#64748B]">{d.holding_min != null ? `${d.holding_min}m` : "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Top Tickers ── */}
        {tab === "tickers" && (
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
            {topTickers.length === 0 && !loading ? (
              <div className="p-16 text-center">
                <TrendingUp className="mx-auto mb-4 h-12 w-12 text-[#1E293B]" />
                <p className="text-[#64748B]">No ticker data yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[#64748B]">
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Ticker</th>
                      <th className="px-4 py-3 text-center font-medium">Appearances</th>
                      <th className="px-4 py-3 text-center font-medium">Win Rate</th>
                      <th className="px-4 py-3 text-center font-medium">Avg Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {topTickers.map((t, i) => (
                      <tr key={t.ticker} className="hover:bg-[#131A26] transition-colors">
                        <td className="px-4 py-3 text-[#475569]">{i + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-[#F8FAFC]">{t.ticker}</td>
                        <td className="px-4 py-3 text-center text-[#94A3B8]">{t.appearances}</td>
                        <td className="px-4 py-3 text-center"><WinRateBadge rate={t.win_rate} /></td>
                        <td className="px-4 py-3 text-center"><ReturnCell v={t.avg_return} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="mt-8 flex justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
          </div>
        )}
      </div>
    </div>
  );
}
