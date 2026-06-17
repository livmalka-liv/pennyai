"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseStrategy, runBacktest } from "@/lib/api";
import type { BacktestResult } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type YearsOption = 1 | 3 | 5 | 10 | 15 | 20;

interface LabStrategy {
  id: string;
  name: string;
  description: string;
  years: YearsOption;
  status: "idle" | "running" | "done" | "error";
  result?: BacktestResult;
  error?: string;
}

const STORAGE_KEY = "strategy_lab_strategies";
const MAX_STRATEGIES = 15;
const YEARS_OPTIONS: YearsOption[] = [1, 3, 5, 10, 15, 20];

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadFromStorage(): LabStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LabStrategy[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(strategies: LabStrategy[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  } catch {
    // ignore quota errors
  }
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LabStrategy["status"] }) {
  if (status === "idle")
    return (
      <span className="flex items-center gap-1 rounded-full border border-[#1E293B] px-2 py-0.5 text-[10px] font-medium text-[#64748B]">
        <Clock className="h-3 w-3" />
        טרם נבדק
      </span>
    );
  if (status === "running")
    return (
      <span className="flex items-center gap-1 rounded-full border border-[#6366F1]/40 bg-[#6366F1]/10 px-2 py-0.5 text-[10px] font-medium text-[#6366F1]">
        <RefreshCw className="h-3 w-3 animate-spin" />
        בודק...
      </span>
    );
  if (status === "done")
    return (
      <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        ✓ הושלם
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
      <XCircle className="h-3 w-3" />
      ✗ נכשל
    </span>
  );
}

