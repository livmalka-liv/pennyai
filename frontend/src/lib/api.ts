import type { BacktestResult, StrategyConfig } from "@/types";
import { authHeader } from "@/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

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

export async function getVaultStrategies(tier = "free") {
  return apiFetch<any[]>(`/strategies/vault?tier=${tier}`);
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
