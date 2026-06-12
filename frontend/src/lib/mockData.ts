import type { BacktestResult, VaultStrategy, Trade, DurabilityPeriod, BacktestMetrics, LookbackYears } from "@/types";

const TICKERS = ["TNXP", "MULN", "SNDL", "MVIS", "WKHS", "FFIE", "NKLA", "IDEX", "GOVX", "CNTX", "PROG", "BCRX", "OCGN", "GFAI", "VERB", "ATER", "CLOV", "EXPR", "BBIG", "SPRT"];
const CATALYSTS = ["FDA Approval", "Earnings Beat", "PR Announcement", "Short Squeeze", "Halt Resume", "Sector News", "Insider Buy", "Partnership"];
const EXIT_REASONS = ["take_profit", "stop_loss", "eod_close"] as const;

function generateEquityCurve(finalRoi: number, years: number): { date: string; equity: number }[] {
  const result: { date: string; equity: number }[] = [];
  const points = years * 52;
  let equity = 10000;
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  for (let i = 0; i < points; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.floor((i / points) * 365 * years));
    const progress = i / points;
    const trend = 1 + (finalRoi / 100) * progress;
    const noise = 1 + (Math.random() - 0.48) * 0.06;
    equity = 10000 * trend * noise;
    result.push({ date: d.toISOString().split("T")[0], equity: Math.round(equity) });
  }
  return result;
}

function generateTrades(count: number, seed = 42): Trade[] {
  const trades: Trade[] = [];
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };

  for (let i = 0; i < count; i++) {
    const isWin = rand() > 0.36;
    const isTPExit = isWin && rand() > 0.3;
    const exitReason: Trade["exitReason"] = isTPExit ? "take_profit" : isWin ? "eod_close" : rand() > 0.4 ? "stop_loss" : "eod_close";
    const returnPct = isWin
      ? +(rand() * 22 + 2).toFixed(2)
      : -(rand() * 7 + 0.5).toFixed(2);

    const daysAgo = Math.floor(rand() * 365 * 5);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);

    const entryPrice = +(rand() * 8 + 1.2).toFixed(2);
    const exitMultiplier = 1 + returnPct / 100;

    trades.push({
      id: `T${String(i + 1).padStart(4, "0")}`,
      ticker: TICKERS[i % TICKERS.length],
      date: d.toISOString().split("T")[0],
      type: "Long",
      entryPrice,
      exitPrice: +(entryPrice * exitMultiplier).toFixed(2),
      returnPct,
      holdingMinutes: Math.floor(rand() * 180 + 5),
      volume: Math.floor(rand() * 15000000 + 500000),
      float: Math.floor(rand() * 18000000 + 1000000),
      catalyst: CATALYSTS[Math.floor(rand() * CATALYSTS.length)],
      exitReason,
      rvol: +(rand() * 12 + 2).toFixed(1),
    });
  }
  return trades.sort((a, b) => a.date.localeCompare(b.date));
}

function calcMetrics(trades: Trade[], years: number): BacktestMetrics {
  const returns = trades.map(t => t.returnPct);
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);

  let equity = 10000, peak = 10000, maxDd = 0;
  for (const r of returns) {
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak * 100;
    if (dd > maxDd) maxDd = dd;
  }
  const finalRoi = ((equity - 10000) / 10000) * 100;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  let maxWins = 0, curWins = 0, maxLosses = 0, curLosses = 0;
  for (const r of returns) {
    if (r > 0) { curWins++; curLosses = 0; maxWins = Math.max(maxWins, curWins); }
    else { curLosses++; curWins = 0; maxLosses = Math.max(maxLosses, curLosses); }
  }

  const tradingDays = years * 252;
  const avgOppsPerDay = +(trades.length / tradingDays).toFixed(2);
  const avgTradesPerMonth = +(trades.length / (years * 12)).toFixed(1);

  return {
    totalRoi: +finalRoi.toFixed(2),
    winRate: +(wins.length / returns.length * 100).toFixed(1),
    profitFactor: losses.length ? +(wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0))).toFixed(2) : 99,
    maxDrawdown: +(-maxDd).toFixed(2),
    avgReturnPerTrade: +(mean).toFixed(2),
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    avgHoldingMinutes: Math.round(trades.reduce((a, t) => a + t.holdingMinutes, 0) / trades.length),
    sharpeRatio: +sharpe.toFixed(2),
    avgTradesPerMonth,
    avgOpportunitiesPerDay: avgOppsPerDay,
    bestTrade: +Math.max(...returns).toFixed(2),
    worstTrade: +Math.min(...returns).toFixed(2),
    avgWin: +(wins.reduce((a, b) => a + b, 0) / (wins.length || 1)).toFixed(2),
    avgLoss: +(losses.reduce((a, b) => a + b, 0) / (losses.length || 1)).toFixed(2),
    consecutiveWins: maxWins,
    consecutiveLosses: maxLosses,
  };
}

