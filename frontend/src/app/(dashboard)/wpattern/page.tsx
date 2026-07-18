"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { RefreshCw, Zap, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getWPatternState, getWPatternCandles, triggerWPatternScan,
  getOvernightAlerts,
  type WState, type WSignal, type WUniverseItem, type WZone, type CandleBar,
  type OvernightAlert,
} from "@/lib/api";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toFixed(4);
}

function fmtPrice(v: number) {
  return `$${v.toFixed(3)}`;
}

// ── Mini chart showing 1-min candles + zone lines ─────────────────────────────

function ZoneChart({ ticker, signal }: { ticker: string; signal: WSignal }) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getWPatternCandles(ticker)
      .then((d) => {
        // Show last 90 bars max
        const last = d.candles.slice(-90);
        setCandles(last.map((c) => ({ ...c, close: c.close })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <div className="h-36 flex items-center justify-center text-[#64748B] text-xs">טוען...</div>;
  if (!candles.length) return null;

  const data = candles.map((c, i) => ({ i, price: c.close }));
  const prices = candles.map((c) => c.close);
  const minP = Math.min(...prices) * 0.998;
  const maxP = Math.max(...prices) * 1.002;

  return (
    <div className="h-36 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`wg-${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis domain={[minP, maxP]} hide />
          <Tooltip
            contentStyle={{ background: "#0D1117", border: "1px solid #1E293B", borderRadius: 6, fontSize: 10 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => `$${Number(v).toFixed(3)}`}
            labelFormatter={() => ""}
          />
          <Area dataKey="price" stroke="#6366F1" strokeWidth={1.5} fill={`url(#wg-${ticker})`} dot={false} />
          {/* Mid zone */}
          <ReferenceLine y={signal.mid_zone} stroke="#F59E0B" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Mid", fill: "#F59E0B", fontSize: 9, position: "left" }} />
          {/* Entry */}
          <ReferenceLine y={signal.entry}    stroke="#10B981" strokeDasharray="3 2" strokeWidth={1} label={{ value: "Entry", fill: "#10B981", fontSize: 9, position: "right" }} />
          {/* SL */}
          <ReferenceLine y={signal.sl}       stroke="#EF4444" strokeDasharray="3 2" strokeWidth={1} label={{ value: "SL", fill: "#EF4444", fontSize: 9, position: "right" }} />
          {/* TP1 */}
          <ReferenceLine y={signal.tp1}      stroke="#34D399" strokeDasharray="2 3" strokeWidth={1} label={{ value: "TP1", fill: "#34D399", fontSize: 9, position: "right" }} />
          {/* TP2 */}
          <ReferenceLine y={signal.tp2}      stroke="#059669" strokeDasharray="2 3" strokeWidth={1} label={{ value: "TP2", fill: "#059669", fontSize: 9, position: "right" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Order Ticket ──────────────────────────────────────────────────────────────

function OrderTicket({ signal }: { signal: WSignal }) {
  const riskDollar = (signal.entry - signal.sl).toFixed(4);
  const rewardDollar = (signal.tp2 - signal.entry).toFixed(4);

  return (
    <div className="mt-3 rounded-lg border border-[#1E293B] bg-[#0D1117] p-3 text-xs font-mono">
      <div className="mb-2 text-[#94A3B8] font-sans font-semibold tracking-wide">כרטיס פקודה</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="text-[#64748B]">כניסה (Buy Stop)</div>
        <div className="text-[#10B981] font-bold">{fmtPrice(signal.entry)}</div>

        <div className="text-[#64748B]">SL</div>
        <div className="text-[#EF4444]">{fmtPrice(signal.sl)}</div>

        <div className="text-[#64748B]">TP1 (75%)</div>
        <div className="text-[#34D399]">{fmtPrice(signal.tp1)}</div>

        <div className="text-[#64748B]">TP2 (100%)</div>
        <div className="text-[#059669]">{fmtPrice(signal.tp2)}</div>

        <div className="text-[#64748B] mt-1 border-t border-[#1E293B] pt-1">סיכון / תגמול</div>
        <div className="text-[#F59E0B] mt-1 border-t border-[#1E293B] pt-1 font-bold">
          1 : {signal.rr_ratio.toFixed(2)}
        </div>

        <div className="text-[#64748B]">סיכון למניה</div>
        <div className="text-[#94A3B8]">${riskDollar}</div>

        <div className="text-[#64748B]">פוטנציאל</div>
        <div className="text-[#94A3B8]">${rewardDollar}</div>
      </div>

      <div className="mt-2 pt-2 border-t border-[#1E293B] grid grid-cols-3 gap-2 text-[10px] text-[#64748B]">
        <div>
          <div>B1</div>
          <div className="text-[#94A3B8]">{fmtPrice(signal.b1_low)}</div>
          <div className="text-[#475569]">{signal.b1_time.slice(11)}</div>
        </div>
        <div>
          <div>Apex</div>
          <div className="text-[#94A3B8]">{fmtPrice(signal.apex_high)}</div>
          <div className="text-[#475569]">{signal.apex_time.slice(11)}</div>
        </div>
        <div>
          <div>B2</div>
          <div className="text-[#94A3B8]">{fmtPrice(signal.b2_low)}</div>
          <div className="text-[#475569]">{signal.b2_time.slice(11)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Signal Card ────────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: WSignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      signal.triggered
        ? "border-emerald-500/40 bg-emerald-500/5"
        : "border-[#1E293B] bg-[#0D1117]"
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-[#F8FAFC] tracking-wide">{signal.ticker}</span>
          {signal.triggered ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <Zap className="h-3 w-3" /> TRIGGERED
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
              <AlertTriangle className="h-3 w-3" /> ממתין לפריצה
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[#F59E0B] text-sm font-bold">1:{signal.rr_ratio.toFixed(1)}</div>
          <div className="text-[#475569] text-[10px]">RR Ratio</div>
        </div>
      </div>

      {/* Zone label */}
      <div className="mt-1 text-[11px] text-[#64748B]">{signal.zone_label}</div>

      {/* Key prices */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5">
          <div className="text-[#10B981] font-bold">{fmtPrice(signal.entry)}</div>
          <div className="text-[#475569] text-[10px]">כניסה</div>
        </div>
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5">
          <div className="text-[#EF4444] font-bold">{fmtPrice(signal.sl)}</div>
          <div className="text-[#475569] text-[10px]">SL</div>
        </div>
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5">
          <div className="text-[#059669] font-bold">{fmtPrice(signal.tp2)}</div>
          <div className="text-[#475569] text-[10px]">TP2</div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="mt-3 w-full text-[11px] text-[#6366F1] hover:text-[#818CF8] transition-colors"
      >
        {expanded ? "הסתר פרטים ▲" : "הצג גרף + פקודה ▼"}
      </button>

      {expanded && (
        <>
          <ZoneChart ticker={signal.ticker} signal={signal} />
          <OrderTicket signal={signal} />
        </>
      )}

      <div className="mt-2 text-right text-[10px] text-[#334155]">
        זוהה: {signal.detected_at}
      </div>
    </div>
  );
}

// ── Universe Row ──────────────────────────────────────────────────────────────

function UniverseRow({ item }: { item: WUniverseItem }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0D1117] px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold text-[#F8FAFC]">{item.ticker}</span>
        {item.rvol > 5 && (
          <span className="rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#F59E0B]">
            HOT
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs">
        {item.price > 0 && <span className="text-[#94A3B8]">${item.price.toFixed(3)}</span>}
        <span className={cn("font-bold", item.gain_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {item.gain_pct >= 0 ? "+" : ""}{item.gain_pct.toFixed(1)}%
        </span>
        {item.rvol > 0 && <span className="text-[#64748B]">RVOL {item.rvol.toFixed(1)}x</span>}
      </div>
    </div>
  );
}

// ── Overnight Alert Card ──────────────────────────────────────────────────────

function OvernightCard({ alert }: { alert: OvernightAlert }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#F8FAFC]">{alert.ticker}</span>
          <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
            🌙 לילי
          </span>
        </div>
        <div className="text-right">
          <div className="text-amber-400 text-sm font-bold">×{alert.multiplier.toFixed(1)}</div>
          <div className="text-[#475569] text-[10px]">מהבסיס</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5 text-center">
          <div className="text-[#F8FAFC] font-bold">{alert.last_hour_vol.toLocaleString()}</div>
          <div className="text-[#475569] text-[10px]">מניות בשעה</div>
        </div>
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5 text-center">
          <div className="text-[#F8FAFC] font-bold">{alert.price ? `$${alert.price.toFixed(3)}` : "—"}</div>
          <div className="text-[#475569] text-[10px]">מחיר</div>
        </div>
        <div className="rounded-lg bg-[#131A26] px-2 py-1.5 text-center">
          <div className="text-[#F8FAFC] font-bold">{alert.hour_str}</div>
          <div className="text-[#475569] text-[10px]">שעה (IL)</div>
        </div>
      </div>
      <div className="mt-2 text-right text-[10px] text-[#334155]">{alert.received_at}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WPatternPage() {
  const [state, setState] = useState<WState | null>(null);
  const [overnightAlerts, setOvernightAlerts] = useState<OvernightAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, overnight] = await Promise.all([
        getWPatternState(),
        getOvernightAlerts().catch(() => ({ alerts: [], count: 0 })),
      ]);
      setState(data);
      setOvernightAlerts(overnight.alerts);
      setError(null);
    } catch (e) {
      setError("לא ניתן להתחבר לשרת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerWPatternScan();
      setTimeout(load, 3000);
    } catch {
      // best-effort
    } finally {
      setTimeout(() => setScanning(false), 3000);
    }
  };

  const signals = state?.signals ?? [];
  const triggered = signals.filter((s) => s.triggered);
  const pending = signals.filter((s) => !s.triggered);

  return (
    <div className="min-h-screen bg-[#070A0F] p-6 text-[#F8FAFC]" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">〽️ W-Pattern Breakout</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            דאבל-בוטום על מידפוינט אזורי — RR מינימום 1:3
          </p>
          {state?.last_scan && (
            <p className="mt-0.5 text-xs text-[#475569]">סריקה אחרונה: {state.last_scan}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D1117] px-3 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            רענן
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              scanning
                ? "bg-[#131A26] text-[#64748B] cursor-not-allowed"
                : "bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white hover:opacity-90"
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            {scanning ? "סורק..." : "סרוק עכשיו"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          { label: "מניות ביקום", value: state?.universe.length ?? 0, color: "text-[#6366F1]" },
          { label: "סיגנלים פעילים", value: signals.length, color: "text-[#F8FAFC]" },
          { label: "פרצות", value: triggered.length, color: "text-emerald-400" },
          { label: "ממתינים לפריצה", value: pending.length, color: "text-[#F59E0B]" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-4 text-center">
            <div className={cn("text-3xl font-bold", s.color)}>{s.value}</div>
            <div className="mt-1 text-xs text-[#64748B]">{s.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-[#64748B]">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          טוען נתונים...
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Universe panel */}
          {/* Overnight alerts */}
          {overnightAlerts.length > 0 && (
            <div className="lg:col-span-3 mb-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-400">
                🌙 התרעות ווליום לילי ({overnightAlerts.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {overnightAlerts.map((a, i) => (
                  <OvernightCard key={`${a.ticker}-${a.received_at}-${i}`} alert={a} />
                ))}
              </div>
            </div>
          )}

          <div className="lg:col-span-1">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#94A3B8]">
              <TrendingUp className="h-4 w-4" />
              יקום — מניות +10% היום ({state?.universe.length ?? 0})
            </h2>
            <div className="space-y-2">
              {(state?.universe ?? []).length === 0 ? (
                <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-6 text-center text-sm text-[#64748B]">
                  אין מניות עם +10% כרגע
                </div>
              ) : (
                (state?.universe ?? []).map((item) => (
                  <UniverseRow key={item.ticker} item={item} />
                ))
              )}
            </div>
          </div>

          {/* Signals panel */}
          <div className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#94A3B8]">
              <Zap className="h-4 w-4" />
              סיגנלי W-Pattern ({signals.length})
            </h2>

            {signals.length === 0 ? (
              <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-10 text-center">
                <div className="text-4xl mb-3">〽️</div>
                <div className="text-[#64748B] text-sm">
                  אין סיגנלים כרגע.
                  <br />
                  הסורק רץ כל דקה בשעות השוק (11:00–23:00 IL).
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Triggered first */}
                {triggered.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      <CheckCircle className="h-3.5 w-3.5" />
                      פרצות ({triggered.length})
                    </div>
                    <div className="space-y-3">
                      {triggered.map((s, i) => (
                        <SignalCard key={`${s.ticker}-${s.zone_key}-${i}`} signal={s} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending */}
                {pending.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#F59E0B] uppercase tracking-wider">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      ממתינים לפריצה ({pending.length})
                    </div>
                    <div className="space-y-3">
                      {pending.map((s, i) => (
                        <SignalCard key={`${s.ticker}-${s.zone_key}-${i}`} signal={s} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explanation footer */}
      <div className="mt-8 rounded-xl border border-[#1E293B] bg-[#0B0E14] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[#94A3B8]">איך עובד הסורק?</h3>
        <div className="grid grid-cols-1 gap-3 text-xs text-[#64748B] md:grid-cols-3">
          <div className="rounded-lg bg-[#0D1117] p-3">
            <div className="mb-1 font-semibold text-[#6366F1]">1. יקום</div>
            כל מניה עם עלייה של +10% ביום — זה המנוע של התנועה שנבנה עליה.
          </div>
          <div className="rounded-lg bg-[#0D1117] p-3">
            <div className="mb-1 font-semibold text-[#F59E0B]">2. אזורים</div>
            3 אזורי עוגן: RTH ביום קודם, extended ביום קודם, פרי-מרקט היום.
            המידפוינט של כל אזור = רמת התמיכה לחיפוש הדאבל-בוטום.
          </div>
          <div className="rounded-lg bg-[#0D1117] p-3">
            <div className="mb-1 font-semibold text-emerald-400">3. W-Pattern</div>
            B1 → Apex → B2 (B2 ≥ B1, נפח יורד) → פריצה מעל Apex בנפח ×2.5.
            תנאי RR: מינימום 1:3. SL = מינימום(B1,B2) − 1 סנט.
          </div>
        </div>
      </div>
    </div>
  );
}
