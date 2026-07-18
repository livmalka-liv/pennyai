"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Moon, Sun, Sunset, Sunrise, Bell, BellOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOvernightAlerts, type OvernightAlert } from "@/lib/api";

// ── Session metadata ──────────────────────────────────────────────────────────

const SESSION_META: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  "לילה עמוק":   { color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30",  icon: "🌑", label: "Deep Night" },
  "פרי-מרקט":   { color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30",     icon: "🌅", label: "Pre-Market" },
  "מסחר רגיל":  { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "🔔", label: "Regular" },
  "אפטר-אוורס": { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   icon: "🌆", label: "After-Hours" },
};

function parseSession(hour_str: string) {
  // hour_str looks like "03:00 [לילה עמוק]"
  const match = hour_str.match(/\[(.+?)\]/);
  const sessionName = match?.[1] ?? "";
  const hour = hour_str.split(" ")[0];
  return { sessionName, hour };
}

function getMeta(sessionName: string) {
  return SESSION_META[sessionName] ?? {
    color: "text-slate-400", bg: "bg-slate-500/10",
    border: "border-slate-500/30", icon: "📊", label: sessionName,
  };
}

// ── Heat bar ──────────────────────────────────────────────────────────────────

function HeatBar({ multiplier }: { multiplier: number }) {
  const pct = Math.min((multiplier / 10) * 100, 100);
  const color =
    multiplier >= 7 ? "bg-red-500" :
    multiplier >= 5 ? "bg-orange-500" :
    multiplier >= 3 ? "bg-amber-400" :
    "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-[#1E293B] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        "text-xs font-bold tabular-nums",
        multiplier >= 5 ? "text-red-400" : multiplier >= 3 ? "text-amber-400" : "text-emerald-400"
      )}>×{multiplier.toFixed(1)}</span>
    </div>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, isNew }: { alert: OvernightAlert; isNew: boolean }) {
  const { sessionName, hour } = parseSession(alert.hour_str);
  const meta = getMeta(sessionName);

  return (
    <div className={cn(
      "relative rounded-xl border p-4 transition-all",
      meta.border, meta.bg,
      isNew && "ring-1 ring-amber-400/40"
    )}>
      {isNew && (
        <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-black">NEW</span>
      )}

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <div className="text-lg font-bold text-[#F8FAFC] tracking-wide">{alert.ticker}</div>
            <div className={cn("text-[11px] font-semibold", meta.color)}>{sessionName} · {meta.label}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-[#F8FAFC]">{hour}</div>
          <div className="text-[10px] text-[#475569]">שעון ישראל</div>
        </div>
      </div>

      {/* Heat bar */}
      <div className="mt-3">
        <HeatBar multiplier={alert.multiplier} />
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-[#0D1117]/60 px-2 py-2">
          <div className="font-bold text-[#F8FAFC] tabular-nums">{alert.last_hour_vol.toLocaleString()}</div>
          <div className="text-[#475569] text-[10px]">מניות / שעה</div>
        </div>
        <div className="rounded-lg bg-[#0D1117]/60 px-2 py-2">
          <div className="font-bold text-[#F8FAFC]">
            {alert.baseline ? `${Math.round(alert.baseline).toLocaleString()}` : "—"}
          </div>
          <div className="text-[#475569] text-[10px]">בסיס רגיל</div>
        </div>
        <div className="rounded-lg bg-[#0D1117]/60 px-2 py-2">
          <div className="font-bold text-[#F8FAFC]">
            {alert.price ? `$${alert.price.toFixed(3)}` : "—"}
          </div>
          <div className="text-[#475569] text-[10px]">מחיר</div>
        </div>
      </div>

      <div className="mt-2 text-right text-[10px] text-[#334155]">{alert.received_at}</div>
    </div>
  );
}

// ── Session summary strip ─────────────────────────────────────────────────────

function SessionStrip({ alerts }: { alerts: OvernightAlert[] }) {
  const sessions = ["לילה עמוק", "פרי-מרקט", "מסחר רגיל", "אפטר-אוורס"];
  return (
    <div className="grid grid-cols-4 gap-2 mb-6">
      {sessions.map((s) => {
        const meta = getMeta(s);
        const count = alerts.filter((a) => a.hour_str.includes(s)).length;
        return (
          <div key={s} className={cn("rounded-xl border p-3 text-center", meta.border, meta.bg)}>
            <div className="text-2xl mb-1">{meta.icon}</div>
            <div className={cn("text-xs font-semibold", meta.color)}>{s}</div>
            <div className="text-lg font-bold text-[#F8FAFC] mt-1">{count}</div>
            <div className="text-[10px] text-[#475569]">התרעות</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OvernightPage() {
  const [alerts, setAlerts] = useState<OvernightAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState(0);
  const [filter, setFilter] = useState<string>("הכל");

  const load = useCallback(async () => {
    try {
      const data = await getOvernightAlerts();
      setAlerts(data.alerts);
      setLastCount((prev) => {
        if (data.count > prev && prev > 0) {
          // New alerts arrived
        }
        return data.count;
      });
      setError(null);
    } catch {
      setError("לא ניתן להתחבר לשרת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);  // רענון כל 15 שניות
    return () => clearInterval(id);
  }, [load]);

  const sessions = ["הכל", "לילה עמוק", "פרי-מרקט", "מסחר רגיל", "אפטר-אוורס"];

  const filtered = filter === "הכל"
    ? alerts
    : alerts.filter((a) => a.hour_str.includes(filter));

  const topMultiplier = alerts.length > 0
    ? Math.max(...alerts.map((a) => a.multiplier))
    : 0;

  return (
    <div className="min-h-screen bg-[#070A0F] p-6 text-[#F8FAFC]" dir="rtl">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🌙 סורק ווליום 24/7</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            מעקב חריגות ווליום בכל סשן — לילה, פרי-מרקט, רגיל, אפטר
          </p>
          {alerts.length > 0 && (
            <p className="mt-0.5 text-xs text-[#475569]">
              עדכון אחרון: {alerts[0]?.received_at}
            </p>
          )}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D1117] px-3 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          רענן
        </button>
      </div>

      {/* Top stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-4 text-center">
          <div className="text-3xl font-bold text-[#6366F1]">{alerts.length}</div>
          <div className="mt-1 text-xs text-[#64748B]">סה"כ התרעות</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <div className="text-3xl font-bold text-amber-400">
            {topMultiplier > 0 ? `×${topMultiplier.toFixed(1)}` : "—"}
          </div>
          <div className="mt-1 text-xs text-[#64748B]">חריגה מקסימלית</div>
        </div>
        <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-4 text-center">
          <div className="text-3xl font-bold text-[#F8FAFC]">
            {new Set(alerts.map((a) => a.ticker)).size}
          </div>
          <div className="mt-1 text-xs text-[#64748B]">מניות ייחודיות</div>
        </div>
      </div>

      {/* Session summary */}
      <SessionStrip alerts={alerts} />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error} — ודא שהסורט overnight_tracker.py רץ ומחובר לאינטרנט
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {sessions.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
              filter === s
                ? "bg-[#6366F1] text-white"
                : "border border-[#1E293B] bg-[#0D1117] text-[#64748B] hover:text-[#F8FAFC]"
            )}
          >
            {s === "הכל" ? `הכל (${alerts.length})` : (
              `${getMeta(s).icon} ${s} (${alerts.filter((a) => a.hour_str.includes(s)).length})`
            )}
          </button>
        ))}
      </div>

      {/* Alerts grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#64748B]">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> טוען...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-12 text-center">
          <div className="text-5xl mb-4">🌙</div>
          <div className="text-[#64748B] text-sm">
            אין התרעות עדיין.
            <br />
            הסורט שולח התרעה כשמניה מראה ×3 או יותר מהרגיל.
            <br />
            <span className="text-[#475569] text-xs mt-2 block">
              ודא ש-overnight_tracker.py רץ בטרמינל
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((alert, i) => (
            <AlertCard
              key={`${alert.ticker}-${alert.received_at}-${i}`}
              alert={alert}
              isNew={i === 0 && alerts.length > lastCount - 1}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 rounded-xl border border-[#1E293B] bg-[#0B0E14] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[#94A3B8]">סשנים ובסיסי ווליום</h3>
        <div className="grid grid-cols-2 gap-3 text-xs text-[#64748B] md:grid-cols-4">
          {[
            { s: "לילה עמוק",   hours: "03:00–11:00", pct: "1%",  note: "לילה עמוק, ET 20:00–04:00" },
            { s: "פרי-מרקט",   hours: "11:00–16:30", pct: "8%",  note: "ET 04:00–09:30" },
            { s: "מסחר רגיל",  hours: "16:30–23:00", pct: "85%", note: "ET 09:30–16:00" },
            { s: "אפטר-אוורס", hours: "23:00–03:00", pct: "6%",  note: "ET 16:00–20:00" },
          ].map(({ s, hours, pct, note }) => {
            const meta = getMeta(s);
            return (
              <div key={s} className={cn("rounded-lg p-3 border", meta.bg, meta.border)}>
                <div className={cn("font-semibold mb-1", meta.color)}>{meta.icon} {s}</div>
                <div>{hours} IL</div>
                <div className="text-[#94A3B8] font-bold">{pct} מהיומי</div>
                <div className="text-[#334155] text-[10px] mt-1">{note}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