// ── Metric card ────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#080B10] px-4 py-4">
      <div className="mb-1 text-xs text-[#64748B]">{label}</div>
      <div className={cn("text-xl font-bold", color ?? "text-[#F8FAFC]")}>
        {value}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StrategyLabPage() {
  const [strategies, setStrategies] = useState<LabStrategy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setStrategies(stored);
    if (stored.length > 0) setSelectedId(stored[0].id);
  }, []);

  // Persist to localStorage whenever strategies change
  useEffect(() => {
    saveToStorage(strategies);
  }, [strategies]);

  // Derived selected strategy
  const selected = strategies.find((s) => s.id === selectedId) ?? null;

  // ── Mutators ─────────────────────────────────────────────────────────────────

  const addStrategy = useCallback(() => {
    if (strategies.length >= MAX_STRATEGIES) return;
    const newStrat: LabStrategy = {
      id: generateId(),
      name: `אסטרטגיה ${strategies.length + 1}`,
      description: "",
      years: 5,
      status: "idle",
    };
    setStrategies((prev) => [...prev, newStrat]);
    setSelectedId(newStrat.id);
  }, [strategies.length]);

  const deleteStrategy = useCallback(
    (id: string) => {
      setStrategies((prev) => {
        const next = prev.filter((s) => s.id !== id);
        return next;
      });
      setSelectedId((prev) => {
        if (prev !== id) return prev;
        const remaining = strategies.filter((s) => s.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    },
    [strategies]
  );

  const updateSelected = useCallback(
    (patch: Partial<LabStrategy>) => {
      if (!selectedId) return;
      setStrategies((prev) =>
        prev.map((s) => (s.id === selectedId ? { ...s, ...patch } : s))
      );
    },
    [selectedId]
  );

  // ── Run backtest ──────────────────────────────────────────────────────────────

  const runForStrategy = useCallback(
    async (id: string) => {
      const strat = strategies.find((s) => s.id === id);
      if (!strat || strat.status === "running") return;

      // Mark running
      setStrategies((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "running", error: undefined, result: undefined } : s
        )
      );

      try {
        // 1. Parse the natural-language description
        const { strategy: parsedConfig } = await parseStrategy(strat.description, "he");

        // Apply the user's chosen years and name
        const configWithYears = {
          ...parsedConfig,
          name: strat.name,
          lookbackYears: strat.years,
        };

        // 2. Run the backtest
        const result = await runBacktest(configWithYears);

        setStrategies((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, status: "done", result } : s
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
        setStrategies((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, status: "error", error: message } : s
          )
        );
      }
    },
    [strategies]
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC]" dir="rtl">
      {/* Page header */}
      <div className="border-b border-[#1E293B] bg-[#080B10] px-6 py-5">
        <div className="mx-auto max-w-screen-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#6366F1]/20 bg-[#6366F1]/10">
              <span className="text-lg">🧪</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Strategy Lab</h1>
              <p className="mt-0.5 text-sm text-[#64748B]">
                צור ובדוק עד 15 אסטרטגיות מסחר בשפה טבעית
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="mx-auto max-w-screen-xl px-6 py-6">
        <div className="flex gap-5 items-start">
          {/* ── Left panel: strategy list ───────────────────────────────────── */}
          <div className="w-80 shrink-0">
            <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
              <div className="border-b border-[#1E293B] px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#F8FAFC]">
                  אסטרטגיות ({strategies.length}/{MAX_STRATEGIES})
                </span>
              </div>

              {/* Strategy cards */}
              <div className="divide-y divide-[#1E293B]">
                {strategies.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <Clock className="mx-auto mb-3 h-8 w-8 text-[#1E293B]" />
                    <p className="text-sm text-[#64748B]">אין אסטרטגיות עדיין</p>
                    <p className="mt-1 text-xs text-[#475569]">
                      לחץ "הוסף אסטרטגיה" כדי להתחיל
                    </p>
                  </div>
                )}

                {strategies.map((strat) => (
                  <div
                    key={strat.id}
                    onClick={() => setSelectedId(strat.id)}
                    className={cn(
                      "group relative cursor-pointer px-4 py-3 transition-colors",
                      selectedId === strat.id
                        ? "bg-[#131A26]"
                        : "hover:bg-[#0F1520]"
                    )}
                  >
                    {/* Left accent bar for selected */}
                    {selectedId === strat.id && (
                      <div className="absolute inset-y-0 right-0 w-0.5 bg-[#6366F1] rounded-l" />
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#F8FAFC]">
                          {strat.name || "ללא שם"}
                        </p>
                        {strat.description && (
                          <p className="mt-0.5 truncate text-xs text-[#64748B]">
                            {strat.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <StatusBadge status={strat.status} />
                          <span className="text-[10px] text-[#475569]">
                            {strat.years}Y
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            runForStrategy(strat.id);
                          }}
                          disabled={strat.status === "running"}
                          title="הרץ בדיקה"
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                            strat.status === "running"
                              ? "cursor-not-allowed text-[#6366F1]/40"
                              : "text-[#6366F1] hover:bg-[#6366F1]/10"
                          )}
                        >
                          {strat.status === "running" ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStrategy(strat.id);
                          }}
                          title="מחק אסטרטגיה"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add button */}
              <div className="border-t border-[#1E293B] p-3">
                <button
                  onClick={addStrategy}
                  disabled={strategies.length >= MAX_STRATEGIES}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                    strategies.length >= MAX_STRATEGIES
                      ? "cursor-not-allowed border-[#1E293B] text-[#475569]"
                      : "border-[#6366F1]/30 text-[#6366F1] hover:bg-[#6366F1]/10"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  הוסף אסטרטגיה
                  {strategies.length >= MAX_STRATEGIES && (
                    <span className="text-xs text-[#475569]">(מקסימום הגעת)</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right panel: editor + results ───────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] py-24 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1E293B] bg-[#080B10]">
                  <span className="text-3xl">🧪</span>
                </div>
                <h3 className="text-lg font-semibold text-[#F8FAFC]">
                  בחר או צור אסטרטגיה
                </h3>
                <p className="mt-2 text-sm text-[#64748B]">
                  בחר אסטרטגיה מהרשימה משמאל, או לחץ "הוסף אסטרטגיה" להתחלה
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Editor card */}
                <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-6">
                  <h2 className="mb-5 text-base font-semibold text-[#F8FAFC]">
                    עריכת אסטרטגיה
                  </h2>

                  {/* Name */}
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-[#64748B] uppercase tracking-wider">
                      שם האסטרטגיה
                    </label>
                    <input
                      type="text"
                      value={selected.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      placeholder="שם האסטרטגיה"
                      className="w-full rounded-lg border border-[#1E293B] bg-[#080B10] px-3 py-2.5 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1] transition-colors"
                    />
                  </div>

                  {/* Description */}
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-medium text-[#64748B] uppercase tracking-wider">
                      תיאור האסטרטגיה
                    </label>
                    <textarea
                      value={selected.description}
                      onChange={(e) =>
                        updateSelected({ description: e.target.value })
                      }
                      rows={6}
                      placeholder="תאר את האסטרטגיה שלך... לדוגמה: גאפ אפ >30% על קטליסט FDA, פלואט <5M, RVOL >5, כניסה על חזרה ל-VWAP אחרי 9:45"
                      className="w-full resize-y rounded-lg border border-[#1E293B] bg-[#080B10] px-3 py-2.5 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1] transition-colors leading-relaxed"
                    />
                  </div>

                  {/* Years selector */}
                  <div className="mb-6">
                    <label className="mb-2 block text-xs font-medium text-[#64748B] uppercase tracking-wider">
                      תקופת בדיקה
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {YEARS_OPTIONS.map((y) => (
                        <button
                          key={y}
                          onClick={() => updateSelected({ years: y })}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm font-semibold transition-all",
                            selected.years === y
                              ? "border-[#6366F1] bg-[#6366F1]/15 text-[#6366F1]"
                              : "border-[#1E293B] text-[#64748B] hover:border-[#263147] hover:text-[#94A3B8]"
                          )}
                        >
                          {y}Y
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Run button */}
                  <button
                    onClick={() => runForStrategy(selected.id)}
                    disabled={
                      selected.status === "running" || !selected.description.trim()
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
                      selected.status === "running" || !selected.description.trim()
                        ? "cursor-not-allowed bg-[#6366F1]/30 text-[#6366F1]/50"
                        : "bg-[#6366F1] text-white hover:bg-[#5254CC] active:scale-[0.98]"
                    )}
                  >
                    {selected.status === "running" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {selected.status === "running" ? "בודק..." : "הרץ בדיקה עמוקה"}
                  </button>

                  {/* Error */}
                  {selected.status === "error" && selected.error && (
                    <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        <div>
                          <p className="text-sm font-medium text-rose-400">הבדיקה נכשלה</p>
                          <p className="mt-0.5 text-xs text-rose-400/80">{selected.error}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Results card */}
                {selected.status === "done" && selected.result && (
                  <ResultsPanel result={selected.result} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Results panel ──────────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: BacktestResult }) {
  const m = result.metrics;

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-emerald-400" />
        <h2 className="text-base font-semibold text-[#F8FAFC]">תוצאות הבדיקה</h2>
        <span className="text-xs text-[#64748B]">({result.strategy.lookbackYears} שנים)</span>
      </div>

      {/* 4 metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <MetricCard
          label="Win Rate"
          value={`${m.winRate.toFixed(1)}%`}
          color={
            m.winRate >= 60
              ? "text-emerald-400"
              : m.winRate >= 45
              ? "text-yellow-400"
              : "text-rose-400"
          }
        />
        <MetricCard
          label="תשואה כוללת"
          value={fmtPct(m.totalRoi)}
          color={m.totalRoi >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <MetricCard
          label="סה\"כ עסקאות"
          value={String(m.totalTrades)}
        />
        <MetricCard
          label="Max Drawdown"
          value={fmtPct(m.maxDrawdown)}
          color={m.maxDrawdown <= -20 ? "text-rose-400" : m.maxDrawdown <= -10 ? "text-yellow-400" : "text-emerald-400"}
        />
      </div>

      {/* Secondary metrics */}
      <div className="mb-6 rounded-lg border border-[#1E293B] bg-[#080B10] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
          מדדים נוספים
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {[
            { label: "Profit Factor", value: m.profitFactor.toFixed(2) },
            { label: "Sharpe Ratio", value: m.sharpeRatio.toFixed(2) },
            { label: "עסקאות מנצחות", value: String(m.winningTrades) },
            { label: "עסקאות מפסידות", value: String(m.losingTrades) },
            { label: "ממוצע לעסקה", value: fmtPct(m.avgReturnPerTrade) },
            { label: "זמן ממוצע (דק׳)", value: String(m.avgHoldingMinutes) },
            { label: "עסקאות לחודש", value: m.avgTradesPerMonth.toFixed(1) },
            { label: "עסקה טובה ביותר", value: fmtPct(m.bestTrade) },
            { label: "עסקה גרועה ביותר", value: fmtPct(m.worstTrade) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-[#64748B]">{label}</span>
              <span className="font-mono text-[#F8FAFC]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Burn analysis verdict */}
      {result.burn_analysis && (
        <BurnVerdict burn={result.burn_analysis} />
      )}

      {/* Equity curve (text) */}
      {result.equityCurve && result.equityCurve.length > 0 && (
        <EquityCurveText curve={result.equityCurve} />
      )}

      {/* Durability by year */}
      {result.durabilityByYear && result.durabilityByYear.length > 0 && (
        <DurabilityTable rows={result.durabilityByYear} />
      )}
    </div>
  );
}

// ── Burn analysis verdict ──────────────────────────────────────────────────────

function BurnVerdict({
  burn,
}: {
  burn: NonNullable<BacktestResult["burn_analysis"]>;
}) {
  const isRuined = burn.ruin_occurred;
  return (
    <div
      className={cn(
        "mb-6 rounded-lg border p-4",
        isRuined
          ? "border-rose-500/30 bg-rose-500/10"
          : "border-emerald-500/30 bg-emerald-500/10"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {isRuined ? (
          <XCircle className="h-4 w-4 text-rose-400" />
        ) : (
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        )}
        <span
          className={cn(
            "text-sm font-semibold",
            isRuined ? "text-rose-400" : "text-emerald-400"
          )}
        >
          ניתוח שחיקה (Burn Analysis)
        </span>
      </div>
      <p
        className={cn(
          "text-sm leading-relaxed",
          isRuined ? "text-rose-300" : "text-emerald-300"
        )}
      >
        {burn.verdict}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div>
          <span className="text-[#64748B]">מקס׳ drawdown: </span>
          <span className={isRuined ? "text-rose-300" : "text-emerald-300"}>
            {fmtPct(burn.max_drawdown_pct)}
          </span>
        </div>
        <div>
          <span className="text-[#64748B]">הפסדים רצופים מקס׳: </span>
          <span className="text-[#F8FAFC]">{burn.max_consecutive_losses}</span>
        </div>
        {burn.longest_flat_days > 0 && (
          <div>
            <span className="text-[#64748B]">ימי flat מקס׳: </span>
            <span className="text-[#F8FAFC]">{burn.longest_flat_days}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Equity curve (text representation) ────────────────────────────────────────

function EquityCurveText({
  curve,
}: {
  curve: { date: string; equity: number }[];
}) {
  // Sample up to ~12 evenly-spaced points
  const step = Math.max(1, Math.floor(curve.length / 12));
  const sampled = curve.filter((_, i) => i % step === 0 || i === curve.length - 1);
  const startEquity = sampled[0]?.equity ?? 0;
  const endEquity = sampled[sampled.length - 1]?.equity ?? 0;
  const totalGain = endEquity - startEquity;

  return (
    <div className="mb-6 rounded-lg border border-[#1E293B] bg-[#080B10] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
        עקומת הון (Equity Curve)
      </h3>
      <div className="mb-2 flex items-center gap-3 text-xs">
        <span className="text-[#64748B]">התחלה: <span className="font-mono text-[#F8FAFC]">${startEquity.toLocaleString()}</span></span>
        <span className="text-[#64748B]">סוף: <span className="font-mono text-[#F8FAFC]">${endEquity.toLocaleString()}</span></span>
        <span className={cn("font-mono font-semibold", totalGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {totalGain >= 0 ? "+" : ""}${totalGain.toLocaleString()}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#64748B]">
              <th className="py-1 text-right font-medium pl-2">תאריך</th>
              <th className="py-1 text-left font-medium pr-2">הון ($)</th>
              <th className="py-1 text-left font-medium pr-2">שינוי</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B]">
            {sampled.map((point, i) => {
              const prev = sampled[i - 1];
              const delta = prev ? point.equity - prev.equity : 0;
              return (
                <tr key={point.date} className="hover:bg-[#0D1117]">
                  <td className="py-1 text-right text-[#64748B] pl-2 font-mono">
                    {point.date}
                  </td>
                  <td className="py-1 text-left text-[#F8FAFC] pr-2 font-mono">
                    ${point.equity.toLocaleString()}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-left pr-2 font-mono",
                      i === 0 ? "text-[#64748B]" : delta >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {i === 0 ? "—" : `${delta >= 0 ? "+" : ""}$${delta.toLocaleString()}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Durability by year ─────────────────────────────────────────────────────────

function DurabilityTable({
  rows,
}: {
  rows: BacktestResult["durabilityByYear"];
}) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#080B10] overflow-hidden">
      <div className="border-b border-[#1E293B] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
          עמידות לאורך שנים
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1E293B] text-[#64748B]">
              <th className="px-4 py-2.5 text-right font-medium">תקופה</th>
              <th className="px-4 py-2.5 text-center font-medium">ROI</th>
              <th className="px-4 py-2.5 text-center font-medium">Win%</th>
              <th className="px-4 py-2.5 text-center font-medium">עסקאות</th>
              <th className="px-4 py-2.5 text-center font-medium">Sharpe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B]">
            {rows.map((row) => (
              <tr key={row.period} className="hover:bg-[#0D1117] transition-colors">
                <td className="px-4 py-2.5 text-right font-mono text-[#94A3B8]">
                  {row.period}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-center font-mono",
                    row.roi >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}
                >
                  {fmtPct(row.roi)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-semibold",
                      row.winRate >= 60
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : row.winRate >= 45
                        ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    )}
                  >
                    {row.winRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center text-[#94A3B8]">
                  {row.trades}
                </td>
                <td className="px-4 py-2.5 text-center font-mono text-[#94A3B8]">
                  {row.sharpe.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
