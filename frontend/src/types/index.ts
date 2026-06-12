export type SubscriptionTier = "free" | "tester" | "pro" | "elite";

export type LookbackYears = 1 | 3 | 5 | 10 | 15 | 20;

export interface User {
  id: string;
  email: string;
  name: string;
  tier: SubscriptionTier;
  backtestsThisMonth: number;
}

export interface StrategyRule {
  type: "entry" | "exit" | "filter";
  condition: string;
  parameters: Record<string, string | number | boolean>;
}

export interface StrategyConfig {
  name: string;
  description: string;
  rules: StrategyRule[];
  slippage: number;
  timeframe: "1m" | "5m" | "15m" | "1D";
  lookbackYears: LookbackYears;
}

export interface Trade {
  id: string;
  ticker: string;
  date: string;
  type: "Long";
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  holdingMinutes: number;
  volume: number;
  float: number;
  catalyst?: string;
  exitReason?: "take_profit" | "stop_loss" | "eod_close";
  rvol?: number;
}

export interface BacktestMetrics {
  totalRoi: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  avgReturnPerTrade: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgHoldingMinutes: number;
  sharpeRatio: number;
  avgTradesPerMonth: number;
  avgOpportunitiesPerDay: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface DurabilityPeriod {
  period: string;
  roi: number;
  winRate: number;
  trades: number;
  sharpe: number;
}

export interface BacktestResult {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  strategy: StrategyConfig;
  metrics: BacktestMetrics;
  equityCurve: { date: string; equity: number }[];
  trades: Trade[];
  durabilityByYear: DurabilityPeriod[];
  createdAt: string;
}

export interface VaultStrategy {
  id: string;
  name: string;
  tagline: string;
  description: string;
  verifiedRoi: number;
  verifiedYears: number;
  winRate: number;
  totalTrades: number;
  thumbnailGradient: string;
  videoUrl: string | null;
  config: StrategyConfig;
  tier: SubscriptionTier;
}
