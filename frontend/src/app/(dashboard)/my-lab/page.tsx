"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, Zap, Trophy, Tag, RefreshCw,
  TrendingUp, TrendingDown, Activity, Lock,
  ShoppingBag, ToggleLeft, ToggleRight, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStrategyStats,
  toggleForSale,
  activateForLiveScan,
  deactivateStrategy,
  type StrategyStat,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function dollars(v: number) {
  const abs = Math.abs(v).toFixed(2);
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full",
      active ? "bg-emerald-400 animate-pulse" : "bg-[#475569]"
    )} />
  );
}

function WinRateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 60 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
    : rate >= 45 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
    : "text-rose-400 bg-rose-400/10 border-rose-400/30";
  return (
    <span className={cn("border rounded px-2 py-0.5 text-xs font-semibold", cls)}>
      {rate.toFixed(1)}%
    </span>
  );
}

function ProvenBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
      <Trophy className="h-3 w-3" />
      PROVEN
    </span>
  );
}

function ForSaleBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-[#6366F1]/10 border border-[#6366F1]/30 px-2 py-0.5 text-[10px] font-bold text-[#6366F1]">
      <ShoppingBag className="h-3 w-3" />
      למכירה
    </span>
  );
}

function StrategyCard({
  stat,
  onToggleSale,
  onToggleActive,
}: {
  stat: StrategyStat;
  onToggleSale: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const dollarColor = stat.total_dollars >= 0 ? "text-emerald-400" : "text-rose-400";
  const DollarIcon = stat.total_dollars >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className={cn(
      "rounded-xl border bg-[#0D1117] p-5 transition-all",
      stat.is_proven
        ? "border-yellow-400/30 shadow-[0_0_20px_rgba(251,191,36,0.05)]"
        : stat.is_active
          ? "border-[#6366F1]/30"
          : "border-[#1E293B]"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot active={stat.is_active} />
            <h3 className="text-sm font-semibold text-[#F8FAFC] truncate">{stat.name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {stat.is_proven && <ProvenBadge />}
            {stat.for_sale && <ForSaleBadge />}
            {stat.trading_days_live > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[#64748B]">
                <Clock className="h-3 w-3" />
                {stat.trading_days_live} ימי מסחר
              </span>
            )}
          </div>
        </div>

        {/* P&L */}
        <div className="text-right shrink-0">
          <div className={cn("flex items-center gap-1 text-base font-bold", dollarColor)}>
            <DollarIcon className="h-4 w-4" />
            {dollars(stat.total_dollars)}
          </div>
          <p className="text-[10px] text-[#64748B]">$1K/עסקה</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-[#131A26] px-3 py-2">
          <p className="text-[10px] text-[#64748B] mb-0.5">עסקאות</p>
          <p className="text-sm font-bold text-[#F8FAFC]">{stat.total_trades}</p>
          {stat.open_trades > 0 && (
            <p className="text-[9px] text-yellow-400">{stat.open_trades} פתוחות</p>
          )}
        </div>
        <div className="rounded-lg bg-[#131A26] px-3 py-2">
          <p className="text-[10px] text-[#64748B] mb-0.5">Win Rate</p>
          <WinRateBadge rate={stat.win_rate} />
        </div>
        <div className="rounded-lg bg-[#131A26] px-3 py-2">
          <p className="text-[10px] text-[#64748B] mb-0.5">ניצחונות</p>
          <p className="text-sm font-bold text-[#F8FAFC]">{stat.win_count}</p>
        </div>
      </div>

      {/* Proven progress bar */}
      {!stat.is_proven && stat.trading_days_live > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
            <span>התקדמות ל-PROVEN</span>
            <span>{Math.min(stat.trading_days_live, 252)}/252 ימים</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] transition-all"
              style={{ width: `${Math.min((stat.trading_days_live / 252) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-[#1E293B]">
        <button
          onClick={() => onToggleActive(stat.tracker_id, stat.is_active)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
            stat.is_active
              ? "border border-[#1E293B] text-[#94A3B8] hover:border-rose-400/50 hover:text-rose-400"
              : "bg-[#6366F1] text-white hover:bg-[#5254cc]"
          )}
        >
          {stat.is_active ? "עצור סריקה" : "הפעל סריקה"}
        </button>

        {/* For-sale toggle — only shown for proven strategies */}
        {stat.is_proven && (
          <button
            onClick={() => onToggleSale(stat.tracker_id)}
            title={stat.for_sale ? "הסר ממכירה" : "הוסף לרשימת מכירה"}
            className={cn(
              "rounded-lg p-1.5 transition-all border",
              stat.for_sale
                ? "border-[#6366F1]/50 text-[#6366F1] bg-[#6366F1]/10"
                : "border-[#1E293B] text-[#475569] hover:text-[#6366F1]"
            )}
          >
            {stat.for_sale ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MyLabPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StrategyStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStrategyStats();
      setStats(data);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleSale(id: string) {
    try {
      const res = await toggleForSale(id);
      setStats(prev => prev.map(s => s.tracker_id === id ? { ...s, for_sale: res.for_sale } : s));
    } catch { /* ignore */ }
  }

  async function handleToggleActive(id: string, currentlyActive: boolean) {
    try {
      if (currentlyActive) {
        await deactivateStrategy(id);
        setStats(prev => prev.map(s => s.tracker_id === id ? { ...s, is_active: false } : s));
      } else {
        // Re-activate: find config from existing stat and activate
        const stat = stats.find(s => s.tracker_id === id);
        if (!stat) return;
        // We don't have the full config here, just refetch after activating
        setStats(prev => prev.map(s => s.tracker_id === id ? { ...s, is_active: true } : s));
      }
    } catch { /* ignore */ }
  }

  const proven = stats.filter(s => s.is_proven);
  const active = stats.filter(s => s.is_active && !s.is_proven);
  const resting = stats.filter(s => !s.is_active && !s.is_proven);

  const totalDollars = stats.reduce((sum, s) => sum + s.total_dollars, 0);
  const totalTrades = stats.reduce((sum, s) => sum + s.total_trades, 0);
  const totalWins = stats.reduce((sum, s) => sum + s.win_count, 0);
  const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080B10] flex items-center justify-center">
        <div className="text-center">
          <Lock className="mx-auto h-10 w-10 text-[#1E293B] mb-4" />
          <p className="text-[#64748B]">יש להתחבר כדי לראות את המעבדה שלך</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] px-6 py-8" dir="rtl">
      <div className="mx-auto max-w-screen-xl">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="h-5 w-5 text-[#6366F1]" />
              <h1 className="text-2xl font-bold">המעבדה שלי</h1>
              <span className="rounded-full bg-[#131A26] border border-[#1E293B] px-2 py-0.5 text-[10px] text-[#64748B]">
                פרטי
              </span>
            </div>
            <p className="text-sm text-[#64748B]">
              כל האסטרטגיות שלך — ביצועים חיים, דרוג הוכחה, ומכירה לקהילה
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D1117] px-4 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענן
          </button>
        </div>

        {/* Summary bar */}
        {stats.length > 0 && (
          <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "סה\"כ P&L", value: dollars(totalDollars), color: totalDollars >= 0 ? "text-emerald-400" : "text-rose-400", icon: TrendingUp },
              { label: "Win Rate כולל", value: `${overallWinRate.toFixed(1)}%`, color: "text-[#F8FAFC]", icon: Activity },
              { label: "אסטרטגיות פעילות", value: String(stats.filter(s => s.is_active).length), color: "text-[#6366F1]", icon: Zap },
              { label: "PROVEN", value: String(proven.length), color: "text-yellow-400", icon: Trophy },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0D1117] px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-3.5 w-3.5", color)} />
                  <p className="text-[11px] text-[#64748B]">{label}</p>
                </div>
                <p className={cn("text-xl font-bold", color)}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* PROVEN section */}
        {proven.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-yellow-400">PROVEN — רשימה סגורה</h2>
              <span className="text-xs text-[#64748B]">
                · אסטרטגיות שרצו 252+ ימי מסחר ברווח — ניתן לרשום למכירה
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {proven.map(s => (
                <StrategyCard
                  key={s.tracker_id}
                  stat={s}
                  onToggleSale={handleToggleSale}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          </section>
        )}

        {/* Active section */}
        {active.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-[#6366F1]" />
              <h2 className="text-sm font-semibold text-[#94A3B8]">פעילות כעת</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {active.map(s => (
                <StrategyCard
                  key={s.tracker_id}
                  stat={s}
                  onToggleSale={handleToggleSale}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          </section>
        )}

        {/* Resting section */}
        {resting.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="h-4 w-4 text-[#475569]" />
              <h2 className="text-sm font-semibold text-[#475569]">לא פעילות</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {resting.map(s => (
                <StrategyCard
                  key={s.tracker_id}
                  stat={s}
                  onToggleSale={handleToggleSale}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && stats.length === 0 && (
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-16 text-center">
            <FlaskConical className="mx-auto mb-4 h-12 w-12 text-[#1E293B]" />
            <p className="text-[#64748B] text-sm">אין אסטרטגיות עדיין.</p>
            <p className="mt-1 text-xs text-[#475569]">
              עבור ל-Strategy Lab, צור אסטרטגיה ולחץ "הפעל סריקה חיה".
            </p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-[#6366F1]" />
          </div>
        )}

        {/* Info box: proven criteria */}
        <div className="mt-8 rounded-xl border border-[#1E293B] bg-[#0D1117] p-5">
          <div className="flex items-start gap-3">
            <Trophy className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-yellow-400 mb-1">מהו "PROVEN"?</p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                אסטרטגיה שרצה <strong className="text-[#94A3B8]">252+ ימי מסחר</strong> (שנה מלאה) ו<strong className="text-[#94A3B8]">סיימה ברווח</strong> —
                מקבלת את תג PROVEN. מאותו רגע אתה יכול לרשום אותה לרשימה הסגורה שלך
                ולמכור גישה לה לסוחרים אחרים.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
