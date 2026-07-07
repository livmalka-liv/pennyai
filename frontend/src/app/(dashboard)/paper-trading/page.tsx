"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, ReferenceDot,
  ResponsiveContainer, Tooltip
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, Clock, Zap,
  Activity, ChevronDown, ChevronUp, Film
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPaperDashboard, getTradeCandles,
  type PaperDashboard, type PaperTradeRow, type PaperTradeStat, type CandleBar
} from "@/lib/api";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDollar(v: number | null, sign = true) {
  if (v == null) return "—";
  const s = sign && v >= 0 ? "+" : "";
  return `${s}$${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v: number | null) {
  if (v == null) return "";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function holdStr(m: number | null) {
  if (!m) return null;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function statusColors(s: PaperTradeRow["status"]) {
  if (s === "win")  return { border: "border-emerald-500/40", bg: "bg-emerald-500/5",  text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (s === "loss") return { border: "border-rose-500/40",    bg: "bg-rose-500/5",     text: "text-rose-400",    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (s === "open") return { border: "border-yellow-500/40",  bg: "bg-yellow-500/5",   text: "text-yellow-400",  badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return               { border: "border-slate-700",          bg: "bg-slate-800/30",   text: "text-slate-400",   badge: "bg-slate-700 text-slate-400 border-slate-600" };
}

// ── Sparkline chart per trade ─────────────────────────────────────────────────

function TradeChart({ trade }: { trade: PaperTradeRow }) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getTradeCandles(trade.ticker, trade.trade_date)
      .then(setCandles)
      .catch(() => setCandles([]))
      .finally(() => setLoading(false));
  }, [trade.ticker, trade.trade_date]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-4 w-4 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!candles.length) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-slate-600">
        נתוני גרף לא זמינים
      </div>
    );
  }

  // Find entry candle index
  const entryIdx = candles.findIndex(c => c.time >= (trade.entry_time_et ?? ""));
  const exitIdx  = trade.exit_time ? candles.findIndex(c => c.time >= trade.exit_time!) : -1;

  // Price range for Y axis
  const prices = candles.flatMap(c => [c.low, c.high]);
  if (trade.tp_price) prices.push(trade.tp_price);
  if (trade.sl_price) prices.push(trade.sl_price);
  if (trade.current_price) prices.push(trade.current_price);
  const minP = Math.min(...prices) * 0.998;
  const maxP = Math.max(...prices) * 1.002;

  const entryCandle = entryIdx >= 0 ? candles[entryIdx] : null;
  const exitCandle  = exitIdx  >= 0 ? candles[exitIdx]  : null;
  const lastCandle  = candles[candles.length - 1];

  const data = candles.map(c => ({ time: c.time, close: c.close }));

  const lineColor = trade.status === "win" ? "#10b981"
                  : trade.status === "loss" ? "#f43f5e"
                  : trade.status === "open" ? "#facc15"
                  : "#64748b";

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${trade.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#475569" }} interval="preserveStartEnd" />
          <YAxis domain={[minP, maxP]} tick={{ fontSize: 9, fill: "#475569" }} width={48}
                 tickFormatter={v => `$${v.toFixed(2)}`} />
          <Tooltip
            contentStyle={{ background: "#0d1117", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [`$${v.toFixed(3)}`, "מחיר"]}
          />

          {/* TP line */}
          {trade.tp_price && (
            <ReferenceLine y={trade.tp_price} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1.5}
              label={{ value: `TP $${trade.tp_price.toFixed(2)}`, position: "insideTopRight", fontSize: 9, fill: "#10b981" }} />
          )}

          {/* SL line */}
          {trade.sl_price && (
            <ReferenceLine y={trade.sl_price} stroke="#f43f5e" strokeDasharray="4 3" strokeWidth={1.5}
              label={{ value: `SL $${trade.sl_price.toFixed(2)}`, position: "insideBottomRight", fontSize: 9, fill: "#f43f5e" }} />
          )}

          {/* Entry line */}
          {entryCandle && (
            <ReferenceLine x={entryCandle.time} stroke="#6366f1" strokeDasharray="3 3" strokeWidth={1} />
          )}

          {/* Entry dot */}
          {entryCandle && (
            <ReferenceDot x={entryCandle.time} y={trade.entry_price} r={5}
              fill="#6366f1" stroke="#1e293b" strokeWidth={2} />
          )}

          {/* Exit dot */}
          {exitCandle && trade.exit_price && (
            <ReferenceDot x={exitCandle.time} y={trade.exit_price} r={5}
              fill={trade.status === "win" ? "#10b981" : "#f43f5e"}
              stroke="#1e293b" strokeWidth={2} />
          )}

          {/* Current price dot (open trades) */}
          {trade.status === "open" && trade.current_price && (
            <ReferenceDot x={lastCandle.time} y={trade.current_price} r={4}
              fill="#facc15" stroke="#1e293b" strokeWidth={2} />
          )}

          <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={1.5}
            fill={`url(#grad-${trade.id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Entry label */}
      <div className="absolute bottom-6 left-2 flex items-center gap-1">
        <span className="text-[9px] font-bold text-indigo-400">▲ ENTRY ${trade.entry_price.toFixed(2)}</span>
        <span className="text-[9px] text-slate-500">{trade.entry_time_et} ET</span>
      </div>

      {/* Exit label */}
      {trade.exit_price && trade.exit_time && (
        <div className="absolute bottom-6 right-2 flex items-center gap-1">
          <span className={cn("text-[9px] font-bold", trade.status === "win" ? "text-emerald-400" : "text-rose-400")}>
            ▼ EXIT ${trade.exit_price.toFixed(2)}
          </span>
          <span className="text-[9px] text-slate-500">{trade.exit_time} ET</span>
        </div>
      )}

      {/* Live price label */}
      {trade.status === "open" && trade.current_price && (
        <div className="absolute top-2 right-2">
          <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400">
            ● ${trade.current_price.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Strategy stat card ────────────────────────────────────────────────────────

function StratCard({ s, active }: { s: PaperTradeStat; active: boolean }) {
  const total = s.wins + s.losses;
  const winPct = total > 0 ? s.wins / total : 0;
  const pnlColor = s.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all cursor-default",
      active
        ? "border-indigo-500/40 bg-indigo-500/5"
        : "border-slate-700/60 bg-slate-800/20 hover:border-slate-600"
    )}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className="text-xs font-semibold text-slate-200 leading-tight">{s.name}</span>
        {s.open > 0 && (
          <span className="shrink-0 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400">
            {s.open} פתוח
          </span>
        )}
      </div>

      {/* Win bar */}
      <div className="mb-2 h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${winPct * 100}%` }} />
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400">
          {total > 0 ? `${s.wins}W / ${s.losses}L` : s.open > 0 ? `${s.open} פתוח` : "אין עסקאות"}
        </span>
        <span className={cn("font-bold", pnlColor)}>
          {fmtDollar(s.total_pnl)}
        </span>
      </div>

      {total > 0 && (
        <div className="mt-1 text-center text-[11px] font-bold text-slate-300">
          {s.win_rate.toFixed(0)}% WIN
        </div>
      )}
    </div>
  );
}

// ── Trade card ────────────────────────────────────────────────────────────────

function TradeCard({ trade }: { trade: PaperTradeRow }) {
  const [expanded, setExpanded] = useState(trade.status === "open");
  const c = statusColors(trade.status);

  const pnlValue = trade.status === "open" ? trade.live_pnl : trade.dollars_gain;
  const pnlPct   = trade.status === "open" ? trade.live_pnl_pct : trade.return_pct;
  const isPos    = (pnlValue ?? 0) >= 0;

  const videoUrl = `http://localhost:8765/${trade.trade_date}/${trade.status.toUpperCase()}/${trade.ticker}_${(trade.entry_time_et ?? "").replace(":", "-")}_clip.mp4`;

  return (
    <div className={cn("rounded-xl border transition-all", c.border, c.bg)}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status badge */}
        <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold", c.badge)}>
          {trade.status === "open" ? "LIVE" : trade.status.toUpperCase()}
        </span>

        {/* Ticker + strategy */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-100">{trade.ticker}</span>
            <span className="text-[10px] text-slate-500">{trade.strategy_name}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
            <span>{trade.trade_date}</span>
            <span>·</span>
            <span>{trade.entry_time_et} ET</span>
            {trade.hold_minutes && <><span>·</span><span>{holdStr(trade.hold_minutes)}</span></>}
            {trade.rvol && <><span>·</span><span>RVOL {trade.rvol.toFixed(1)}x</span></>}
          </div>
        </div>

        {/* P&L */}
        <div className="text-right shrink-0">
          {pnlValue != null ? (
            <>
              <div className={cn("text-sm font-bold", isPos ? "text-emerald-400" : "text-rose-400")}>
                {fmtDollar(pnlValue)}
              </div>
              <div className={cn("text-[10px]", isPos ? "text-emerald-500" : "text-rose-500")}>
                {fmtPct(pnlPct)}
              </div>
            </>
          ) : (
            <span className="text-[10px] text-slate-600">ממתין</span>
          )}
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-slate-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded: prices + chart */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-3 pb-3">
          {/* Price row */}
          <div className="flex items-center gap-3 py-2 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">כניסה</span>
              <span className="font-semibold text-indigo-400">${trade.entry_price.toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">TP</span>
              <span className="font-semibold text-emerald-400">${trade.tp_price?.toFixed(3) ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">SL</span>
              <span className="font-semibold text-rose-400">${trade.sl_price?.toFixed(3) ?? "—"}</span>
            </div>
            {trade.slippage_entry_cents != null && (
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-slate-500">slip</span>
                <span className="text-slate-400">{trade.slippage_entry_cents.toFixed(1)}¢</span>
              </div>
            )}
            {trade.exit_reason && (
              <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold border",
                trade.exit_reason === "TP" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
              )}>
                {trade.exit_reason}
              </span>
            )}
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 overflow-hidden">
            <TradeChart trade={trade} />
          </div>

          {/* Video button */}
          <div className="mt-2 flex items-center gap-2">
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <Film className="h-3.5 w-3.5" />
              📹 צפה בסרטון IBKR
            </a>
            {trade.status === "open" && trade.current_price && (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-[10px] text-yellow-400 font-medium">
                  ${trade.current_price.toFixed(3)} עכשיו
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PaperTradingPage() {
  const [data, setData] = useState<PaperDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [days, setDays] = useState(30);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await getPaperDashboard(days);
      setData(d);
      setLastUpdate(new Date());
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  const openTrades  = data?.trades.filter(t => t.status === "open") ?? [];
  const closedTrades = data?.trades.filter(t => t.status !== "open") ?? [];
  const todayPnl = closedTrades
    .filter(t => t.trade_date === new Date().toISOString().slice(0, 10))
    .reduce((sum, t) => sum + (t.dollars_gain ?? 0), 0);
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.dollars_gain ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">Paper Trading Lab</h1>
              <span className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-400">
                <Activity className="h-3 w-3" />
                לייב על נתוני שוק אמיתיים
              </span>
              {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-600" />}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              עסקאות וירטואליות · slippage מחושב · עד 15 אסטרטגיות במקביל
              {lastUpdate && ` · עדכון אחרון ${lastUpdate.toLocaleTimeString("he-IL")}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Days filter */}
            {([7, 14, 30] as const).map(d => (
              <button key={d}
                onClick={() => setDays(d)}
                className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  days === d
                    ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-400"
                    : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                )}>
                {d}d
              </button>
            ))}
            <button onClick={() => load()}
              className="rounded-lg border border-slate-700 p-1.5 text-slate-500 hover:border-slate-600 hover:text-slate-400 transition-all">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Summary bar ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "עסקאות פתוחות", value: data?.total_open ?? 0, color: "text-yellow-400", sub: "עכשיו" },
            { label: "עסקאות היום", value: data?.total_today ?? 0, color: "text-indigo-400", sub: "כולן" },
            { label: "P&L היום", value: fmtDollar(todayPnl), color: todayPnl >= 0 ? "text-emerald-400" : "text-rose-400", sub: "נטו" },
            { label: `P&L ${days}d`, value: fmtDollar(totalPnl), color: totalPnl >= 0 ? "text-emerald-400" : "text-rose-400", sub: "סה״כ" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-3">
              <div className="text-[10px] text-slate-500 mb-1">{s.label}</div>
              <div className={cn("text-lg font-bold", s.color)}>{s.value}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Strategy matrix ── */}
        {data?.strategy_stats && data.strategy_stats.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              ביצועי אסטרטגיות
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.strategy_stats.map(s => (
                <StratCard key={s.name} s={s} active={s.open > 0} />
              ))}
            </div>
          </section>
        )}

        {/* ── Open trades ── */}
        {openTrades.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                עסקאות פתוחות ({openTrades.length})
              </h2>
            </div>
            <div className="space-y-3">
              {openTrades.map(t => <TradeCard key={t.id} trade={t} />)}
            </div>
          </section>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-500 mx-auto mb-3" />
              <p className="text-sm text-slate-500">טוען נתוני Paper Lab...</p>
            </div>
          </div>
        )}

        {/* ── No data ── */}
        {!loading && data && data.trades.length === 0 && (
          <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 py-16 text-center">
            <Zap className="h-8 w-8 text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">אין עסקאות ב-{days} הימים האחרונים</p>
            <p className="text-xs text-slate-600 mt-1">הפעל אסטרטגיות ב-Live Lab כדי להתחיל</p>
          </div>
        )}

        {/* ── Trade history ── */}
        {closedTrades.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              היסטוריה ({closedTrades.length} עסקאות)
            </h2>
            <div className="space-y-2">
              {closedTrades.map(t => <TradeCard key={t.id} trade={t} />)}
            </div>
          </section>
        )}

        {/* ── Bottom note ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-center">
          <p className="text-[11px] text-slate-600">
            כל העסקאות הן <span className="text-slate-400 font-medium">וירטואליות בלבד</span> · מחיר כניסה כולל slippage אמיתי (half bid-ask spread + $0.02/מניה floor) ·
            גודל פוזיציה סטנדרטי: <span className="text-slate-400">$1,000</span> · TP/SL נמדד על נתוני שוק חיים
          </p>
        </div>

      </div>
    </div>
  );
}
