"use client";

const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

import { useState, useEffect, useCallback } from "react";
import {
  Activity, Play, Square, RefreshCw, TrendingUp, TrendingDown,
  Clock, Target, Zap, BarChart2, Award, AlertTriangle,
  ChevronRight, Brain, Lock, Radio, Sun, Sunset,
  Moon, DollarSign, CheckCircle, XCircle, MinusCircle,
  Settings, X, Save,
} from "lucide-react";
import { cn, formatPercent, formatCurrency } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type TradeStatus = "open" | "win" | "loss" | "flat";
type SessionType = "premarket" | "regular" | "afterhours";

interface Signal {
  id: string;
  ticker: string;
  strategyName: string;
  strategyId: string;
  entryTime: string;       // HH:MM Israel time
  entryTimeET: string;     // HH:MM ET
  entryPrice: number;
  currentPrice?: number;
  exitPrice?: number;
  exitTime?: string;
  tpPrice: number;
  slPrice: number;
  tpPct: number;
  slPct: number;
  returnPct?: number;
  dollarsGain?: number;
  holdMinutes?: number;
  status: TradeStatus;
  session: SessionType;
  catalyst: string;
  rvol: number;
  float: number;
  exitReason?: "take_profit" | "stop_loss" | "eod_close" | "open";
}

interface StrategyTracker {
  id: string;
  name: string;
  active: boolean;
  totalSignals: number;
  wins: number;
  losses: number;
  totalPnl: number;
  startedDaysAgo: number;
}

interface HourBucket {
  hour: string;       // "11:00", "12:00" etc Israel
  label: string;
  wins: number;
  losses: number;
  winRate: number;
  avgReturn: number;
  session: SessionType;
}

interface PriceBucket {
  range: string;
  wins: number;
  losses: number;
  winRate: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_STRATEGIES: StrategyTracker[] = [
  { id: "gap-and-go",      name: "Gap & Go",            active: true,  totalSignals: 47, wins: 22, losses: 25, totalPnl: 340,  startedDaysAgo: 21 },
  { id: "vwap-reclaim",    name: "VWAP Reclaim",        active: true,  totalSignals: 39, wins: 21, losses: 18, totalPnl: 520,  startedDaysAgo: 21 },
  { id: "bull-flag",       name: "Bull Flag Breakout",  active: true,  totalSignals: 31, wins: 18, losses: 13, totalPnl: 710,  startedDaysAgo: 21 },
  { id: "halt-resume",     name: "Halt & Resume",       active: false, totalSignals: 12, wins:  7, losses:  5, totalPnl: 280,  startedDaysAgo: 14 },
  { id: "first-green-day", name: "First Green Day",     active: false, totalSignals:  8, wins:  5, losses:  3, totalPnl: 190,  startedDaysAgo: 14 },
  { id: "red-to-green",    name: "Red to Green",        active: true,  totalSignals: 22, wins: 12, losses: 10, totalPnl: 140,  startedDaysAgo: 7  },
];

const MOCK_SIGNALS: Signal[] = [
  {
    id: "s1", ticker: "TNXP", strategyName: "Bull Flag Breakout", strategyId: "bull-flag",
    entryTime: "16:47", entryTimeET: "09:47",
    entryPrice: 2.34, currentPrice: 2.51, tpPrice: 2.81, slPrice: 2.17,
    tpPct: 20, slPct: -7, status: "open", session: "regular",
    catalyst: "FDA", rvol: 8.3, float: 5.2,
    holdMinutes: 23, exitReason: "open",
  },
  {
    id: "s2", ticker: "MULN", strategyName: "VWAP Reclaim", strategyId: "vwap-reclaim",
    entryTime: "16:23", entryTimeET: "09:23", exitTime: "17:01",
    entryPrice: 1.12, exitPrice: 1.29, tpPrice: 1.30, slPrice: 1.04,
    tpPct: 15, slPct: -5, returnPct: 15.2, dollarsGain: 144, holdMinutes: 38,
    status: "win", session: "regular", catalyst: "PR", rvol: 6.1, float: 8.2,
    exitReason: "take_profit",
  },
  {
    id: "s3", ticker: "GOVX", strategyName: "Gap & Go", strategyId: "gap-and-go",
    entryTime: "15:52", entryTimeET: "08:52",
    entryPrice: 3.88, exitPrice: 3.61, tpPrice: 4.66, slPrice: 3.61,
    tpPct: 20, slPct: -7, returnPct: -6.9, dollarsGain: -66, holdMinutes: 14,
    status: "loss", session: "premarket", catalyst: "Earnings", rvol: 12.4, float: 3.1,
    exitReason: "stop_loss",
  },
  {
    id: "s4", ticker: "PROG", strategyName: "Red to Green", strategyId: "red-to-green",
    entryTime: "19:14", entryTimeET: "12:14", exitTime: "19:52",
    entryPrice: 1.67, exitPrice: 1.92, tpPrice: 1.92, slPrice: 1.58,
    tpPct: 15, slPct: -5, returnPct: 14.9, dollarsGain: 142, holdMinutes: 38,
    status: "win", session: "regular", catalyst: "PR", rvol: 4.7, float: 14.3,
    exitReason: "take_profit",
  },
  {
    id: "s5", ticker: "CNTX", strategyName: "VWAP Reclaim", strategyId: "vwap-reclaim",
    entryTime: "18:03", entryTimeET: "11:03", exitTime: "18:41",
    entryPrice: 0.87, exitPrice: 0.81, tpPrice: 1.00, slPrice: 0.82,
    tpPct: 15, slPct: -5, returnPct: -6.8, dollarsGain: -65, holdMinutes: 38,
    status: "loss", session: "regular", catalyst: "PR", rvol: 3.2, float: 22.0,
    exitReason: "stop_loss",
  },
  {
    id: "s6", ticker: "OCGN", strategyName: "Bull Flag Breakout", strategyId: "bull-flag",
    entryTime: "13:41", entryTimeET: "06:41",
    entryPrice: 4.12, exitPrice: 4.94, tpPrice: 4.94, slPrice: 3.83,
    tpPct: 20, slPct: -7, returnPct: 19.9, dollarsGain: 189, holdMinutes: 22,
    status: "win", session: "premarket", catalyst: "FDA", rvol: 18.2, float: 2.8,
    exitReason: "take_profit",
  },
];

const HOUR_BUCKETS: HourBucket[] = [
  { hour: "11:00", label: "11-12", wins: 8,  losses: 12, winRate: 40, avgReturn: -1.2, session: "premarket"  },
  { hour: "12:00", label: "12-13", wins: 11, losses: 9,  winRate: 55, avgReturn:  1.8, session: "premarket"  },
  { hour: "13:00", label: "13-14", wins: 14, losses: 8,  winRate: 64, avgReturn:  3.1, session: "premarket"  },
  { hour: "14:00", label: "14-15", wins: 13, losses: 9,  winRate: 59, avgReturn:  2.4, session: "premarket"  },
  { hour: "15:00", label: "15-16", wins: 12, losses: 8,  winRate: 60, avgReturn:  2.7, session: "premarket"  },
  { hour: "16:00", label: "16-17", wins: 18, losses: 10, winRate: 64, avgReturn:  4.2, session: "regular"    },
  { hour: "17:00", label: "17-18", wins: 22, losses: 11, winRate: 67, avgReturn:  5.1, session: "regular"    },
  { hour: "18:00", label: "18-19", wins: 19, losses: 12, winRate: 61, avgReturn:  3.8, session: "regular"    },
  { hour: "19:00", label: "19-20", wins: 14, losses: 10, winRate: 58, avgReturn:  2.9, session: "regular"    },
  { hour: "20:00", label: "20-21", wins: 10, losses: 11, winRate: 48, avgReturn:  0.4, session: "regular"    },
  { hour: "21:00", label: "21-22", wins:  8, losses: 14, winRate: 36, avgReturn: -2.1, session: "regular"    },
  { hour: "22:00", label: "22-23", wins:  6, losses: 11, winRate: 35, avgReturn: -2.8, session: "afterhours" },
];

const PRICE_BUCKETS: PriceBucket[] = [
  { range: "$0.5-1",  wins: 9,  losses: 17, winRate: 35 },
  { range: "$1-3",    wins: 34, losses: 21, winRate: 62 },
  { range: "$3-7",    wins: 28, losses: 17, winRate: 62 },
  { range: "$7-15",   wins: 14, losses: 12, winRate: 54 },
  { range: "$15+",    wins:  8, losses: 15, winRate: 35 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sessionLabel = (s: SessionType) =>
  s === "premarket" ? "פרי-מרקט" : s === "afterhours" ? "אפטר-אוורס" : "שוק רגיל";

const sessionColor = (s: SessionType) =>
  s === "premarket" ? "text-[#F59E0B]" : s === "afterhours" ? "text-[#8B5CF6]" : "text-[#10B981]";

const sessionBg = (s: SessionType) =>
  s === "premarket" ? "bg-[#F59E0B]/10 border-[#F59E0B]/25" : s === "afterhours" ? "bg-[#8B5CF6]/10 border-[#8B5CF6]/25" : "bg-[#10B981]/10 border-[#10B981]/25";

const sessionIcon = (s: SessionType) =>
  s === "premarket" ? Sun : s === "afterhours" ? Moon : Sunset;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveLabPage() {
  const [isRunning, setIsRunning] = useState(true);
  const [strategies, setStrategies] = useState<StrategyTracker[]>(MOCK_STRATEGIES);
  const [signals, setSignals] = useState<Signal[]>(MOCK_SIGNALS);
  const [lastScan, setLastScan] = useState("—");
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<"signals" | "heatmap">("signals");
  const [israelTime, setIsraelTime] = useState("");
  const [demoMode, setDemoMode] = useState(true); // true until real data arrives
  const [showSettings, setShowSettings] = useState(false);
  const [scanSettings, setScanSettings] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("livelab_settings");
      if (saved) return JSON.parse(saved);
    }
    return { startHour: "11", endHour: "23", intervalSec: "30", testingDays: "90" };
  });
  const [pendingSettings, setPendingSettings] = useState(scanSettings);

