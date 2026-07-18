"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWPatternState, getOvernightAlerts, getScannerState, type WSignal, type OvernightAlert, type ScannerState } from "@/lib/api";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",  label: "🏠 סקירה",       color: "text-[#6366F1]" },
  { id: "tickers",   label: "📊 מניות",        color: "text-sky-400" },
  { id: "shchutot",  label: "🎯 שחוטות",       color: "text-emerald-400" },
  { id: "galsheni",  label: "🌊 גל שני",       color: "text-cyan-400" },
  { id: "news",      label: "📰 חדשות SEC",    color: "text-orange-400" },
  { id: "wpattern",  label: "〽️ W-Pattern",    color: "text-violet-400" },
  { id: "overnight", label: "🌙 Overnight",    color: "text-amber-400" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold border", color)}>
      {children}
    </span>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1E293B] last:border-0">
      <span className="text-xs text-[#94A3B8]">{label}</span>
      <div className="text-right">
        <span className="text-xs font-semibold text-[#F8FAFC]">{value}</span>
        {sub && <div className="text-[10px] text-[#475569]">{sub}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, status }: { title: string; count?: number; status?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-bold text-[#F8FAFC]">
        {title}
        {count !== undefined && (
          <span className="ml-2 rounded-full bg-[#1E293B] px-2 py-0.5 text-xs text-[#94A3B8]">{count}</span>
        )}
      </h2>
      {status && <span className="text-xs text-[#475569]">{status}</span>}
    </div>
  );
}

// ── Ticker card (Dashboard) ───────────────────────────────────────────────────

