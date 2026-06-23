"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Zap, TrendingUp, TrendingDown, Clock, AlertCircle, Calendar, X, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMySignals, getActiveStrategies, deactivateStrategy, getScanStatus, type SignalRow, type ActiveStrategy, type ScanStatus } from "@/lib/api";

type Preset = "today" | "7" | "14" | "30";

const DEMO_SIGNALS: SignalRow[] = [
  { id:"d1", ticker:"NXTS", strategy_name:"VWAP Reclaim",      trade_date:"2026-06-22", entry_time_et:"09:47", exit_time:"10:25", entry_price:15.53, exit_price:15.97, tp_price:15.97, sl_price:15.31, return_pct:2.83,  dollars_gain:44,  hold_minutes:38, status:"win",  exit_reason:"TP",  rvol:8.3,  catalyst:null },
  { id:"d2", ticker:"PMN",  strategy_name:"Gap & Go",           trade_date:"2026-06-22", entry_time_et:"09:12", exit_time:"09:26", entry_price:10.93, exit_price:10.74, tp_price:11.31, sl_price:10.74, return_pct:-1.74, dollars_gain:-19, hold_minutes:14, status:"loss", exit_reason:"SL",  rvol:12.4, catalyst:null },
  { id:"d3", ticker:"VHC",  strategy_name:"Bull Flag Breakout", trade_date:"2026-06-22", entry_time_et:"10:21", exit_time:null,    entry_price:12.85, exit_price:null,  tp_price:13.17, sl_price:12.69, return_pct:null,  dollars_gain:null,hold_minutes:null,status:"open", exit_reason:null,  rvol:6.1,  catalyst:null },
  { id:"d4", ticker:"OCGN", strategy_name:"Bull Flag Breakout", trade_date:"2026-06-21", entry_time_et:"06:41", exit_time:"07:03", entry_price:4.12,  exit_price:4.94,  tp_price:4.94,  sl_price:3.83,  return_pct:19.9,  dollars_gain:189, hold_minutes:22, status:"win",  exit_reason:"TP",  rvol:18.2, catalyst:null },
  { id:"d5", ticker:"CNTX", strategy_name:"VWAP Reclaim",      trade_date:"2026-06-21", entry_time_et:"11:03", exit_time:"11:41", entry_price:0.87,  exit_price:0.81,  tp_price:1.00,  sl_price:0.82,  return_pct:-6.9,  dollars_gain:-65, hold_minutes:38, status:"loss", exit_reason:"SL",  rvol:3.2,  catalyst:null },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function statusColor(s: SignalRow["status"]) {
  if (s === "win")  return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
  if (s === "loss") return "text-rose-400 bg-rose-400/10 border-rose-400/30";
  if (s === "open") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  return "text-[#64748B] bg-[#1E293B] border-[#1E293B]";
}

function statusLabel(s: SignalRow["status"]) {
  if (s === "win")  return "WIN";
  if (s === "loss") return "LOSS";
  if (s === "open") return "פתוח";
  return "flat";
}

function dollars(v: number | null) {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function pct(v: number | null) {
  if (v == null) return "";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function formatDate(d: string) {
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  } catch { return d; }
}

function exitReasonLabel(r: string | null) {
  if (!r) return null;
  if (r === "TP") return { label: "TP", color: "text-emerald-400" };
  if (r === "SL") return { label: "SL", color: "text-rose-400" };
  if (r === "EOD") return { label: "EOD", color: "text-[#64748B]" };
  return { label: r, color: "text-[#64748B]" };
}

export default function SignalsPage() {
  const [signals, setSignals]   = useState<SignalRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [preset, setPreset]     = useState<Preset>("7");
  const [fromDate, setFromDate] = useState(nDaysAgoStr(7));
  const [toDate, setToDate]     = useState(todayStr());
  const [useCustom, setUseCustom] = useState(false);
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [showTickers, setShowTickers] = useState(false);

  const loadScanStatus = useCallback(async () => {
    try {
      const s = await getScanStatus();
      setScanStatus(s);
    } catch { /* keep previous */ }
  }, []);

  const loadActiveStrategies = useCallback(async () => {
    try {
      const data = await getActiveStrategies();
      setActiveStrategies(Array.isArray(data) ? data : []);
    } catch { setActiveStrategies([]); }
  }, []);

  async function removeStrategy(trackerId: string) {
    setRemoving(trackerId);
    try {
      await deactivateStrategy(trackerId);
      await loadActiveStrategies();
    } catch { /* ignore */ } finally {
      setRemoving(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = useCustom
        ? { fromDate, toDate }
        : preset === "today"
          ? { days: 1 }
          : { days: Number(preset) };
      const data = await getMySignals(params);
      setSignals(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [preset, fromDate, toDate, useCustom]);

  useEffect(() => {
    load();
    loadActiveStrategies();
    loadScanStatus();
    // Refresh scan status every 30 seconds
    const interval = setInterval(loadScanStatus, 30_000);
    return () => clearInterval(interval);
  }, [load, loadActiveStrategies, loadScanStatus]);

  function applyPreset(p: Preset) {
    setPreset(p);
    setUseCustom(false);
    const n = p === "today" ? 1 : Number(p);
    setFromDate(nDaysAgoStr(n));
    setToDate(todayStr());
  }

  function applyCustomRange() {
    setUseCustom(true);
  }

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
    } catch { /* ignore */ } finally {
      setScanning(false);
    }
  }

  // Group signals by date
  const grouped = useMemo(() => {
    const map = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = map.get(s.trade_date) ?? [];
      list.push(s);
      map.set(s.trade_date, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [signals]);

  const totalWins     = signals.filter(s => s.status === "win").length;
  const totalLosses   = signals.filter(s => s.status === "loss").length;
  const totalOpen     = signals.filter(s => s.status === "open").length;
  const totalDollars  = signals.reduce((acc, s) => acc + (s.dollars_gain ?? 0), 0);

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
              <h1 className="text-2xl font-bold">יומן עסקאות</h1>
              <p className="mt-0.5 text-sm text-[#64748B]">כניסות, יציאות ותוצאות לפי אסטרטגיה</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Scanner status */}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              scanStatus?.scan_window_active
                ? "border-[#6366F1]/30 bg-[#6366F1]/10 text-[#6366F1]"
                : "border-[#1E293B] text-[#475569]"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", scanStatus?.scan_window_active ? "bg-[#6366F1] animate-pulse" : "bg-[#475569]")} />
              {scanStatus?.scan_window_active ? "סורק פעיל" : "סורק לא פעיל"}
            </div>

            {/* Market status */}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              scanStatus?.market_open
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-[#1E293B] text-[#475569]"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", scanStatus?.market_open ? "bg-emerald-400 animate-pulse" : "bg-[#475569]")} />
              {scanStatus?.market_open ? "בורסה פתוחה" : `בורסה נפתחת ${scanStatus?.market_opens_israel ?? "16:30"} IL`}
            </div>

            {/* Data source badge */}
            {scanStatus && scanStatus.data_source && scanStatus.data_source !== "none" && (
              <div className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                scanStatus.data_source === "ibkr"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : scanStatus.data_source === "mock"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    : "border-yellow-400/20 bg-yellow-400/5 text-yellow-400"
              )}>
                {scanStatus.data_source === "ibkr" ? "🔴 IBKR Live" :
                 scanStatus.data_source === "yahoo" ? "Yahoo Finance" :
                 scanStatus.data_source === "mock" ? "⚠️ Mock Data" :
                 scanStatus.data_source}
              </div>
            )}

            {/* Tracked tickers count */}
            {scanStatus && scanStatus.tracked_count > 0 && (
              <button
                onClick={() => setShowTickers(t => !t)}
                className="flex items-center gap-1.5 rounded-full border border-yellow-400/20 bg-yellow-400/5 px-3 py-1 text-xs font-medium text-yellow-400 hover:bg-yellow-400/10 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                {scanStatus.tracked_count} מניות במעקב
              </button>
            )}

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

        {/* Tracked tickers panel */}
        {showTickers && scanStatus && scanStatus.tracked_count > 0 && (
          <div className="mb-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-semibold text-yellow-400">
                  מניות שנסרקות עכשיו ({scanStatus.tracked_count})
                </span>
                <span className="text-[10px] text-[#475569]">
                  שעון ישראל: {scanStatus.time_israel} · ET: {scanStatus.time_et}
                </span>
              </div>
              <button onClick={() => setShowTickers(false)} className="text-[#475569] hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scanStatus.tracked_tickers.map(t => (
                <span key={t} className="rounded-md border border-yellow-400/20 bg-[#0D1117] px-2 py-0.5 text-[11px] font-mono text-yellow-300">
                  {t}
                </span>
              ))}
            </div>
            {!scanStatus.market_open && (
              <p className="mt-2 text-[10px] text-[#64748B]">
                הבורסה תיפתח ב-{scanStatus.market_opens_israel} שעון ישראל — הסורק אוסף נתוני pre-market
              </p>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "עסקאות",           value: String(signals.length), icon: Zap,          color: "" },
            { label: "זכיות",            value: String(totalWins),      icon: TrendingUp,   color: totalWins   > 0 ? "text-emerald-400" : "" },
            { label: "הפסדים",           value: String(totalLosses),    icon: TrendingDown, color: totalLosses > 0 ? "text-rose-400"   : "" },
            { label: "רווח/הפסד ($1K)",  value: dollars(totalDollars),  icon: Zap,          color: totalDollars >= 0 ? "text-emerald-400" : "text-rose-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0D1117] px-4 py-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-[#64748B]">
                <Icon className="h-3.5 w-3.5" />{label}
              </div>
              <div className={cn("text-xl font-bold", color || "text-[#F8FAFC]")}>{value}</div>
            </div>
          ))}
        </div>

        {/* Active strategies panel */}
        {activeStrategies.length > 0 && (
          <div className="mb-5 rounded-xl border border-[#6366F1]/20 bg-[#6366F1]/5 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#6366F1] animate-pulse" />
              <span className="text-xs font-semibold text-[#6366F1]">אסטרטגיות פעילות בסורק ({activeStrategies.length})</span>
              <span className="text-[10px] text-[#475569]">TP/SL כל שניה · סטאפים חדשים כל 5 שניות · 11:00–23:00 IL</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeStrategies.map(s => (
                <div key={s.tracker_id} className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D1117] px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-[#F8FAFC] font-medium">{s.name}</span>
                  <button
                    onClick={() => removeStrategy(s.tracker_id)}
                    disabled={removing === s.tracker_id}
                    className="rounded p-0.5 text-[#475569] hover:text-rose-400 transition-colors disabled:opacity-50"
                    title="הפסק סריקה"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Broker speed comparison — shows when 2+ brokers are connected */}
        {activeStrategies.length > 0 && (
          <div className="mb-5 rounded-xl border border-[#1E293B] bg-[#0D1117] px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="h-3.5 w-3.5 text-[#64748B]" />
              <span className="text-xs font-semibold text-[#64748B]">השוואת מהירות ביצוע ברוקרים</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#475569]">
              <span className="rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-1.5">
                IBKR Paper — ברוקר ראשי
              </span>
              <span className="text-[#1E293B]">+</span>
              <span className="rounded-lg border border-dashed border-[#1E293B] px-3 py-1.5 text-[#334155]">
                ברוקר נוסף — חבר דרך Settings
              </span>
              <span className="text-[10px] text-[#334155] mr-auto">
                השוואה תופעל אוטומטית כשיחוברו 2 ברוקרים ומעלה
              </span>
            </div>
          </div>
        )}

        {/* Date range filter */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Presets */}
          <div className="flex gap-1 rounded-xl border border-[#1E293B] bg-[#0D1117] p-1">
            {(["today", "7", "14", "30"] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                  !useCustom && preset === p ? "bg-[#131A26] text-[#F8FAFC]" : "text-[#64748B] hover:text-[#94A3B8]"
                )}
              >
                {p === "today" ? "היום" : `${p} ימים`}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0D1117] px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-[#64748B]" />
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setUseCustom(false); }}
              className="bg-transparent text-xs text-[#94A3B8] outline-none"
            />
            <span className="text-[#475569] text-xs">—</span>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setUseCustom(false); }}
              className="bg-transparent text-xs text-[#94A3B8] outline-none"
            />
            <button
              onClick={applyCustomRange}
              className="rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 px-2 py-0.5 text-[10px] font-medium text-[#6366F1] hover:bg-[#6366F1]/20 transition-all"
            >
              הצג
            </button>
          </div>

          {lastRefresh && (
            <span className="text-[10px] text-[#475569]">
              עודכן {lastRefresh.toLocaleTimeString("he-IL")}
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-24">
            <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
          </div>
        ) : signals.length === 0 ? (
          <div className="space-y-4 opacity-50 pointer-events-none select-none relative">
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-xl border border-[#6366F1]/30 bg-[#080B10]/90 px-6 py-4 text-center shadow-2xl pointer-events-auto">
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-[#6366F1]" />
                <p className="font-semibold text-[#F8FAFC] text-sm">כך ייראו העסקאות שלך</p>
                <p className="mt-1 text-xs text-[#64748B]">לחץ "סרוק עכשיו" לקבל עסקאות אמיתיות</p>
              </div>
            </div>
            {(() => {
              const demoGrouped = new Map<string, SignalRow[]>();
              for (const s of DEMO_SIGNALS) {
                const list = demoGrouped.get(s.trade_date) ?? [];
                list.push(s);
                demoGrouped.set(s.trade_date, list);
              }
              return Array.from(demoGrouped.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([day, rows]) => {
                const dw = rows.filter(r => r.status === "win").length;
                const dl = rows.filter(r => r.status === "loss").length;
                const dd = rows.reduce((a, r) => a + (r.dollars_gain ?? 0), 0);
                return (
                  <div key={day} className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E293B]">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-[#F8FAFC]">{formatDate(day)}</span>
                        <span className="text-xs text-[#475569]">{rows.length} עסקאות</span>
                        {dw > 0 && <span className="text-xs text-emerald-400">{dw}W</span>}
                        {dl > 0 && <span className="text-xs text-rose-400">{dl}L</span>}
                      </div>
                      <span className={cn("text-sm font-bold", dd >= 0 ? "text-emerald-400" : "text-rose-400")}>{dollars(dd)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#475569] border-b border-[#1E293B]/60">
                            <th className="px-4 py-2 text-right font-medium">מניה</th>
                            <th className="px-4 py-2 text-right font-medium">אסטרטגיה</th>
                            <th className="px-4 py-2 text-center font-medium">כניסה</th>
                            <th className="px-4 py-2 text-center font-medium">מחיר כניסה</th>
                            <th className="px-4 py-2 text-center font-medium">יציאה</th>
                            <th className="px-4 py-2 text-center font-medium">מחיר יציאה</th>
                            <th className="px-4 py-2 text-center font-medium">P&L</th>
                            <th className="px-4 py-2 text-center font-medium">החזקה</th>
                            <th className="px-4 py-2 text-center font-medium">יציאה</th>
                            <th className="px-4 py-2 text-center font-medium">תוצאה</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B]/40">
                          {rows.map(sig => {
                            const reason = exitReasonLabel(sig.exit_reason);
                            return (
                              <tr key={sig.id}>
                                <td className="px-4 py-3 text-right font-bold text-[#F8FAFC] text-sm">{sig.ticker}</td>
                                <td className="px-4 py-3 text-right text-[#64748B]">{sig.strategy_name}</td>
                                <td className="px-4 py-3 text-center font-mono text-[#94A3B8]">{sig.entry_time_et}</td>
                                <td className="px-4 py-3 text-center font-mono text-[#F8FAFC]">${sig.entry_price.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center font-mono text-[#94A3B8]">{sig.exit_time ?? "—"}</td>
                                <td className="px-4 py-3 text-center font-mono">{sig.exit_price != null ? `$${sig.exit_price.toFixed(2)}` : "—"}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn("font-bold text-sm", sig.dollars_gain == null ? "text-[#64748B]" : sig.dollars_gain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                    {dollars(sig.dollars_gain)}
                                  </span>
                                  {sig.return_pct != null && <div className="text-[10px] text-[#475569] mt-0.5">{pct(sig.return_pct)}</div>}
                                </td>
                                <td className="px-4 py-3 text-center text-[#64748B]">{sig.hold_minutes != null ? `${sig.hold_minutes}m` : "—"}</td>
                                <td className="px-4 py-3 text-center">{reason ? <span className={cn("font-semibold", reason.color)}>{reason.label}</span> : "—"}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusColor(sig.status))}>{statusLabel(sig.status)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, rows]) => {
              const dayWins    = rows.filter(r => r.status === "win").length;
              const dayLosses  = rows.filter(r => r.status === "loss").length;
              const dayDollars = rows.reduce((a, r) => a + (r.dollars_gain ?? 0), 0);

              return (
                <div key={day} className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
                  {/* Day header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-[#0D1117] border-b border-[#1E293B]">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#F8FAFC]">{formatDate(day)}</span>
                      <span className="text-xs text-[#475569]">{rows.length} עסקאות</span>
                      {dayWins   > 0 && <span className="text-xs text-emerald-400">{dayWins}W</span>}
                      {dayLosses > 0 && <span className="text-xs text-rose-400">{dayLosses}L</span>}
                    </div>
                    <span className={cn("text-sm font-bold", dayDollars >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {dollars(dayDollars)}
                    </span>
                  </div>

                  {/* Trades table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[#475569] border-b border-[#1E293B]/60">
                          <th className="px-4 py-2 text-right font-medium">מניה</th>
                          <th className="px-4 py-2 text-right font-medium">אסטרטגיה</th>
                          <th className="px-4 py-2 text-center font-medium">כניסה</th>
                          <th className="px-4 py-2 text-center font-medium">מחיר כניסה</th>
                          <th className="px-4 py-2 text-center font-medium">יציאה</th>
                          <th className="px-4 py-2 text-center font-medium">מחיר יציאה</th>
                          <th className="px-4 py-2 text-center font-medium">רווח/הפסד</th>
                          <th className="px-4 py-2 text-center font-medium">החזקה</th>
                          <th className="px-4 py-2 text-center font-medium">סיבה</th>
                          <th className="px-4 py-2 text-center font-medium">תוצאה</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B]/40">
                        {rows.map(sig => {
                          const reason = exitReasonLabel(sig.exit_reason);
                          return (
                            <tr key={sig.id} className="hover:bg-[#131A26]/60 transition-colors">
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-[#F8FAFC] text-sm">{sig.ticker}</span>
                                {sig.rvol != null && (
                                  <span className="ml-1.5 text-[10px] text-[#475569]">RVOL {sig.rvol.toFixed(1)}x</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-[#64748B] max-w-[140px] truncate">{sig.strategy_name}</td>
                              <td className="px-4 py-3 text-center font-mono text-[#94A3B8]">
                                {sig.entry_time_et || "—"}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-[#F8FAFC]">
                                ${sig.entry_price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-[#94A3B8]">
                                {sig.exit_time || "—"}
                              </td>
                              <td className="px-4 py-3 text-center font-mono">
                                {sig.exit_price != null
                                  ? <span className="text-[#F8FAFC]">${sig.exit_price.toFixed(2)}</span>
                                  : <span className="text-[#475569]">—</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn(
                                  "font-bold text-sm",
                                  sig.dollars_gain == null ? "text-[#64748B]"
                                    : sig.dollars_gain >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}>
                                  {dollars(sig.dollars_gain)}
                                </span>
                                {sig.return_pct != null && (
                                  <div className="text-[10px] text-[#475569] mt-0.5">{pct(sig.return_pct)}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-[#64748B]">
                                {sig.hold_minutes != null ? `${sig.hold_minutes}m` : "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {reason
                                  ? <span className={cn("font-semibold", reason.color)}>{reason.label}</span>
                                  : <span className="text-[#475569]">—</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  statusColor(sig.status)
                                )}>
                                  {statusLabel(sig.status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalOpen > 0 && (
          <p className="mt-4 text-center text-xs text-[#475569]">
            <Clock className="inline h-3 w-3 mr-1" />
            {totalOpen} עסקאות פתוחות — יסגרו אוטומטית בסוף יום המסחר
          </p>
        )}
      </div>
    </div>
  );
}