  // Update Israel clock
  useEffect(() => {
    const tick = () => {
      const t = new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setIsraelTime(t);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Load real data from backend
  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, signalsRes] = await Promise.all([
          fetch(`${API}/live-lab/status`),
          fetch(`${API}/live-lab/signals?days=1`),
        ]);
        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status.strategies?.length) {
            setStrategies(status.strategies.map((s: any) => ({
              id: s.id, name: s.name, active: s.active,
              totalSignals: s.total_signals, wins: s.wins,
              losses: s.losses, totalPnl: s.total_pnl,
              startedDaysAgo: status.days_of_data ?? 0,
            })));
          }
        }
        if (signalsRes.ok) {
          const raw: any[] = await signalsRes.json();
          if (raw.length > 0) {
            setDemoMode(false);
            setSignals(raw.map(t => ({
              id: t.id, ticker: t.ticker,
              strategyName: t.strategy_name, strategyId: t.strategy_id,
              entryTime: t.entry_time, entryTimeET: t.entry_time_et,
              exitTime: t.exit_time,
              entryPrice: t.entry_price, exitPrice: t.exit_price,
              currentPrice: t.exit_price ?? t.entry_price,
              tpPrice: t.tp_price, slPrice: t.sl_price,
              tpPct: 15, slPct: -5,
              returnPct: t.return_pct, dollarsGain: t.dollars_gain,
              holdMinutes: t.hold_minutes,
              status: t.status as TradeStatus,
              session: (t.session ?? "regular") as SessionType,
              catalyst: t.catalyst ?? "—",
              rvol: t.rvol ?? 0, float: (t.float_shares ?? 0) / 1e6,
              exitReason: t.exit_reason,
            })));
            const now = new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
            setLastScan(now);
          }
        }
      } catch {
        // backend offline — keep mock data
      }
    };
    load();
    const iv = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(iv);
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`${API}/live-lab/scan-now`, { method: "POST" });
    } catch {}
    setTimeout(() => {
      setScanning(false);
      const now = new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
      setLastScan(now);
    }, 2000);
  }, []);

  const FREE_LIMIT = 3;
  const [upgradePrompt, setUpgradePrompt] = useState(false);

  const toggleStrategy = async (id: string) => {
    const current = strategies.find(s => s.id === id);
    if (!current) return;
    const turningOn = !current.active;
    const activeCount2 = strategies.filter(s => s.active).length;

    if (turningOn && activeCount2 >= FREE_LIMIT) {
      setUpgradePrompt(true);
      return;
    }

    setStrategies(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    try {
      await fetch(`${API}/live-lab/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: id, active: turningOn }),
      });
    } catch {}
  };

  const activeCount = strategies.filter(s => s.active).length;
  const totalPnl = strategies.filter(s => s.active).reduce((sum, s) => sum + s.totalPnl, 0);
  const totalTrades = strategies.filter(s => s.active).reduce((sum, s) => sum + s.totalSignals, 0);
  const totalWins = strategies.filter(s => s.active).reduce((sum, s) => sum + s.wins, 0);
  const overallWr = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
  const daysOfData = 21;
  const testingGoalDays = parseInt(scanSettings.testingDays ?? "90");
  const testingProgress = Math.min(100, (daysOfData / testingGoalDays) * 100);
  const coachUnlocked = daysOfData >= testingGoalDays;

  // Session now
  const hour = new Date().getHours(); // local — simplified
  const nowSession: SessionType = hour < 16 ? "premarket" : hour < 23 ? "regular" : "afterhours";

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col bg-[#0B0E14] overflow-hidden">
      {/* ── Top Status Bar ── */}
      <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-2.5 shrink-0 bg-[#0F1520]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", isRunning ? "bg-[#10B981] animate-pulse" : "bg-[#64748B]")} />
            <span className="text-sm font-semibold text-[#F8FAFC]">Live Lab</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", isRunning ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/25" : "text-[#64748B] bg-[#64748B]/10 border-[#64748B]/25")}>
              {isRunning ? "פעיל" : "מושהה"}
            </span>
          </div>
          <div className="h-4 w-px bg-[#1E293B]" />
          <span className="text-xs text-[#64748B]">
            שעון ישראל: <span className="font-mono text-[#F8FAFC]">{israelTime}</span>
          </span>
          <div className="h-4 w-px bg-[#1E293B]" />
          <span className={cn("text-xs font-medium flex items-center gap-1", sessionColor(nowSession))}>
            {nowSession === "premarket" ? <Sun className="h-3 w-3" /> : nowSession === "afterhours" ? <Moon className="h-3 w-3" /> : <Sunset className="h-3 w-3" />}
            {sessionLabel(nowSession)}
          </span>
          <div className="h-4 w-px bg-[#1E293B]" />
          <span className="text-xs text-[#64748B]">
            {activeCount} אסטרטגיות פעילות · סקן אחרון: <span className="text-[#94A3B8]">{lastScan}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPendingSettings(scanSettings); setShowSettings(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-1.5 text-xs font-medium text-[#94A3B8] hover:border-[#6366F1]/40 hover:text-[#F8FAFC] transition-all"
          >
            <Settings className="h-3.5 w-3.5" />
            {scanSettings.startHour}:00–{scanSettings.endHour}:00 · כל {parseInt(scanSettings.intervalSec) < 60 ? `${scanSettings.intervalSec}ש` : `${Math.round(parseInt(scanSettings.intervalSec)/60)}′`}
          </button>
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-1.5 text-xs font-medium text-[#94A3B8] hover:border-[#6366F1]/40 hover:text-[#F8FAFC] transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            {scanning ? "סורק..." : "סקן עכשיו"}
          </button>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              isRunning
                ? "bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/20"
                : "bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/20"
            )}
          >
            {isRunning ? <><Square className="h-3.5 w-3.5" /> עצור</> : <><Play className="h-3.5 w-3.5" /> הפעל</>}
          </button>
        </div>
      </div>

      {/* Demo mode notice */}
      {demoMode && (
        <div className="flex items-center gap-2 border-b border-[#F59E0B]/20 bg-[#F59E0B]/5 px-5 py-2 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
          <p className="text-xs text-[#F59E0B]">
            <span className="font-semibold">מצב דמו</span> — מוצגים נתונים לדוגמה. כשהסורק יאתר עסקאות אמיתיות הן יוצגו כאן אוטומטית.
          </p>
        </div>
      )}

      {/* ── 3-Column Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT COLUMN: Strategies ── */}
        <aside className="w-72 shrink-0 flex flex-col border-r border-[#1E293B] overflow-y-auto">
          <div className="px-4 py-3 border-b border-[#1E293B] shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6366F1] flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> אסטרטגיות פעילות
            </p>
          </div>

          <div className="flex-1 p-3 space-y-2 overflow-y-auto">
            {/* Free tier indicator */}
            <div className="flex items-center justify-between text-[10px] text-[#64748B] px-1 pb-1">
              <span>{strategies.filter(s => s.active).length}/{FREE_LIMIT} חינמיות פעילות</span>
              <span className="text-[#6366F1] font-medium cursor-pointer hover:underline" onClick={() => setUpgradePrompt(true)}>
                שדרג →
              </span>
            </div>

            {strategies.map((s, idx) => {
              const wr = s.totalSignals > 0 ? (s.wins / s.totalSignals * 100) : 0;
              const activeStrategies = strategies.filter(str => str.active);
              const isLocked = !s.active && activeStrategies.length >= FREE_LIMIT;
              const courseReady = wr >= 55 && s.totalSignals >= 20;

              return (
                <div key={s.id} className={cn(
                  "rounded-xl border p-3 transition-all",
                  isLocked ? "border-[#1E293B]/50 bg-[#0A0D14] opacity-60" :
                  s.active ? "border-[#6366F1]/30 bg-[#6366F1]/5" : "border-[#1E293B] bg-[#0F1520]"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC] truncate pr-2">{s.name}</span>
                    {isLocked ? (
                      <button
                        onClick={() => setUpgradePrompt(true)}
                        className="flex items-center gap-1 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/25 px-2 py-0.5 text-[9px] text-[#F59E0B] font-semibold"
                      >
                        <Lock className="h-2.5 w-2.5" /> PRO
                      </button>
                    ) : (
                      <div
                        onClick={() => toggleStrategy(s.id)}
                        className={cn(
                          "relative h-5 w-9 rounded-full transition-colors shrink-0 cursor-pointer",
                          s.active ? "bg-[#6366F1]" : "bg-[#334155]"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                          s.active ? "translate-x-4" : "translate-x-0.5"
                        )} />
                      </div>
                    )}
                  </div>

                  {s.totalSignals > 0 && (
                    <div className="grid grid-cols-3 gap-1 text-center mb-2">
                      <div>
                        <p className={cn("text-sm font-bold tabular-nums", wr >= 50 ? "text-[#10B981]" : "text-[#EF4444]")}>{wr.toFixed(0)}%</p>
                        <p className="text-[9px] text-[#64748B]">WR</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#F8FAFC] tabular-nums">{s.totalSignals}</p>
                        <p className="text-[9px] text-[#64748B]">סיגנלים</p>
                      </div>
                      <div>
                        <p className={cn("text-sm font-bold tabular-nums", s.totalPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                          {s.totalPnl >= 0 ? "+" : ""}${s.totalPnl}
                        </p>
                        <p className="text-[9px] text-[#64748B]">P&L</p>
                      </div>
                    </div>
                  )}

                  {/* Build Course button */}
                  {courseReady && s.active && (
                    <a
                      href={`/course/${s.id}`}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-gradient-to-r from-[#6366F1]/20 to-[#8B5CF6]/20 border border-[#6366F1]/30 py-1.5 text-[10px] font-bold text-[#A5B4FC] hover:from-[#6366F1]/30 hover:to-[#8B5CF6]/30 transition-all mt-1"
                    >
                      <Brain className="h-3 w-3" /> בנה קורס AI
                      <span className="text-[#64748B] font-normal">({wr.toFixed(0)}% WR)</span>
                    </a>
                  )}
                  {!courseReady && s.active && s.totalSignals > 0 && (
                    <div className="text-[9px] text-[#475569] text-center mt-1">
                      צריך {Math.max(0, 20 - s.totalSignals)} עסקאות נוספות לפתיחת קורס
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Session Schedule */}
          <div className="p-3 border-t border-[#1E293B] space-y-1.5 shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2">לוח זמנים יומי</p>
            {[
              { icon: Sun,    color: "text-[#F59E0B]", time: "11:00-16:30", label: "פרי-מרקט" },
              { icon: Sunset, color: "text-[#10B981]", time: "16:30-23:00", label: "שוק רגיל" },
              { icon: Moon,   color: "text-[#8B5CF6]", time: "23:00-03:00", label: "אפטר-אוורס" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <row.icon className={cn("h-3 w-3 shrink-0", row.color)} />
                <span className="text-[10px] text-[#64748B] font-mono">{row.time}</span>
                <span className="text-[10px] text-[#94A3B8]">{row.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── CENTER COLUMN: Signal Feed ── */}
        <main className="flex-1 flex flex-col overflow-hidden border-r border-[#1E293B]">
          {/* Center header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B] shrink-0">
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#6366F1] flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" /> סיגנלים היום
              </p>
              <span className="text-xs text-[#64748B]">{signals.length} עסקאות</span>
            </div>
            <div className="flex gap-1">
              {(["signals", "heatmap"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                    activeTab === tab ? "bg-[#6366F1] text-white" : "text-[#64748B] hover:text-[#94A3B8]"
                  )}
                >
                  {tab === "signals" ? "סיגנלים" : "מפת חום"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {activeTab === "signals" && signals.map(sig => (
              <SignalCard key={sig.id} signal={sig} />
            ))}

            {activeTab === "heatmap" && (
              <div className="space-y-4">
                {/* Hour heatmap */}
                <div className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-4">
                  <p className="text-xs font-semibold text-[#F8FAFC] mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#6366F1]" /> ביצועים לפי שעה (שעון ישראל)
                  </p>
                  <div className="space-y-1.5">
                    {HOUR_BUCKETS.map(b => {
                      const total = b.wins + b.losses;
                      const barW = Math.min(Math.abs(b.winRate - 50) * 2, 100);
                      const Icon = sessionIcon(b.session);
                      return (
                        <div key={b.hour} className="flex items-center gap-2">
                          <div className="flex items-center gap-1 w-14 shrink-0">
                            <Icon className={cn("h-2.5 w-2.5 shrink-0", sessionColor(b.session))} />
                            <span className="text-[10px] font-mono text-[#64748B]">{b.label}</span>
                          </div>
                          <div className="flex-1 h-5 bg-[#1E293B] rounded relative overflow-hidden">
                            <div
                              className={cn("h-full rounded transition-all", b.winRate >= 55 ? "bg-[#10B981]/40" : b.winRate >= 45 ? "bg-[#F59E0B]/40" : "bg-[#EF4444]/40")}
                              style={{ width: `${b.winRate}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-[#F8FAFC] font-medium">
                              {b.winRate}% WR · {total} עסקאות
                            </span>
                          </div>
                          <span className={cn("text-[10px] font-bold tabular-nums w-10 text-right", b.avgReturn >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                            {b.avgReturn >= 0 ? "+" : ""}{b.avgReturn}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Price bucket heatmap */}
                <div className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-4">
                  <p className="text-xs font-semibold text-[#F8FAFC] mb-3 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-[#10B981]" /> ביצועים לפי טווח מחיר
                  </p>
                  <div className="space-y-2">
                    {PRICE_BUCKETS.map(b => {
                      const total = b.wins + b.losses;
                      return (
                        <div key={b.range} className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-[#94A3B8] w-14 shrink-0">{b.range}</span>
                          <div className="flex-1 h-6 bg-[#1E293B] rounded relative overflow-hidden">
                            <div
                              className={cn("h-full rounded", b.winRate >= 55 ? "bg-[#10B981]/40" : b.winRate >= 45 ? "bg-[#F59E0B]/40" : "bg-[#EF4444]/40")}
                              style={{ width: `${b.winRate}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-[#F8FAFC] font-medium">
                              {b.winRate}% WR &nbsp;·&nbsp; {b.wins}W/{b.losses}L
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-[#64748B]">
                    💡 מניות בטווח $1-7 מראות תוצאות הטובות ביותר (62% WR)
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT COLUMN: Analytics ── */}
        <aside className="w-80 shrink-0 flex flex-col overflow-y-auto">
          <div className="px-4 py-3 border-b border-[#1E293B] shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6366F1] flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" /> ביצועים מצטברים
            </p>
          </div>

          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            {/* Testing period progress */}
            <div className="rounded-xl border border-[#6366F1]/25 bg-[#6366F1]/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-[#6366F1] uppercase tracking-wider">תקופת בדיקה</p>
                <span className="text-[10px] text-[#94A3B8]">
                  יום {daysOfData} מתוך {testingGoalDays}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#1E293B] overflow-hidden mb-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all duration-700",
                    testingProgress >= 100 ? "bg-[#10B981]" :
                    testingProgress >= 66 ? "bg-[#6366F1]" :
                    testingProgress >= 33 ? "bg-[#F59E0B]" : "bg-[#64748B]"
                  )}
                  style={{ width: `${testingProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-[#64748B]">
                  {coachUnlocked
                    ? "✅ הבדיקה הושלמה — ניתן לייצר קורס"
                    : `עוד ${testingGoalDays - daysOfData} ימים לסיום`}
                </span>
                <span className={cn("font-bold", testingProgress >= 100 ? "text-[#10B981]" : "text-[#6366F1]")}>
                  {Math.round(testingProgress)}%
                </span>
              </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "P&L כולל", value: formatCurrency(totalPnl), color: totalPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]" },
                { label: "אחוז הצלחה", value: `${overallWr.toFixed(1)}%`, color: overallWr >= 50 ? "text-[#10B981]" : "text-[#EF4444]" },
                { label: "סה\"כ עסקאות", value: String(totalTrades), color: "text-[#F8FAFC]" },
                { label: "ימי מעקב", value: `${daysOfData}/${testingGoalDays}`, color: "text-[#94A3B8]" },
              ].map(k => (
                <div key={k.label} className="rounded-lg border border-[#1E293B] bg-[#0F1520] p-2.5 text-center">
                  <p className={cn("text-base font-bold tabular-nums", k.color)}>{k.value}</p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Strategy rankings */}
            <div className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2.5">דירוג אסטרטגיות</p>
              <div className="space-y-2">
                {[...strategies].filter(s => s.totalSignals > 0).sort((a, b) => b.totalPnl - a.totalPnl).map((s, i) => {
                  const wr = (s.wins / s.totalSignals * 100);
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className={cn("text-xs font-bold w-4 text-center shrink-0", i === 0 ? "text-[#F59E0B]" : "text-[#64748B]")}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#F8FAFC] truncate">{s.name}</p>
                        <p className="text-[9px] text-[#64748B]">{wr.toFixed(0)}% WR · {s.totalSignals} עסקאות</p>
                      </div>
                      <span className={cn("text-xs font-bold tabular-nums shrink-0", s.totalPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                        {s.totalPnl >= 0 ? "+" : ""}${s.totalPnl}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Best hours */}
            <div className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2">שעות הכי טובות</p>
              {[...HOUR_BUCKETS].sort((a, b) => b.winRate - a.winRate).slice(0, 4).map((b, i) => (
                <div key={b.hour} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-[#F59E0B] w-4">#{i + 1}</span>
                  <span className="text-[10px] font-mono text-[#94A3B8] w-12">{b.label}</span>
                  <div className="flex-1 h-1.5 bg-[#1E293B] rounded">
                    <div className="h-1.5 bg-[#10B981] rounded" style={{ width: `${b.winRate}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-[#10B981] w-8 text-right">{b.winRate}%</span>
                </div>
              ))}
            </div>

            {/* Best price range */}
            <div className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2">מחיר אידיאלי</p>
              {[...PRICE_BUCKETS].sort((a, b) => b.winRate - a.winRate).slice(0, 3).map((b, i) => (
                <div key={b.range} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-[#F59E0B] w-4">#{i + 1}</span>
                  <span className="text-[10px] font-mono text-[#94A3B8] w-12">{b.range}</span>
                  <div className="flex-1 h-1.5 bg-[#1E293B] rounded">
                    <div className="h-1.5 bg-[#6366F1] rounded" style={{ width: `${b.winRate}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-[#6366F1] w-8 text-right">{b.winRate}%</span>
                </div>
              ))}
            </div>

              {/* AI Optimizer */}
            <div className="rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3">
              <p className="text-xs font-bold text-[#F59E0B] mb-2 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> AI Optimizer
              </p>
              <p className="text-[10px] text-[#94A3B8] leading-relaxed mb-2">
                כל שבוע ה-AI בודק אוטומטית אם הוספת משתנה (שעה, מחיר, rvol) מעלה את אחוז ההצלחה.
              </p>
              {/* Mock optimization discoveries */}
              <div className="space-y-1.5">
                {[
                  { strategy: "Bull Flag", var: "16:30-18:30 בלבד", base: 54, improved: 67, status: "accepted" },
                  { strategy: "VWAP", var: "rvol ≥ 7x", base: 46, improved: 58, status: "testing" },
                ].map((opt, i) => (
                  <div key={i} className="rounded-lg bg-[#0B0E14]/60 p-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-[#F8FAFC]">{opt.strategy}</span>
                      <span className={cn(
                        "text-[8px] px-1.5 py-0.5 rounded font-bold",
                        opt.status === "accepted" ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#F59E0B]/15 text-[#F59E0B]"
                      )}>
                        {opt.status === "accepted" ? "אושר ✓" : "בבדיקה"}
                      </span>
                    </div>
                    <p className="text-[9px] text-[#64748B]">{opt.var}</p>
                    <p className="text-[9px] text-[#10B981] font-medium">{opt.base}% → {opt.improved}% WR (+{opt.improved - opt.base}pp)</p>
                  </div>
                ))}
              </div>
            </div>

          {/* AI Coach CTA */}
            <div className={cn(
              "rounded-xl border p-4",
              coachUnlocked
                ? "border-[#8B5CF6]/40 bg-[#8B5CF6]/10"
                : "border-[#1E293B] bg-[#0F1520]"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {coachUnlocked ? <Brain className="h-4 w-4 text-[#8B5CF6]" /> : <Lock className="h-4 w-4 text-[#64748B]" />}
                <p className={cn("text-xs font-bold", coachUnlocked ? "text-[#8B5CF6]" : "text-[#64748B]")}>
                  AI Coach
                </p>
              </div>
              {coachUnlocked ? (
                <button className="w-full rounded-lg bg-[#8B5CF6] py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] transition-colors">
                  צור פלייבוק אישי
                </button>
              ) : (
                <>
                  <p className="text-[10px] text-[#64748B] leading-relaxed mb-2">
                    לאחר <span className="text-[#F8FAFC] font-semibold">90 ימי מעקב</span>, AI Coach ינתח את הדטה שלך וייצר פלייבוק מסחר אישי.
                  </p>
                  <div className="h-1.5 w-full bg-[#1E293B] rounded-full">
                    <div className="h-1.5 bg-[#6366F1] rounded-full" style={{ width: `${(daysOfData / 90) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-[#64748B] mt-1 text-center">{daysOfData}/90 ימים</p>
                </>
              )}
            </div>
          </div>
        </aside>

      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-2xl border border-[#1E293B] bg-[#0F1520] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#6366F1]" />
                <p className="text-sm font-bold text-[#F8FAFC]">הגדרות סריקה</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-[#64748B] hover:text-[#F8FAFC] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Time range */}
              <div>
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#6366F1]" /> שעות פעילות (שעון ישראל)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#64748B] block mb-1">התחלה</label>
                    <select
                      value={pendingSettings.startHour}
                      onChange={e => setPendingSettings((p: typeof scanSettings) => ({ ...p, startHour: e.target.value }))}
                      className="w-full rounded-lg border border-[#1E293B] bg-[#0B0E14] px-3 py-2 text-sm text-[#F8FAFC] focus:border-[#6366F1]/50 focus:outline-none"
                    >
                      {Array.from({ length: 13 }, (_, i) => i + 9).map(h => (
                        <option key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block mb-1">סיום</label>
                    <select
                      value={pendingSettings.endHour}
                      onChange={e => setPendingSettings((p: typeof scanSettings) => ({ ...p, endHour: e.target.value }))}
                      className="w-full rounded-lg border border-[#1E293B] bg-[#0B0E14] px-3 py-2 text-sm text-[#F8FAFC] focus:border-[#6366F1]/50 focus:outline-none"
                    >
                      {Array.from({ length: 16 }, (_, i) => i + 10).map(h => (
                        <option key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Visual timeline */}
                <div className="mt-3 rounded-lg bg-[#0B0E14] p-3">
                  <div className="flex justify-between text-[9px] text-[#64748B] mb-1">
                    <span>09:00</span><span>13:00</span><span>17:00</span><span>21:00</span><span>01:00</span>
                  </div>
                  <div className="h-3 w-full rounded bg-[#1E293B] relative">
                    {/* Pre-market zone 11-16:30 */}
                    <div className="absolute h-full bg-[#F59E0B]/20 rounded" style={{ left: "16.7%", width: "22.9%" }} />
                    {/* Regular zone 16:30-23 */}
                    <div className="absolute h-full bg-[#10B981]/20 rounded" style={{ left: "39.6%", width: "27.1%" }} />
                    {/* Selected range */}
                    <div
                      className="absolute h-full bg-[#6366F1]/60 rounded transition-all"
                      style={{
                        left: `${((parseInt(pendingSettings.startHour) - 9) / 16) * 100}%`,
                        width: `${((parseInt(pendingSettings.endHour) - parseInt(pendingSettings.startHour)) / 16) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex gap-3 mt-2">
                    <span className="text-[9px] flex items-center gap-1"><span className="h-2 w-2 rounded bg-[#F59E0B]/40 inline-block" />פרי-מרקט</span>
                    <span className="text-[9px] flex items-center gap-1"><span className="h-2 w-2 rounded bg-[#10B981]/40 inline-block" />שוק רגיל</span>
                    <span className="text-[9px] flex items-center gap-1 text-[#6366F1]"><span className="h-2 w-2 rounded bg-[#6366F1]/60 inline-block" />הגדרה שלך</span>
                  </div>
                </div>
              </div>

              {/* Scan interval */}
              <div>
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-[#6366F1]" /> תדירות סריקה (Fallback REST)
                </p>
                <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/5 px-3 py-2 mb-3 flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-[#22C55E] animate-pulse flex-shrink-0" />
                  <p className="text-[11px] text-[#22C55E] font-medium">
                    WebSocket פעיל — בדיקה כל שנייה בזמן אמת מ-Polygon.io
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { val: "5",   label: "5ש",   desc: "⚡ אולטרה מהיר" },
                    { val: "10",  label: "10ש",  desc: "⚡ מהיר מאוד" },
                    { val: "30",  label: "30ש",  desc: "✅ מומלץ" },
                    { val: "60",  label: "1′",   desc: "🔋 חסכוני" },
                    { val: "300", label: "5′",   desc: "⏱ נמוך" },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => setPendingSettings((p: typeof scanSettings) => ({ ...p, intervalSec: val }))}
                      className={cn(
                        "rounded-lg border py-2 text-xs font-bold transition-all",
                        pendingSettings.intervalSec === val
                          ? "border-[#6366F1] bg-[#6366F1]/15 text-[#6366F1]"
                          : "border-[#1E293B] bg-[#0B0E14] text-[#64748B] hover:border-[#334155] hover:text-[#94A3B8]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[#64748B]">
                  {pendingSettings.intervalSec === "5"   ? "⚡ 5 שניות — REST fallback כשה-WebSocket לא זמין"
                  : pendingSettings.intervalSec === "10"  ? "⚡ 10 שניות — REST fallback מהיר מאוד"
                  : pendingSettings.intervalSec === "30"  ? "✅ 30 שניות — מומלץ לסוחרי יום"
                  : pendingSettings.intervalSec === "60"  ? "🔋 דקה — חסכוני, מתאים לסוויינג"
                  : "⏱ 5 דקות — מינימלי, רק לאסטרטגיות ארוכות טווח"}
                </p>
              </div>

              {/* Testing duration */}
              <div>
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#6366F1]" /> משך תקופת בדיקה
                </p>
                <p className="text-[10px] text-[#64748B] mb-2">
                  כמה זמן תרוץ הבדיקה לפני שתוכל לייצר קורס ולבצע החלטות? יותר זמן = נתונים אמינים יותר.
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { val: "7",   label: "7 ימים",   sub: "מהיר" },
                    { val: "30",  label: "30 יום",   sub: "בסיסי" },
                    { val: "60",  label: "60 יום",   sub: "טוב" },
                    { val: "90",  label: "90 יום",   sub: "✅ מומלץ" },
                    { val: "180", label: "6 חודשים", sub: "מקצועי" },
                    { val: "365", label: "שנה",      sub: "אמין מאוד" },
                  ].map(({ val, label, sub }) => (
                    <button
                      key={val}
                      onClick={() => setPendingSettings((p: typeof scanSettings) => ({ ...p, testingDays: val }))}
                      className={cn(
                        "rounded-lg border py-2 text-center transition-all",
                        pendingSettings.testingDays === val
                          ? "border-[#6366F1] bg-[#6366F1]/15 text-[#6366F1]"
                          : "border-[#1E293B] bg-[#0B0E14] text-[#64748B] hover:border-[#334155] hover:text-[#94A3B8]"
                      )}
                    >
                      <div className="text-xs font-bold">{label}</div>
                      <div className="text-[9px] opacity-70">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-[#6366F1]/20 bg-[#6366F1]/5 p-3">
                <p className="text-[10px] text-[#6366F1] font-semibold mb-1">תקציר ההגדרה</p>
                <p className="text-xs text-[#94A3B8]">
                  <span className="text-[#22C55E] font-semibold">WebSocket Real-Time</span> · בין{" "}
                  <span className="text-[#F8FAFC] font-medium">{pendingSettings.startHour.padStart(2,"0")}:00</span> ל-
                  <span className="text-[#F8FAFC] font-medium">{pendingSettings.endHour.padStart(2,"0")}:00</span> ·{" "}
                  תקופת בדיקה: <span className="text-[#F8FAFC] font-medium">
                    {pendingSettings.testingDays === "365" ? "שנה" : pendingSettings.testingDays === "180" ? "6 חודשים" : `${pendingSettings.testingDays} יום`}
                  </span>
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 border-t border-[#1E293B] px-5 py-4">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-lg border border-[#1E293B] py-2 text-sm text-[#64748B] hover:text-[#94A3B8] transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  setScanSettings(pendingSettings);
                  localStorage.setItem("livelab_settings", JSON.stringify(pendingSettings));
                  // Send to backend
                  fetch(`${API}/live-lab/settings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      start_hour: parseInt(pendingSettings.startHour),
                      end_hour: parseInt(pendingSettings.endHour),
                      interval_seconds: parseInt(pendingSettings.intervalSec),
                    }),
                  }).catch(() => {});
                  setShowSettings(false);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#6366F1] py-2 text-sm font-semibold text-white hover:bg-[#5558E8] transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> שמור הגדרות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Modal ── */}
      {upgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-[#F59E0B]/30 bg-[#0F1520] shadow-2xl mx-4">
            <button
              onClick={() => setUpgradePrompt(false)}
              className="absolute left-4 top-4 rounded-lg p-1.5 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1E293B] transition-all"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 mb-4">
                <Zap className="h-7 w-7 text-[#F59E0B]" />
              </div>
              <h2 className="text-lg font-bold text-[#F8FAFC] mb-1">הגעת למגבלת החינמי</h2>
              <p className="text-sm text-[#64748B] mb-5">
                החבילה החינמית מאפשרת <span className="text-[#F8FAFC] font-semibold">{FREE_LIMIT} אסטרטגיות</span> בו-זמנית.
                שדרג כדי להריץ יותר אסטרטגיות ולפתוח תכונות מתקדמות.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* Starter plan */}
                <div className="rounded-xl border border-[#6366F1]/40 bg-[#6366F1]/5 p-4 text-center">
                  <p className="text-xs font-semibold text-[#6366F1] mb-1">Starter</p>
                  <p className="text-2xl font-bold text-[#F8FAFC]">₪59</p>
                  <p className="text-[10px] text-[#64748B] mb-3">/חודש</p>
                  <ul className="text-[11px] text-[#94A3B8] space-y-1 text-right">
                    <li>✅ עד 15 אסטרטגיות</li>
                    <li>✅ AI Optimizer</li>
                    <li>✅ בניית קורסים</li>
                    <li>✅ WebSocket real-time</li>
                  </ul>
                </div>

                {/* Pro plan */}
                <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 p-4 text-center relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#F59E0B] px-2.5 py-0.5 text-[9px] font-bold text-black">
                    הכי פופולרי
                  </div>
                  <p className="text-xs font-semibold text-[#F59E0B] mb-1">Pro</p>
                  <p className="text-2xl font-bold text-[#F8FAFC]">₪149</p>
                  <p className="text-[10px] text-[#64748B] mb-3">/חודש</p>
                  <ul className="text-[11px] text-[#94A3B8] space-y-1 text-right">
                    <li>✅ אסטרטגיות ללא הגבלה</li>
                    <li>✅ חיבור ברוקר אמיתי</li>
                    <li>✅ AI Coach 24/7</li>
                    <li>✅ מכירת קורסים</li>
                  </ul>
                </div>
              </div>

              <p className="text-[10px] text-[#64748B] mb-4">
                כל אסטרטגיה נוספת מעל המכסה: <span className="text-[#F8FAFC]">₪12/חודש</span>
              </p>

              <button className="w-full rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#EF4444] py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity">
                שדרג עכשיו — 7 ימי ניסיון חינם
              </button>
              <button
                onClick={() => setUpgradePrompt(false)}
                className="mt-2 w-full py-2 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors"
              >
                המשך עם החינמי
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Signal Card Component ────────────────────────────────────────────────────

function SignalCard({ signal: s }: { signal: Signal }) {
  const isOpen = s.status === "open";
  const isWin  = s.status === "win";
  const isLoss = s.status === "loss";

  const statusConfig = {
    open:  { icon: Radio,       color: "text-[#6366F1]", bg: "bg-[#6366F1]/10 border-[#6366F1]/25", label: "פתוח" },
    win:   { icon: CheckCircle, color: "text-[#10B981]", bg: "bg-[#10B981]/10 border-[#10B981]/25", label: "רווח ✓" },
    loss:  { icon: XCircle,     color: "text-[#EF4444]", bg: "bg-[#EF4444]/10 border-[#EF4444]/25", label: "הפסד ✗" },
    flat:  { icon: MinusCircle, color: "text-[#94A3B8]", bg: "bg-[#94A3B8]/10 border-[#94A3B8]/25", label: "שוויון" },
  }[s.status];

  const Icon = statusConfig.icon;
  const progress = isOpen && s.currentPrice
    ? Math.min(Math.max(((s.currentPrice - s.entryPrice) / (s.tpPrice - s.entryPrice)) * 100, 0), 100)
    : isWin ? 100 : 0;

  return (
    <div className={cn("rounded-xl border p-3 transition-all", statusConfig.bg)}>
      {/* Row 1: status + strategy + time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", statusConfig.color)} />
          <span className={cn("text-[10px] font-bold uppercase", statusConfig.color)}>{statusConfig.label}</span>
          <span className="text-[10px] text-[#64748B]">·</span>
          <span className="text-[10px] text-[#94A3B8]">{s.strategyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", sessionBg(s.session), sessionColor(s.session))}>
            {sessionLabel(s.session)}
          </span>
          <span className="text-[10px] font-mono text-[#64748B]">{s.entryTime} 🇮🇱</span>
        </div>
      </div>

      {/* Row 2: ticker + prices */}
      <div className="flex items-center gap-4 mb-2">
        <span className="text-lg font-bold text-[#F8FAFC]">{s.ticker}</span>
        <div className="flex items-center gap-1 text-xs text-[#64748B]">
          <span>כניסה</span>
          <span className="font-mono text-[#F8FAFC]">${s.entryPrice.toFixed(2)}</span>
          {(isWin || isLoss) && s.exitPrice && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="font-mono text-[#F8FAFC]">${s.exitPrice.toFixed(2)}</span>
            </>
          )}
          {isOpen && s.currentPrice && (
            <>
              <span>→ עכשיו</span>
              <span className={cn("font-mono font-bold", s.currentPrice > s.entryPrice ? "text-[#10B981]" : "text-[#EF4444]")}>
                ${s.currentPrice.toFixed(2)}
              </span>
            </>
          )}
        </div>
        {s.returnPct !== undefined && (
          <span className={cn("ml-auto text-sm font-bold tabular-nums", s.returnPct >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
            {s.returnPct >= 0 ? "+" : ""}{s.returnPct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Row 3: TP/SL + meta */}
      <div className="flex items-center gap-3 mb-2 text-[10px] text-[#64748B]">
        <span>TP <span className="text-[#10B981] font-mono">${s.tpPrice.toFixed(2)}</span></span>
        <span>·</span>
        <span>SL <span className="text-[#EF4444] font-mono">${s.slPrice.toFixed(2)}</span></span>
        <span>·</span>
        <span>
          float{" "}
          <span className={cn("font-semibold font-mono",
            s.float < 5  ? "text-[#F59E0B]" :   // ultra-low float = orange
            s.float < 15 ? "text-[#94A3B8]" :
            "text-[#64748B]"
          )}>
            {s.float.toFixed(1)}M
          </span>
          {s.float < 5 && <span className="ml-0.5 text-[#F59E0B]">🔥</span>}
        </span>
        <span>·</span>
        <span>rvol <span className={cn("font-mono", s.rvol >= 10 ? "text-[#F59E0B] font-bold" : "text-[#94A3B8]")}>{s.rvol.toFixed(1)}x</span></span>
        <span>·</span>
        <span className="text-[#8B5CF6]">{s.catalyst}</span>
        {s.holdMinutes && <><span>·</span><span>{s.holdMinutes}m</span></>}
      </div>

      {/* Progress bar (TP → SL) */}
      {(isOpen || isWin) && (
        <div className="mt-1">
          <div className="h-1 w-full bg-[#1E293B] rounded-full overflow-hidden">
            <div
              className={cn("h-1 rounded-full transition-all", isWin ? "bg-[#10B981]" : "bg-[#6366F1]")}
              style={{ width: `${progress}%` }}
            />
          </div>
          {isOpen && (
            <div className="flex justify-between mt-0.5">
              <span className="text-[8px] text-[#EF4444]">SL {s.slPct}%</span>
              <span className="text-[8px] text-[#10B981]">TP +{s.tpPct}%</span>
            </div>
          )}
        </div>
      )}

      {/* P&L badge */}
      {s.dollarsGain !== undefined ? (
        <div className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold",
          s.dollarsGain >= 0 ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#EF4444]/15 text-[#EF4444]"
        )}>
          {s.dollarsGain >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {s.dollarsGain >= 0 ? "+" : "-"}${Math.abs(s.dollarsGain).toFixed(0)}
          <span className="opacity-60 font-normal">
            {" "}({s.returnPct !== undefined ? `${s.returnPct >= 0 ? "+" : ""}${s.returnPct.toFixed(1)}%` : ""})
          </span>
        </div>
      ) : isOpen && s.currentPrice ? (
        (() => {
          const unrealPct = ((s.currentPrice - s.entryPrice) / s.entryPrice) * 100;
          const unrealUsd = 500 * unrealPct / 100;
          return (
            <div className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold border",
              unrealPct >= 0
                ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20"
                : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
            )}>
              <Activity className="h-3 w-3 animate-pulse" />
              רווח/הפסד לא סגור:{" "}
              {unrealPct >= 0 ? "+" : ""}{unrealPct.toFixed(1)}%
              <span className="opacity-70">
                ({unrealUsd >= 0 ? "+" : "-"}${Math.abs(unrealUsd).toFixed(0)})
              </span>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