function TickerCard({ t }: { t: any }) {
  const gap = parseFloat(t.gap_pct ?? 0);
  const rvol = parseFloat(t.rvol ?? 0);
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0D1117] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#F8FAFC]">{t.symbol}</span>
          {t.accum_sh  && <Pill color="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">שחוטות</Pill>}
          {t.accum_gs  && <Pill color="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">גל שני</Pill>}
          {t.vol_alert && <Pill color="bg-red-500/10 text-red-400 border-red-500/30">🔥 VOL</Pill>}
          {t.is_new    && <Pill color="bg-amber-500/10 text-amber-400 border-amber-500/30">NEW</Pill>}
        </div>
        <span className={cn("text-sm font-bold", gap >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-[#64748B]">
        <div>
          <div className="text-[#94A3B8] font-semibold">${parseFloat(t.price ?? 0).toFixed(3)}</div>
          <div>מחיר</div>
        </div>
        <div>
          <div className="text-[#94A3B8] font-semibold">{rvol.toFixed(1)}x</div>
          <div>RVOL</div>
        </div>
        <div>
          <div className="text-[#94A3B8] font-semibold">{t.float_m ?? "—"}M</div>
          <div>Float</div>
        </div>
      </div>
    </div>
  );
}

// ── Accum card (שחוטות / גל שני) ─────────────────────────────────────────────

function AccumCard({ t, type }: { t: any; type: "sh" | "gs" }) {
  const isAlert = type === "sh" ? t.שחוטות_alert : (t.gal_sheni_alert || t.breakout);
  const alertColor = isAlert
    ? "border-emerald-500/40 bg-emerald-500/5"
    : "border-[#1E293B] bg-[#0D1117]";
  return (
    <div className={cn("rounded-lg border p-3", alertColor)}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[#F8FAFC]">{t.symbol}</span>
        <div className="flex gap-1">
          {isAlert && (
            <Pill color="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              {type === "gs" && t.breakout ? "פריצה" : "לפני פריצה"}
            </Pill>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        {t.gap_pct !== undefined && (
          <Row label="Leg ראשון" value={`+${parseFloat(t.gap_pct).toFixed(0)}%`} />
        )}
        {t.price !== undefined && (
          <Row label="מחיר" value={`$${parseFloat(t.price).toFixed(3)}`} />
        )}
        {t.rvol !== undefined && (
          <Row label="RVOL" value={`${parseFloat(t.rvol).toFixed(1)}x`} />
        )}
        {t.float_m !== undefined && (
          <Row label="Float" value={`${t.float_m}M`} />
        )}
      </div>
    </div>
  );
}

// ── News card ─────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: any }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0D1117] p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#F8FAFC]">{item.symbol}</span>
          <Pill color="bg-[#1E293B] text-[#94A3B8] border-[#334155]">{item.form}</Pill>
          {item.is_rs && <Pill color="bg-rose-500/10 text-rose-400 border-rose-500/30">RS</Pill>}
        </div>
        <span className="text-[10px] text-[#475569]">{item.filed?.slice(0, 10)}</span>
      </div>
      <p className="text-xs text-[#94A3B8] leading-relaxed">{item.summary}</p>
      {item.float_m && (
        <div className="mt-1.5 text-[10px] text-[#475569]">Float: {item.float_m}M</div>
      )}
    </div>
  );
}

// ── W-Pattern mini card ───────────────────────────────────────────────────────

function WCard({ sig }: { sig: WSignal }) {
  return (
    <div className={cn("rounded-lg border p-3", sig.triggered
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-[#1E293B] bg-[#0D1117]")}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[#F8FAFC]">{sig.ticker}</span>
        <div className="flex items-center gap-2">
          <span className="text-[#F59E0B] text-xs font-bold">1:{sig.rr_ratio.toFixed(1)}</span>
          {sig.triggered
            ? <Pill color="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">⚡ פרצה</Pill>
            : <Pill color="bg-amber-500/10 text-amber-400 border-amber-500/30">⏳ ממתין</Pill>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
        <div><div className="text-emerald-400 font-bold">${sig.entry}</div><div className="text-[#475569]">כניסה</div></div>
        <div><div className="text-rose-400 font-bold">${sig.sl}</div><div className="text-[#475569]">SL</div></div>
        <div><div className="text-[#059669] font-bold">${sig.tp2}</div><div className="text-[#475569]">TP2</div></div>
      </div>
    </div>
  );
}

// ── Overnight mini card ───────────────────────────────────────────────────────

function OvernightCard({ alert }: { alert: OvernightAlert }) {
  const match = alert.hour_str.match(/\[(.+?)\]/);
  const sess  = match?.[1] ?? "";
  const hour  = alert.hour_str.split(" ")[0];
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[#F8FAFC]">{alert.ticker}</span>
        <span className="text-amber-400 text-sm font-bold">×{alert.multiplier.toFixed(1)}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
        <div><div className="text-[#94A3B8] font-bold">{alert.last_hour_vol.toLocaleString()}</div><div className="text-[#475569]">מניות/שעה</div></div>
        <div><div className="text-[#94A3B8] font-bold">{hour}</div><div className="text-[#475569]">שעה IL</div></div>
        <div><div className="text-[#94A3B8] font-bold text-[9px]">{sess}</div><div className="text-[#475569]">סשן</div></div>
      </div>
    </div>
  );
}

// ── Overview panel ────────────────────────────────────────────────────────────

function Overview({ counts, statuses }: { counts: Record<string, number>; statuses: Record<string, string> }) {
  const items = [
    { label: "📊 מניות",      key: "tickers",   color: "text-sky-400",     href: "/dashboard" },
    { label: "🎯 שחוטות",     key: "shchutot",  color: "text-emerald-400", href: "/hub" },
    { label: "🌊 גל שני",     key: "galsheni",  color: "text-cyan-400",    href: "/hub" },
    { label: "📰 חדשות SEC",  key: "news",      color: "text-orange-400",  href: "/hub" },
    { label: "〽️ W-Pattern",  key: "wpattern",  color: "text-violet-400",  href: "/wpattern" },
    { label: "🌙 Overnight",  key: "overnight", color: "text-amber-400",   href: "/overnight" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map(({ label, key, color }) => (
        <div key={key} className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-4 text-center">
          <div className={cn("text-3xl font-bold", color)}>{counts[key] ?? 0}</div>
          <div className="mt-1 text-xs text-[#94A3B8]">{label}</div>
          {statuses[key] && (
            <div className="mt-1 text-[10px] text-[#475569] truncate">{statuses[key]}</div>
          )}
        </div>
      ))}
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function HubPage() {
  const [tab, setTab]           = useState("overview");
  const [showSettings, setShowSettings] = useState(false); // kept for potential future use

  // Standalone scanner data
  const [tickers,  setTickers]  = useState<any[]>([]);
  const [shchutot, setShchutot] = useState<any[]>([]);
  const [galSheni, setGalSheni] = useState<any[]>([]);
  const [news,     setNews]     = useState<any[]>([]);
  const [scanStatus, setScanStatus] = useState<Record<string, string>>({});

  // PennyAI data
  const [wSignals,  setWSignals]  = useState<WSignal[]>([]);
  const [overnight, setOvernight] = useState<OvernightAlert[]>([]);

  const [loading, setLoading] = useState(true);
  const [scannerOnline, setScannerOnline] = useState<boolean | null>(null);

  const fetchStandalone = useCallback(async () => {
    try {
      const data = await getScannerState();
      setTickers(data.tickers ?? []);
      setShchutot(data.shchutot ?? []);
      setGalSheni(data.gal_sheni ?? []);
      setNews(data.news ?? []);
      setScanStatus(data.status ?? {});
      setScannerOnline(data.pushed_at !== null);
    } catch {
      setScannerOnline(false);
    }
  }, []);

  const fetchPennyAI = useCallback(async () => {
    try {
      const [wData, oData] = await Promise.all([
        getWPatternState().catch(() => ({ signals: [] as WSignal[] })),
        getOvernightAlerts().catch(() => ({ alerts: [] as OvernightAlert[] })),
      ]);
      setWSignals(wData.signals ?? []);
      setOvernight(oData.alerts ?? []);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchStandalone(), fetchPennyAI()]);
    setLoading(false);
  }, [fetchStandalone, fetchPennyAI]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 20_000);
    return () => clearInterval(id);
  }, [loadAll]);

  const counts = {
    tickers:  tickers.length,
    shchutot: shchutot.filter((t) => t.שחוטות_alert).length,
    galsheni: galSheni.filter((t) => t.gal_sheni_alert || t.breakout).length,
    news:     news.length,
    wpattern: wSignals.length,
    overnight: overnight.length,
  };

  const totalAlerts = counts.shchutot + counts.galsheni + counts.wpattern + counts.overnight;

  return (
    <div className="flex min-h-screen bg-[#070A0F] text-[#F8FAFC]" dir="rtl">

      {/* Sidebar */}
      <aside className="w-44 shrink-0 border-l border-[#1E293B] bg-[#0B0E14] flex flex-col py-4">
        <div className="px-3 mb-4">
          <div className="text-xs font-bold text-[#94A3B8] mb-1">Hub הסורקים</div>
          {totalAlerts > 0 && (
            <div className="text-[10px] text-amber-400 font-semibold">{totalAlerts} התרעות פעילות</div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {TABS.map((t) => {
            const cnt = counts[t.id as keyof typeof counts];
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg px-2 py-2 text-xs font-medium transition-all text-right",
                  tab === t.id
                    ? "bg-[#131A26] text-[#F8FAFC]"
                    : "text-[#64748B] hover:bg-[#131A26] hover:text-[#F8FAFC]"
                )}
              >
                <span>{t.label}</span>
                {cnt !== undefined && cnt > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[9px] font-bold bg-[#1E293B]", t.color)}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 mt-4 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className={cn("h-1.5 w-1.5 rounded-full", scannerOnline === true ? "bg-emerald-400" : scannerOnline === false ? "bg-rose-400" : "bg-[#475569]")} />
            <span className="text-[#475569]">
              {scannerOnline === true ? "סורט מחובר" : scannerOnline === false ? "סורט מנותק" : "בודק..."}
            </span>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 text-[10px] text-[#475569] hover:text-[#94A3B8]"
          >
            <RefreshCw className="h-3 w-3" /> רענן הכל
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#64748B]">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> טוען...
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <div>
                <SectionHeader title="סקירת כל הסורקים" />
                <Overview counts={counts} statuses={scanStatus} />
                {scannerOnline === false && (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                    הסורט לא שלח נתונים עדיין — הפעל <code className="bg-[#1E293B] px-1 rounded text-xs">python standalone.py</code> ותמתין לסריקה הראשונה (~2 דקות).
                  </div>
                )}
              </div>
            )}

            {tab === "tickers" && (
              <div>
                <SectionHeader title="📊 מניות" count={tickers.length} status={scanStatus.tickers} />
                {tickers.length === 0
                  ? <Empty text="אין מניות — הפעל סריקה בסורט הנפרד" />
                  : <Grid>{tickers.map((t) => <TickerCard key={t.symbol} t={t} />)}</Grid>}
              </div>
            )}

            {tab === "shchutot" && (
              <div>
                <SectionHeader title="🎯 שחוטות" count={shchutot.length} status={scanStatus.shchutot} />
                {shchutot.length === 0
                  ? <Empty text="אין מניות שחוטות כרגע" />
                  : <Grid>{shchutot.map((t) => <AccumCard key={t.symbol} t={t} type="sh" />)}</Grid>}
              </div>
            )}

            {tab === "galsheni" && (
              <div>
                <SectionHeader title="🌊 גל שני" count={galSheni.length} status={scanStatus.galsheni} />
                {galSheni.length === 0
                  ? <Empty text="אין מניות גל שני כרגע" />
                  : <Grid>{galSheni.map((t) => <AccumCard key={t.symbol} t={t} type="gs" />)}</Grid>}
              </div>
            )}

            {tab === "news" && (
              <div>
                <SectionHeader title="📰 חדשות SEC" count={news.length} status={scanStatus.news} />
                {news.length === 0
                  ? <Empty text="אין חדשות — הפעל סריקת חדשות בסורט הנפרד" />
                  : <Grid cols1>{news.map((item, i) => <NewsCard key={i} item={item} />)}</Grid>}
              </div>
            )}

            {tab === "wpattern" && (
              <div>
                <SectionHeader title="〽️ W-Pattern" count={wSignals.length} />
                {wSignals.length === 0
                  ? <Empty text="אין סיגנלי W-Pattern — הסורט רץ כל דקה בשעות השוק" />
                  : <Grid>{wSignals.map((s, i) => <WCard key={i} sig={s} />)}</Grid>}
              </div>
            )}

            {tab === "overnight" && (
              <div>
                <SectionHeader title="🌙 Overnight" count={overnight.length} />
                {overnight.length === 0
                  ? <Empty text="אין התרעות לילה — ודא ש-overnight_tracker.py רץ" />
                  : <Grid>{overnight.map((a, i) => <OvernightCard key={i} alert={a} />)}</Grid>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Grid({ children, cols1 }: { children: React.ReactNode; cols1?: boolean }) {
  return (
    <div className={cn("grid gap-3", cols1 ? "grid-cols-1 max-w-2xl" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-10 text-center text-sm text-[#64748B]">
      {text}
    </div>
  );
}
