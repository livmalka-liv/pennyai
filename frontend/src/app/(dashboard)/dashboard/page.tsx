"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authHeader } from "@/lib/auth";
import {
  TrendingUp, Zap, BookOpen, ChevronRight,
  Activity, Target, BarChart2, Crown, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

interface Stats {
  activeStrategies: number;
  signalsToday: number;
  totalPnl: number;
  winRate: number;
}

interface Signal {
  ticker: string;
  entry_price: number;
  float_shares: number;
  rvol: number;
  timestamp: string;
  unrealized_pnl_pct?: number;
}

const QUICK_LINKS = [
  { href: "/sandbox",  icon: BarChart2,  label: "Sandbox",        desc: "הרץ בדיקה על אסטרטגיה",     color: "from-[#10B981] to-[#059669]" },
  { href: "/live-lab", icon: Activity,   label: "Live Lab",       desc: "סיגנלים חיים בזמן אמת",       color: "from-[#EF4444] to-[#DC2626]" },
  { href: "/library",  icon: BookOpen,   label: "Strategy Library", desc: "גלה אסטרטגיות מוכחות",    color: "from-[#6366F1] to-[#4F46E5]" },
  { href: "/academy",  icon: Target,     label: "Academy",        desc: "למד עם קורסים AI אישיים",     color: "from-[#F59E0B] to-[#D97706]" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [perfRes, sigRes] = await Promise.all([
          fetch(`${API}/live-lab/performance`, { headers: authHeader() }),
          fetch(`${API}/live-lab/signals?days=1`, { headers: authHeader() }),
        ]);
        if (perfRes.ok) {
          const perf = await perfRes.json();
          setStats({
            activeStrategies: perf.active_strategies ?? 0,
            signalsToday: perf.signals_today ?? 0,
            totalPnl: perf.total_pnl ?? 0,
            winRate: perf.win_rate ?? 0,
          });
        }
        if (sigRes.ok) {
          const data = await sigRes.json();
          setSignals((data.signals ?? []).slice(0, 5));
        }
      } catch {}
      setLoadingStats(false);
    }
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  const firstName = user?.email?.split("@")[0] ?? "";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14] px-6 py-8 max-w-screen-xl mx-auto">

      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#F8FAFC]">
          {greeting}, <span className="text-[#6366F1]">{firstName}</span> 👋
        </h1>
        <p className="text-[#64748B] text-sm mt-1">הנה מה שקורה היום בחשבון שלך</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "אסטרטגיות פעילות", value: loadingStats ? "—" : String(stats?.activeStrategies ?? 0), icon: Activity, color: "text-[#10B981]" },
          { label: "סיגנלים היום",      value: loadingStats ? "—" : String(stats?.signalsToday ?? 0),   icon: Zap,      color: "text-[#F59E0B]" },
          { label: "Win Rate",           value: loadingStats ? "—" : `${stats?.winRate ?? 0}%`,           icon: Target,   color: "text-[#6366F1]" },
          { label: "רווח מצטבר",        value: loadingStats ? "—" : `$${(stats?.totalPnl ?? 0).toFixed(0)}`, icon: TrendingUp, color: stats && stats.totalPnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#64748B]">{s.label}</span>
              <s.icon className={cn("h-4 w-4", s.color)} />
            </div>
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">

        {/* Quick links */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-[#94A3B8] mb-3 uppercase tracking-wider">פעולות מהירות</h2>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-[#1E293B] bg-[#0D1117] p-4 hover:border-[#263147] transition-all"
              >
                <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3", link.color)}>
                  <link.icon className="h-4 w-4 text-white" />
                </div>
                <div className="font-semibold text-sm text-[#F8FAFC] group-hover:text-white">{link.label}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">{link.desc}</div>
              </Link>
            ))}
          </div>

          {/* Upgrade banner for free users */}
          {user?.tier === "free" && (
            <div className="mt-4 rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/5 p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-4 w-4 text-[#6366F1]" />
                  <span className="text-sm font-semibold text-[#F8FAFC]">שדרג ל-Starter</span>
                </div>
                <p className="text-xs text-[#64748B]">15 אסטרטגיות · קורסי AI · 15 שנות נתונים</p>
              </div>
              <Link
                href="/sandbox"
                className="rounded-lg bg-[#6366F1] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 flex items-center gap-1"
              >
                ₪59/חודש <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        {/* Recent signals */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider">סיגנלים אחרונים</h2>
            <Link href="/live-lab" className="text-xs text-[#6366F1] hover:underline flex items-center gap-0.5">
              הכל <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
            {signals.length === 0 && !loadingStats && (
              <div className="p-6 text-center text-[#475569] text-sm">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                אין סיגנלים היום עדיין
              </div>
            )}
            {loadingStats && (
              <div className="p-6 text-center text-[#475569] text-sm">טוען...</div>
            )}
            {signals.map((s, i) => (
              <div key={i} className={cn("flex items-center justify-between px-4 py-3", i < signals.length - 1 && "border-b border-[#1E293B]")}>
                <div>
                  <div className="text-sm font-bold text-[#F8FAFC]">{s.ticker}</div>
                  <div className="text-[10px] text-[#64748B]">
                    כניסה ${s.entry_price?.toFixed(2)} · Float {s.float_shares ? (s.float_shares / 1e6).toFixed(1) + "M" : "—"}
                  </div>
                </div>
                {s.unrealized_pnl_pct != null && (
                  <span className={cn("text-xs font-bold", s.unrealized_pnl_pct >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                    {s.unrealized_pnl_pct >= 0 ? "+" : ""}{s.unrealized_pnl_pct.toFixed(1)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
