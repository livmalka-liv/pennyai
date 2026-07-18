import type { BacktestResult, StrategyConfig } from "@/types";
import { authHeader } from "@/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://backend-production-31a6f.up.railway.app/api/v1").replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader() },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail ?? "API error");
  }

  return res.json();
}

export async function parseStrategy(text: string, language = "en") {
  return apiFetch<{ strategy: StrategyConfig; confidence: number; warnings: string[] }>(
    "/backtest/parse",
    {
      method: "POST",
      body: JSON.stringify({ text, language }),
    }
  );
}

export async function runBacktest(strategy: StrategyConfig, userId = "demo"): Promise<BacktestResult> {
  // Convert camelCase frontend strategy → snake_case backend
  const payload = {
    user_id: userId,
    strategy: {
      name: strategy.name,
      description: strategy.description,
      rules: strategy.rules,
      slippage: strategy.slippage,
      timeframe: strategy.timeframe,
      lookback_years: strategy.lookbackYears,
    },
  };

  const controller = new AbortController();
  const minutes = Math.max(3, Math.ceil(strategy.lookbackYears * 0.5));
  const timeoutId = setTimeout(() => controller.abort(), minutes * 60_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>("/backtest/run", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  const m = raw.metrics;
  const s = raw.strategy;
  return {
    id: raw.id,
    status: raw.status,
    createdAt: raw.created_at,
    strategy: {
      name: s.name,
      description: s.description,
      rules: s.rules,
      slippage: s.slippage,
      timeframe: s.timeframe,
      lookbackYears: s.lookback_years,
    },
    metrics: {
      totalRoi: m.total_roi,
      winRate: m.win_rate,
      profitFactor: m.profit_factor,
      maxDrawdown: m.max_drawdown,
      avgReturnPerTrade: m.avg_return_per_trade,
      totalTrades: m.total_trades,
      winningTrades: m.winning_trades,
      losingTrades: m.losing_trades,
      avgHoldingMinutes: m.avg_holding_minutes,
      sharpeRatio: m.sharpe_ratio,
      avgTradesPerMonth: m.avg_trades_per_month ?? 0,
      avgOpportunitiesPerDay: m.avg_opportunities_per_day ?? 0,
      bestTrade: m.best_trade ?? 0,
      worstTrade: m.worst_trade ?? 0,
      avgWin: m.avg_win ?? 0,
      avgLoss: m.avg_loss ?? 0,
      consecutiveWins: m.consecutive_wins ?? 0,
      consecutiveLosses: m.consecutive_losses ?? 0,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equityCurve: (raw.equity_curve ?? []).map((p: any) => ({ date: p.date, equity: p.equity })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trades: (raw.trades ?? []).map((t: any) => ({
      id: t.id,
      ticker: t.ticker,
      date: t.date,
      type: t.type ?? "Long",
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      returnPct: t.return_pct,
      holdingMinutes: t.holding_minutes,
      volume: t.volume,
      float: t.float_shares,
      exitReason: t.exit_reason ?? undefined,
      rvol: t.rvol ?? undefined,
      catalyst: t.catalyst_type ?? undefined,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    durabilityByYear: (raw.durability_by_year ?? []).map((d: any) => ({
      period: d.period,
      roi: d.roi,
      winRate: d.win_rate,
      trades: d.trades,
      sharpe: d.sharpe,
    })),
  };
}

export async function getActiveStrategies(): Promise<ActiveStrategy[]> {
  return apiFetch<ActiveStrategy[]>("/live-strategies/");
}

export interface ActiveStrategy {
  tracker_id: string;
  name: string;
  started_at: string | null;
  config: Record<string, unknown>;
}

export async function deactivateStrategy(trackerId: string): Promise<void> {
  await apiFetch(`/live-strategies/${trackerId}`, { method: "DELETE" });
}

export async function activateForLiveScan(strategy: StrategyConfig): Promise<{ tracker_id: string }> {
  return apiFetch("/live-strategies/activate", {
    method: "POST",
    body: JSON.stringify({
      strategy: {
        name: strategy.name,
        description: strategy.description,
        rules: strategy.rules,
        slippage: strategy.slippage,
        timeframe: strategy.timeframe,
        lookback_years: strategy.lookbackYears,
      },
    }),
  });
}

export async function getMySignals(params: { days?: number; fromDate?: string; toDate?: string } = {}) {
  const { days = 7, fromDate, toDate } = params;
  const q = new URLSearchParams();
  if (fromDate && toDate) {
    q.set("from_date", fromDate);
    q.set("to_date", toDate);
  } else {
    q.set("days", String(days));
  }
  return apiFetch<SignalRow[]>(`/live-strategies/signals?${q.toString()}`);
}

export interface SignalRow {
  id: string;
  strategy_name: string;
  ticker: string;
  trade_date: string;
  entry_time_et: string;
  entry_price: number;
  tp_price: number | null;
  sl_price: number | null;
  exit_price: number | null;
  exit_time: string | null;
  exit_reason: string | null;
  return_pct: number | null;
  dollars_gain: number | null;
  hold_minutes: number | null;
  status: "open" | "win" | "loss" | "flat";
  catalyst: string | null;
  rvol: number | null;
}

export interface StrategyStat {
  tracker_id: string;
  name: string;
  is_active: boolean;
  for_sale: boolean;
  total_trades: number;
  open_trades: number;
  win_count: number;
  win_rate: number;
  total_dollars: number;
  first_trade_date: string | null;
  trading_days_live: number;
  is_proven: boolean;
  started_at: string | null;
}

export async function getStrategyStats(): Promise<StrategyStat[]> {
  return apiFetch<StrategyStat[]>("/live-strategies/stats");
}

export async function toggleForSale(trackerId: string): Promise<{ tracker_id: string; for_sale: boolean }> {
  return apiFetch(`/live-strategies/${trackerId}/for-sale`, { method: "PATCH" });
}

export async function runTrackerBacktest(trackerId: string): Promise<BacktestResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(`/live-strategies/${trackerId}/backtest`, { method: "POST" });
  const m = raw.metrics;
  const s = raw.strategy;
  return {
    id: raw.id,
    status: raw.status,
    createdAt: raw.created_at,
    strategy: {
      name: s.name,
      description: s.description,
      rules: s.rules,
      slippage: s.slippage,
      timeframe: s.timeframe,
      lookbackYears: s.lookback_years,
    },
    metrics: {
      totalRoi: m.total_roi,
      winRate: m.win_rate,
      profitFactor: m.profit_factor,
      maxDrawdown: m.max_drawdown,
      avgReturnPerTrade: m.avg_return_per_trade,
      totalTrades: m.total_trades,
      winningTrades: m.winning_trades,
      losingTrades: m.losing_trades,
      avgHoldingMinutes: m.avg_holding_minutes,
      sharpeRatio: m.sharpe_ratio,
      avgTradesPerMonth: m.avg_trades_per_month ?? 0,
      avgOpportunitiesPerDay: m.avg_opportunities_per_day ?? 0,
      bestTrade: m.best_trade ?? 0,
      worstTrade: m.worst_trade ?? 0,
      avgWin: m.avg_win ?? 0,
      avgLoss: m.avg_loss ?? 0,
      consecutiveWins: m.consecutive_wins ?? 0,
      consecutiveLosses: m.consecutive_losses ?? 0,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equityCurve: (raw.equity_curve ?? []).map((p: any) => ({ date: p.date, equity: p.equity })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trades: (raw.trades ?? []).map((t: any) => ({
      id: t.id, ticker: t.ticker, date: t.date, type: t.type ?? "Long",
      entryPrice: t.entry_price, exitPrice: t.exit_price, returnPct: t.return_pct,
      holdingMinutes: t.holding_minutes, volume: t.volume, float: t.float_shares,
      exitReason: t.exit_reason ?? undefined, rvol: t.rvol ?? undefined,
      catalyst: t.catalyst_type ?? undefined,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    durabilityByYear: (raw.durability_by_year ?? []).map((d: any) => ({
      period: d.period, roi: d.roi, winRate: d.win_rate, trades: d.trades, sharpe: d.sharpe,
    })),
  };
}

export async function clarifyStrategy(
  description: string,
  conversation: { role: "user" | "assistant"; content: string }[]
): Promise<{ message: string; is_ready: boolean; refined_description?: string }> {
  return apiFetch("/backtest/clarify", {
    method: "POST",
    body: JSON.stringify({ description, conversation, language: "he" }),
  });
}

export async function getVaultStrategies(tier = "free") {
  return apiFetch<any[]>(`/strategies/vault?tier=${tier}`);
}

export interface ScanStatus {
  market_open: boolean;
  scan_window_active: boolean;
  time_israel: string;
  time_et: string;
  market_opens_israel: string;
  market_closes_israel: string;
  data_source: string;
  active_strategies: { id: string; name: string }[];
  tracked_tickers: string[];
  tracked_count: number;
}

export async function getScanStatus(): Promise<ScanStatus> {
  // Use public endpoint (no auth) so status shows even before login
  const API_BASE_RAW = (process.env.NEXT_PUBLIC_API_URL || "https://backend-production-31a6f.up.railway.app/api/v1").replace(/\/$/, "");
  const base = API_BASE_RAW.replace(/\/api\/v1$/, "");
  const res = await fetch(`${base}/api/v1/market-clock`);
  if (!res.ok) throw new Error("scan status failed");
  const data = await res.json();
  // Merge with empty user fields
  return {
    ...data,
    active_strategies: data.active_strategies ?? [],
  };
}

export async function createCheckout(tier: string, billing: "monthly" | "yearly") {
  return apiFetch<{ url: string }>("/stripe/create-checkout", {
    method: "POST",
    body: JSON.stringify({ tier, billing }),
  });
}

export async function getBillingPortal() {
  return apiFetch<{ url: string }>("/stripe/portal");
}

// ── Paper Trading Lab ─────────────────────────────────────────────────────────

export interface PaperTradeStat {
  name: string;
  wins: number;
  losses: number;
  open: number;
  total_trades: number;
  win_rate: number;
  total_pnl: number;
}

export interface PaperTradeRow {
  id: string;
  strategy_name: string;
  ticker: string;
  trade_date: string;
  entry_time_et: string;
  exit_time: string | null;
  entry_price: number;
  tp_price: number | null;
  sl_price: number | null;
  exit_price: number | null;
  exit_reason: string | null;
  return_pct: number | null;
  dollars_gain: number | null;
  hold_minutes: number | null;
  status: "open" | "win" | "loss" | "flat";
  catalyst: string | null;
  rvol: number | null;
  current_price: number | null;
  live_pnl: number | null;
  live_pnl_pct: number | null;
  slippage_entry_cents: number | null;
}

export interface PaperDashboard {
  strategy_stats: PaperTradeStat[];
  trades: PaperTradeRow[];
  total_open: number;
  total_today: number;
}

export async function getPaperDashboard(days = 30): Promise<PaperDashboard> {
  return apiFetch<PaperDashboard>(`/live-strategies/paper-dashboard?days=${days}`);
}

export interface CandleBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getTradeCandles(ticker: string, tradeDate: string): Promise<CandleBar[]> {
  const data = await apiFetch<{ candles: CandleBar[] }>(
    `/live-strategies/candles?ticker=${encodeURIComponent(ticker)}&trade_date=${encodeURIComponent(tradeDate)}`
  );
  return data.candles ?? [];
}

// ── W-Pattern Scanner ────────────────────────────────────────────────────────

export interface WZone {
  label: string;
  high: number;
  low: number;
  mid: number;
  target: number;
  v_run: number;
  bars: number;
}

export interface WSignal {
  ticker: string;
  zone_key: string;
  zone_label: string;
  mid_zone: number;
  b1_low: number;
  b1_time: string;
  apex_high: number;
  apex_time: string;
  b2_low: number;
  b2_time: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  risk: number;
  reward: number;
  rr_ratio: number;
  triggered: boolean;
  detected_at: string;
}

export interface WUniverseItem {
  ticker: string;
  gain_pct: number;
  price: number;
  rvol: number;
}

export interface WState {
  universe: WUniverseItem[];
  zones: Record<string, Record<string, WZone>>;
  signals: WSignal[];
  last_scan: string | null;
  signal_count: number;
}

export async function getWPatternState(): Promise<WState> {
  return apiFetch<WState>("/wpattern/state");
}

export async function getWPatternSignals(): Promise<{ signals: WSignal[]; signal_count: number; last_scan: string | null }> {
  return apiFetch("/wpattern/signals");
}

export async function getWPatternZones(ticker: string): Promise<{ ticker: string; zones: Record<string, WZone> }> {
  return apiFetch(`/wpattern/zones/${encodeURIComponent(ticker)}`);
}

export async function getWPatternCandles(ticker: string): Promise<{ ticker: string; candles: CandleBar[] }> {
  return apiFetch(`/wpattern/candles/${encodeURIComponent(ticker)}`);
}

export async function triggerWPatternScan(): Promise<{ status: string }> {
  return apiFetch("/wpattern/scan", { method: "POST" });
}

// ── Scanner push state ────────────────────────────────────────────────────────

export interface SupportAlert {
  symbol:       string;
  price:        number;
  support:      number;
  support_name: string;
  pct_from:     number;
  approaching:  boolean;
  all_levels:   Record<string, number>;
  vol_ratio:    number;
  rise_vol:     number;
  fall_vol:     number;
  session:      string;
}

export interface ScannerState {
  tickers:   any[];
  shchutot:  any[];
  gal_sheni: any[];
  news:      any[];
  support:   SupportAlert[];
  status:    Record<string, string>;
  pushed_at: string | null;
}

export async function getScannerState(): Promise<ScannerState> {
  return apiFetch<ScannerState>("/scanner/state");
}

// ── Overnight Alerts ─────────────────────────────────────────────────────────

export interface OvernightAlert {
  ticker: string;
  hour_str: string;
  last_hour_vol: number;
  multiplier: number;
  price: number | null;
  baseline: number | null;
  received_at: string;
}

export async function getOvernightAlerts(): Promise<{ alerts: OvernightAlert[]; count: number }> {
  return apiFetch("/overnight/alerts");
}
