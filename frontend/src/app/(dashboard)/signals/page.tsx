"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Zap, TrendingUp, TrendingDown, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMySignals, type SignalRow } from "@/lib/api";

const DAYS_OPTIONS = [1, 5, 7, 14, 30];

function statusColor(s: SignalRow["status"]) {
  if (s === "win")  return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
  if (s === "loss") return "text-rose-400 bg-rose-400/10 border-rose-400/30";
  if (s === "open") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  return "text-[#64748B] bg-[#1E293B] border-[#1E293B]";
}

function statusLabel(s: SignalRow["status"]) {
  if (s === "win")  return "זכה";
  if (s === "loss") return "הפסיד";
  if (s === "open") return "פתוח";
  return "flat";
}

function pct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const etOffset = -4; // EDT
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;
  const etMin  = now.getUTCMinutes();
  const total  = etHour * 60 + etMin;
  const dow    = now.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return total >= 9 * 60 + 30 && total < 16 * 60;
}

export default function SignalsPage() {
  const [signals, setSignals]     = useState<SignalRow[]>([]);
  const [days, setDays]           = useState(7);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const marketOpen = isMarketOpen();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMySignals(days);
      setSignals(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function triggerScan() {
    setScanning(true);
    try {
      const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      await fetch(`${API}/live-strategies/scan`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      await load();
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  }

  const wins   = signals.filter(s => s.status === "win").length;
  const losses = signals.filter(s => s.status === "loss").length;
  const open   = signals.filter(s => s.status === "open").length;
  const totalPct = signals.reduce((acc, s) => acc + (s.return_pct ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] px-6 py-8" dir="rtl">
      <div className="mx-auto max-w-screen-xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6366F1]/10 border border-[#6366F1]/20">
              <Zap className="h-5 w-5 text-[#6366F1]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">אותות סריקה</h1>
              <p className="mt-0.5 text-sm text-[#64748B]">
                מה האסטרטגיות שלך היו מוצאות בשוק
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Market status */}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              marketOpen
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-[#1E293B] text-[#475569]"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", marketOpen ? "bg-emerald-400 animate-pulse" : "bg-[#475569]")} />
              {marketOpen ? "בורסה פתוחה" : "בורסה סגורה"}
            </div>

            {/* Scan now button */}
            <button
              onClick={triggerScan}
              disabled={scanning || loading}
              className="flex items-center gap-2 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-4 py-2 text-sm font-medium text-[#6366F1] hover:bg-[#6366F1]/20 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
              {scanning ? "סורק..." : "סרוק עכשיו"}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "אותות",     value: String(signals.length), icon: Zap,          color: "" },
            { label: "זכיות",     value: String(wins),           icon: TrendingUp,   color: wins   > 0 ? "text-emerald-400" : "" },
            { label: "הפסדים",   value: String(losses),          icon: TrendingDown, color: losses > 0 ? "text-rose-400" : "" },
            { label: "P&L סה\"כ", value: pct(totalPct),          icon: Zap,          color: totalPct >= 0 ? "text-emerald-400" : "text-rose-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0D1117] px-4 py-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                <Icon className="h-3.5 w-3.5" />{label}
              </div>
              <div className={cn("text-xl font-bold", color || "text-[#F8FAFC]")}>{value}</div>
            </div>
          ))}
        </div>

        {/* Days filter */}
        <div className="mb-5 flex items-center gap-2">
          <span className="text-xs text-[#64748B]">הצג:</span>
          <div className="flex gap-1 rounded-xl border border-[#1E293B] bg-[#0D1117] p-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                  days === d ? "bg-[#131A26] text-[#F8FAFC]" : "text-[#64748B] hover:text-[#94A3B8]"
                )}
              >
                {d === 1 ? "היום" : `${d} ימים`}
              </button>
            ))}
          </div>
          {lastRefresh && (
            <span className="text-[10px] text-[#475569]">
              עודכן: {lastRefresh.toLocaleTimeString("he-IL")}
            </span>
          )}
        </div>

        {/* Signals table */}
        <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
            </div>
          ) : signals.length === 0 ? (
            <div className="py-20 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[#1E293B]" />
              <p className="font-medium text-[#94A3B8]">אין אותות עדיין</p>
              <p className="mt-1 text-sm text-[#475569]">
                הפעל אסטרטגיות מ-Strategy Lab ולחץ "סרוק עכשיו"
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[#64748B] text-xs">
                    <th className="px-4 py-3 text-right font-medium">אסטרטגיה</th>
                    <th className="px-4 py-3 text-right font-medium">מניה</th>
                    <th className="px-4 py-3 text-center font-medium">תאריך</th>
                    <th className="px-4 py-3 text-center font-medium">כניסה</th>
                    <th className="px-4 py-3 text-center font-medium">TP</th>
                    <th className="px-4 py-3 text-center font-medium">SL</th>
                    <th className="px-4 py-3 text-center font-medium">P&L</th>
                    <th className="px-4 py-3 text-center font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {signals.map(sig => (
                    <tr key={sig.id} className="hover:bg-[#131A26] transition-colors">
                      <td className="px-4 py-3 text-right text-[#94A3B8] text-xs">{sig.strategy_name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-[#F8FAFC]">{sig.ticker}</span>
                        {sig.rvol && <span className="ml-1 text-[10px] text-[#475569]">RVOL {sig.rvol.toFixed(1)}x</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-[#64748B]">
                        {sig.trade_date}<br/>
                        {sig.entry_time_et && <span className="text-[#475569]">{sig.entry_time_et} ET</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[#F8FAFC]">${sig.entry_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-400 text-xs">
                        {sig.tp_price ? `$${sig.tp_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-rose-400 text-xs">
                        {sig.sl_price ? `$${sig.sl_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "font-semibold",
                          (sig.return_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {pct(sig.return_pct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusColor(sig.status))}>
                          {statusLabel(sig.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {open > 0 && (
          <p className="mt-3 text-center text-xs text-[#475569]">
            <Clock className="inline h-3 w-3 mr-1" />
            {open} אותות פתוחים — יסגרו אוטומטית בסוף יום המסחר
          </p>
        )}
      </div>
    </div>
  );
}