function generateDurability(trades: Trade[], years: number): DurabilityPeriod[] {
  const result: DurabilityPeriod[] = [];
  const now = new Date();

  for (let y = 1; y <= years; y++) {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - y);
    const end = new Date(now);
    end.setFullYear(end.getFullYear() - (y - 1));

    const periodTrades = trades.filter(t => {
      const d = new Date(t.date);
      return d >= start && d < end;
    });

    if (periodTrades.length === 0) continue;

    const rets = periodTrades.map(t => t.returnPct);
    const wins = rets.filter(r => r > 0);
    let eq = 10000;
    for (const r of rets) eq *= (1 + r / 100);

    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);

    result.push({
      period: `Year ${y} (${start.getFullYear()})`,
      roi: +((eq - 10000) / 100).toFixed(1),
      winRate: +(wins.length / rets.length * 100).toFixed(1),
      trades: periodTrades.length,
      sharpe: +(std > 0 ? (mean / std) * Math.sqrt(252) : 0).toFixed(2),
    });
  }

  return result.reverse();
}

export function buildMockResult(lookbackYears: LookbackYears = 5): BacktestResult {
  const tradeCount = Math.floor(lookbackYears * 68);
  const trades = generateTrades(tradeCount, 42 + lookbackYears);
  const metrics = calcMetrics(trades, lookbackYears);
  const equityCurve = generateEquityCurve(metrics.totalRoi, lookbackYears);
  const durabilityByYear = generateDurability(trades, lookbackYears);

  return {
    id: `bt_${lookbackYears}yr`,
    status: "completed",
    strategy: {
      name: "VWAP Cross Low Float",
      description: "Buy when price crosses VWAP on 1-min chart with low float and high relative volume",
      rules: [
        { type: "entry", condition: "Price crosses above VWAP", parameters: { timeframe: "1m" } },
        { type: "filter", condition: "Float < 20M shares", parameters: { maxFloat: 20000000 } },
        { type: "filter", condition: "Relative Volume > 3x", parameters: { minRvol: 3 } },
        { type: "exit", condition: "Take Profit +15%", parameters: { pct: 15 } },
        { type: "exit", condition: "Stop Loss -5%", parameters: { pct: -5 } },
      ],
      slippage: 2,
      timeframe: "1m",
      lookbackYears,
    },
    metrics,
    equityCurve,
    trades,
    durabilityByYear,
    createdAt: new Date().toISOString(),
  };
}

export const MOCK_BACKTEST_RESULT: BacktestResult = buildMockResult(5);

export const VAULT_STRATEGIES: VaultStrategy[] = [
  {
    id: "vs_001",
    name: "The Morning Spike",
    tagline: "Capture the first explosive move of pre-market catalysts",
    description: "Enter on the first VWAP cross within 30 minutes of market open on days with confirmed pre-market catalyst (earnings, FDA, PR). Float must be below 15M.",
    verifiedRoi: 184,
    verifiedYears: 5,
    winRate: 61,
    totalTrades: 287,
    thumbnailGradient: "from-[#6366F1] to-[#8B5CF6]",
    videoUrl: null,
    config: {
      name: "The Morning Spike",
      description: "Pre-market catalyst VWAP cross within first 30 minutes",
      rules: [
        { type: "entry", condition: "First VWAP cross after open", parameters: { window: 30 } },
        { type: "filter", condition: "Pre-market catalyst confirmed", parameters: {} },
        { type: "filter", condition: "Float < 15M", parameters: { maxFloat: 15000000 } },
        { type: "exit", condition: "Take Profit", parameters: { pct: 20 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -6 } },
      ],
      slippage: 2.5,
      timeframe: "1m",
      lookbackYears: 5,
    },
    tier: "elite",
  },
  {
    id: "vs_002",
    name: "VWAP Hold & Reclaim",
    tagline: "Trade the institutional rejection and reclaim pattern",
    description: "Wait for price to dip below VWAP, consolidate for 5+ minutes, then re-enter on confirmed reclaim with volume spike. Relative Volume must exceed 5x average.",
    verifiedRoi: 210,
    verifiedYears: 5,
    winRate: 67,
    totalTrades: 411,
    thumbnailGradient: "from-[#10B981] to-[#059669]",
    videoUrl: null,
    config: {
      name: "VWAP Hold & Reclaim",
      description: "VWAP dip, consolidation, and reclaim with volume confirmation",
      rules: [
        { type: "entry", condition: "VWAP reclaim after 5-min consolidation below", parameters: {} },
        { type: "filter", condition: "Relative Volume > 5x", parameters: { minRvol: 5 } },
        { type: "exit", condition: "Take Profit", parameters: { pct: 12 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -4 } },
      ],
      slippage: 2,
      timeframe: "1m",
      lookbackYears: 5,
    },
    tier: "pro",
  },
  {
    id: "vs_003",
    name: "Late Day Power Hour",
    tagline: "Ride the 3PM institutional momentum surge",
    description: "Targets stocks that are up 30%+ on the day and break HOD between 2:30-3:30 PM EST. Uses volume acceleration as confirmation.",
    verifiedRoi: 142,
    verifiedYears: 5,
    winRate: 58,
    totalTrades: 193,
    thumbnailGradient: "from-[#F59E0B] to-[#EF4444]",
    videoUrl: null,
    config: {
      name: "Late Day Power Hour",
      description: "HOD breakout between 2:30-3:30 PM on strong up days",
      rules: [
        { type: "entry", condition: "Break above High of Day", parameters: { timeWindow: "14:30-15:30" } },
        { type: "filter", condition: "Day gain > 30%", parameters: { minDayGain: 30 } },
        { type: "filter", condition: "Volume acceleration > 2x prior hour", parameters: {} },
        { type: "exit", condition: "Take Profit", parameters: { pct: 10 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -5 } },
      ],
      slippage: 2,
      timeframe: "1m",
      lookbackYears: 5,
    },
    tier: "elite",
  },
  {
    id: "vs_004",
    name: "Halt & Resume Bounce",
    tagline: "The volatility halt resume edge that most miss",
    description: "Enter immediately after a trading halt resumes when price opens above the halt level and volume in first 2 candles exceeds 500K shares.",
    verifiedRoi: 167,
    verifiedYears: 5,
    winRate: 55,
    totalTrades: 124,
    thumbnailGradient: "from-[#8B5CF6] to-[#6366F1]",
    videoUrl: null,
    config: {
      name: "Halt & Resume Bounce",
      description: "Post-halt resume with gap-up and volume confirmation",
      rules: [
        { type: "entry", condition: "First candle after halt resume above halt price", parameters: {} },
        { type: "filter", condition: "Volume in first 2 candles > 500K", parameters: { minVolume: 500000 } },
        { type: "exit", condition: "Take Profit", parameters: { pct: 25 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -8 } },
      ],
      slippage: 3,
      timeframe: "1m",
      lookbackYears: 5,
    },
    tier: "elite",
  },
  {
    id: "vs_005",
    name: "Daily High Breakout",
    tagline: "Simple, consistent, and devastatingly effective",
    description: "The simplest strategy in the vault. Buy on the first 1-minute close above the previous day's high, with volume > 2M and price under $8.",
    verifiedRoi: 98,
    verifiedYears: 5,
    winRate: 53,
    totalTrades: 612,
    thumbnailGradient: "from-[#06B6D4] to-[#6366F1]",
    videoUrl: null,
    config: {
      name: "Daily High Breakout",
      description: "Break above prior day high with volume and price filter",
      rules: [
        { type: "entry", condition: "Close above previous day high", parameters: {} },
        { type: "filter", condition: "Volume > 2M", parameters: { minVolume: 2000000 } },
        { type: "filter", condition: "Price < $8", parameters: { maxPrice: 8 } },
        { type: "exit", condition: "Take Profit", parameters: { pct: 8 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -3 } },
      ],
      slippage: 1.5,
      timeframe: "1m",
      lookbackYears: 5,
    },
    tier: "tester",
  },
  {
    id: "vs_006",
    name: "SSR Reversal Play",
    tagline: "Trade the short-sale restriction bounce",
    description: "When a stock triggers SSR after a 10%+ drop, trade the intraday bounce from an oversold level using RSI < 30 as trigger.",
    verifiedRoi: 121,
    verifiedYears: 5,
    winRate: 60,
    totalTrades: 218,
    thumbnailGradient: "from-[#EF4444] to-[#F59E0B]",
    videoUrl: null,
    config: {
      name: "SSR Reversal Play",
      description: "SSR-triggered RSI oversold bounce",
      rules: [
        { type: "entry", condition: "RSI(14) < 30 and SSR active", parameters: {} },
        { type: "filter", condition: "Day drop > 10%", parameters: { minDayDrop: 10 } },
        { type: "exit", condition: "Take Profit", parameters: { pct: 7 } },
        { type: "exit", condition: "Stop Loss", parameters: { pct: -4 } },
      ],
      slippage: 2,
      timeframe: "5m",
      lookbackYears: 5,
    },
    tier: "pro",
  },
];
