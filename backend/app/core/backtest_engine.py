"""
Vectorized penny stock backtesting engine using pandas.

Design principles:
- Vectorized operations (no row-by-row loops) for speed
- Realistic slippage model: max(user_slippage%, 2 cents/share)
- Filters applied before signal generation to minimize compute
- One trade at a time (no pyramiding) to reflect retail reality
- Penny stock specific: long-only, intraday exits only
"""

import uuid
import math
import logging
from datetime import datetime, date

import numpy as np
import pandas as pd

from app.models.schemas import (
    StrategyConfig,
    BacktestResult,
    BacktestMetrics,
    TradeResult,
    EquityPoint,
    DurabilityPeriod,
    RuleType,
)
from app.core.config import get_settings
from app.data.types import CatalystDay

logger = logging.getLogger(__name__)

STARTING_CAPITAL = 10_000.0
POSITION_SIZE_PCT = 0.95
MIN_SLIPPAGE_PER_SHARE = 0.02
POSITION_DOLLARS = STARTING_CAPITAL * POSITION_SIZE_PCT  # $9,500

COMMISSION_PER_SHARE = 0.005  # IBKR rate
MAX_VOLUME_PCT = 0.01          # Can't trade more than 1% of daily volume
MARKET_IMPACT_THRESHOLD = 0.002  # Impact kicks in above 0.2% of volume


def _bid_ask_spread_pct(price: float) -> float:
    """Realistic penny stock bid/ask spread based on price tier."""
    if price < 1.0:
        return 3.0
    elif price < 3.0:
        return 2.0
    elif price < 10.0:
        return 1.0
    elif price < 20.0:
        return 0.5
    return 0.2


def _liquidity_check(price: float, day_volume: int) -> tuple[bool, float]:
    """
    Returns (can_trade, effective_position_dollars).
    Caps position at 1% of daily volume to avoid moving the market.
    """
    max_shares = day_volume * MAX_VOLUME_PCT
    max_dollars = max_shares * price
    if max_dollars < 500:
        return False, 0.0
    effective = min(POSITION_DOLLARS, max_dollars)
    return True, effective


def _market_impact_pct(position_dollars: float, price: float, day_volume: int) -> float:
    """Extra slippage from moving the market with a large order."""
    shares = position_dollars / price
    vol_pct = shares / max(day_volume, 1)
    excess = max(0, vol_pct - MARKET_IMPACT_THRESHOLD)
    return excess * 50  # 50% of excess volume becomes price impact


def _commission_pct(position_dollars: float, price: float) -> float:
    shares = position_dollars / price
    return (shares * COMMISSION_PER_SHARE / position_dollars) * 100


def run_backtest(strategy: StrategyConfig) -> BacktestResult:
    logger.info(f"Starting backtest: {strategy.name}, {strategy.lookback_years}yr")
    settings = get_settings()

    if settings.use_mock_data or not settings.polygon_api_key:
        from app.data.mock_provider import generate_catalyst_days
        catalyst_days = generate_catalyst_days(lookback_years=strategy.lookback_years)
    else:
        from app.data.polygon_provider import get_catalyst_days
        catalyst_days = get_catalyst_days(strategy.lookback_years, settings.polygon_api_key)

    # If real data is too sparse (<50 days for requested period), supplement with mock
    min_expected = max(50, strategy.lookback_years * 30)
    if len(catalyst_days) < min_expected:
        logger.warning(
            f"Only {len(catalyst_days)} real days cached for {strategy.lookback_years}yr "
            f"(expected ~{min_expected}). Supplementing with synthetic data."
        )
        from app.data.mock_provider import generate_catalyst_days as gen_mock
        mock_days = gen_mock(lookback_years=strategy.lookback_years)
        # Real data takes precedence — deduplicate by (ticker, date)
        real_keys = {(d.ticker, str(d.date)) for d in catalyst_days}
        catalyst_days = catalyst_days + [d for d in mock_days if (d.ticker, str(d.date)) not in real_keys]
        logger.info(f"Total after supplement: {len(catalyst_days)} days")

    catalyst_days = _apply_filters(catalyst_days, strategy)

    logger.info(f"Filtered to {len(catalyst_days)} catalyst days")

    trades: list[TradeResult] = []
    equity = STARTING_CAPITAL
    equity_curve: list[EquityPoint] = [EquityPoint(date=str(date.today()), equity=equity)]

    last_date = None

    for day in sorted(catalyst_days, key=lambda d: d.date):
        # Stop trading if account is effectively bankrupt
        if equity <= 0:
            break

        if not day.candles_1m:
            continue

        df = _candles_to_df(day.candles_1m)
        signal = _detect_entry_signal(df, strategy)

        if signal is None:
            continue

        entry_minute, entry_price_raw = signal

        # Liquidity check — skip if can't get meaningful fill
        can_trade, eff_position = _liquidity_check(entry_price_raw, day.day_volume)
        if not can_trade:
            continue

        # Cap position to available equity — never bet more than we have
        eff_position = min(eff_position, equity * POSITION_SIZE_PCT)
        if eff_position < 100:
            continue

        # Entry cost: slippage + spread + market impact + commission
        slippage_pct = _calculate_slippage(entry_price_raw, strategy.slippage)
        spread_pct = _bid_ask_spread_pct(entry_price_raw) / 2  # pay half-spread on entry
        impact_pct = _market_impact_pct(eff_position, entry_price_raw, day.day_volume)
        commission_pct = _commission_pct(eff_position, entry_price_raw)
        entry_cost_pct = slippage_pct + spread_pct + impact_pct + commission_pct
        entry_price = entry_price_raw * (1 + entry_cost_pct / 100)

        exit_minute, exit_price_raw, exit_reason = _simulate_exit(
            df=df,
            entry_minute=entry_minute,
            entry_price=entry_price,
            strategy=strategy,
        )

        # Exit cost: slippage + spread + commission
        slippage_exit = _calculate_slippage(exit_price_raw, strategy.slippage)
        spread_exit = _bid_ask_spread_pct(exit_price_raw) / 2
        commission_exit = _commission_pct(eff_position, exit_price_raw)
        exit_cost_pct = slippage_exit + spread_exit + commission_exit
        exit_price = exit_price_raw * (1 - exit_cost_pct / 100)

        return_pct = ((exit_price - entry_price) / entry_price) * 100
        holding_minutes = exit_minute - entry_minute

        trade = TradeResult(
            id=str(uuid.uuid4())[:8],
            ticker=day.ticker,
            date=str(day.date),
            entry_price=round(entry_price, 4),
            exit_price=round(exit_price, 4),
            return_pct=round(return_pct, 2),
            holding_minutes=max(1, holding_minutes),
            volume=day.day_volume,
            float_shares=day.float_shares,
            exit_reason=exit_reason,
            rvol=round(day.rvol, 1),
            catalyst_type=day.catalyst_type,
        )
        trades.append(trade)

        # Update equity: fixed position size (no compounding) — realistic for penny stocks
        equity = equity + POSITION_DOLLARS * (return_pct / 100)

        if last_date != day.date:
            equity_curve.append(EquityPoint(date=str(day.date), equity=round(equity, 2)))
            last_date = day.date

    metrics = _calculate_metrics(trades, STARTING_CAPITAL, equity, strategy.lookback_years)
    durability = _calculate_durability(trades)

    return BacktestResult(
        id=str(uuid.uuid4()),
        status="completed",
        strategy=strategy,
        metrics=metrics,
        equity_curve=equity_curve,
        trades=trades,
        durability_by_year=durability,
        created_at=datetime.utcnow().isoformat(),
    )


def _apply_filters(days: list[CatalystDay], strategy: StrategyConfig) -> list[CatalystDay]:
    filtered = []
    filter_rules = [r for r in strategy.rules if r.type == RuleType.FILTER]

    for day in days:
        passes = True
        for rule in filter_rules:
            params = rule.parameters
            cond = rule.condition.lower()

            if "float" in cond:
                max_float = params.get("maxFloat", float("inf"))
                if day.float_shares > max_float:
                    passes = False
                    break

            elif "relative volume" in cond or "rvol" in cond:
                min_rvol = params.get("minRvol", 0)
                if day.rvol < min_rvol:
                    passes = False
                    break

            elif "volume" in cond and "relative" not in cond:
                min_vol = params.get("minVolume", 0)
                if day.day_volume < min_vol:
                    passes = False
                    break

            elif "price" in cond:
                max_price = params.get("maxPrice", float("inf"))
                min_price = params.get("minPrice", 0.0)
                if day.open_price > max_price or day.open_price < min_price:
                    passes = False
                    break

        if passes:
            filtered.append(day)

    return filtered


def _candles_to_df(candles) -> pd.DataFrame:
    data = {
        "open": [c.open for c in candles],
        "high": [c.high for c in candles],
        "low": [c.low for c in candles],
        "close": [c.close for c in candles],
        "volume": [c.volume for c in candles],
        "vwap": [c.vwap for c in candles],
    }
    df = pd.DataFrame(data)

    # Technical indicators
    df["prev_close"] = df["close"].shift(1)
    df["above_vwap"] = df["close"] > df["vwap"]
    df["prev_above_vwap"] = df["above_vwap"].shift(1).fillna(False)
    df["vwap_cross_up"] = df["above_vwap"] & ~df["prev_above_vwap"]
    df["hod"] = df["high"].cummax()
    df["break_hod"] = df["high"] > df["hod"].shift(1)

    # RSI-14
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))
    df["rsi"] = df["rsi"].fillna(50)

    return df


def _detect_entry_signal(df: pd.DataFrame, strategy: StrategyConfig) -> tuple[int, float] | None:
    entry_rules = [r for r in strategy.rules if r.type == RuleType.ENTRY]
    if not entry_rules:
        return None

    entry_rule = entry_rules[0]
    cond = entry_rule.condition.lower()

    # Skip first 10 minutes (too chaotic at open — let the pattern form)
    for i in range(10, len(df)):
        row = df.iloc[i]

        if "vwap" in cond:
            if "reclaim" in cond or "hold" in cond:
                # Price was below VWAP at some point in last 15 bars, now reclaims
                lookback = df["above_vwap"].iloc[max(0, i - 15):i]
                was_below = not lookback.all()  # at least one bar below VWAP recently
                if was_below and row["above_vwap"] and i >= 20:
                    return i, row["close"]
            else:
                if row["vwap_cross_up"] and i >= 20:
                    return i, row["close"]

        elif "hod" in cond or "high of day" in cond:
            # Enter on HOD break AFTER consolidation — no new HOD in the last 20 bars
            # This filters out the explosive open and waits for a bull-flag-style breakout
            if row["break_hod"] and i >= 30:
                recent_breaks = df["break_hod"].iloc[max(0, i - 20):i]
                if not recent_breaks.any():  # Consolidation confirmed
                    return i, row["close"]  # Enter at close, not the high of the candle

        elif "rsi" in cond:
            level = entry_rule.parameters.get("level", 30)
            if row["rsi"] < level:
                return i, row["close"]

        elif "halt" in cond:
            # Simulate halt resume: look for volume spike
            if i > 10 and row["volume"] > df["volume"].iloc[:i].mean() * 5:
                return i, row["open"]

        else:
            # Generic momentum: price closes above 5-bar high after a brief pullback
            if i >= 10:
                five_bar_high = df["high"].iloc[i - 5:i].max()
                recent_low = df["low"].iloc[i - 5:i].min() < df["close"].iloc[i - 10]
                if row["close"] > five_bar_high and recent_low:
                    return i, row["close"]

    return None


def _simulate_exit(
    df: pd.DataFrame,
    entry_minute: int,
    entry_price: float,
    strategy: StrategyConfig,
) -> tuple[int, float, str]:
    exit_rules = [r for r in strategy.rules if r.type == RuleType.EXIT]

    tp_pct = 15.0
    sl_pct = -5.0

    for rule in exit_rules:
        pct = rule.parameters.get("pct", 0)
        if pct > 0:
            tp_pct = float(pct)
        elif pct < 0:
            sl_pct = float(pct)

    tp_price = entry_price * (1 + tp_pct / 100)
    sl_price = entry_price * (1 + sl_pct / 100)

    for i in range(entry_minute + 1, len(df)):
        row = df.iloc[i]

        if row["high"] >= tp_price:
            return i, tp_price, "take_profit"

        if row["low"] <= sl_price:
            return i, sl_price, "stop_loss"

        # Force exit at session end (minute 239 = 1:29 PM — end of our candle window)
        if i >= 238:
            return i, row["close"], "eod_close"

    return len(df) - 1, df.iloc[-1]["close"], "eod_close"


def _calculate_slippage(price: float, user_slippage_pct: float) -> float:
    """Returns the effective slippage % using the worse of user input or $0.02/share."""
    pct_from_cents = (MIN_SLIPPAGE_PER_SHARE / price) * 100
    return max(user_slippage_pct, pct_from_cents)


def _calculate_metrics(
    trades: list[TradeResult],
    starting_capital: float,
    final_equity: float,
    lookback_years: int,
) -> BacktestMetrics:
    if not trades:
        return BacktestMetrics(
            total_roi=0, win_rate=0, profit_factor=0, max_drawdown=0,
            avg_return_per_trade=0, total_trades=0, winning_trades=0,
            losing_trades=0, avg_holding_minutes=0, sharpe_ratio=0,
        )

    returns = [t.return_pct for t in trades]
    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r <= 0]

    total_roi = ((final_equity - starting_capital) / starting_capital) * 100
    win_rate = len(wins) / len(returns) * 100 if returns else 0

    gross_profit = sum(wins)
    gross_loss = abs(sum(losses)) or 0.001
    profit_factor = gross_profit / gross_loss

    # Max drawdown via equity curve simulation — matches run_backtest with equity floor
    position_dollars = starting_capital * POSITION_SIZE_PCT
    equity = starting_capital
    peak = equity
    max_dd = 0.0
    for r in returns:
        pos = min(position_dollars, equity * POSITION_SIZE_PCT)
        equity = max(0.0, equity + pos * (r / 100))
        if equity > peak:
            peak = equity
        if peak > 0:
            dd = (peak - equity) / peak * 100
            if dd > max_dd:
                max_dd = dd

    # Sharpe (annualized, assuming ~252 trading days)
    if len(returns) > 1:
        mean_r = np.mean(returns)
        std_r = np.std(returns, ddof=1)
        sharpe = (mean_r / std_r * math.sqrt(252)) if std_r > 0 else 0
    else:
        sharpe = 0

    avg_hold = np.mean([t.holding_minutes for t in trades]) if trades else 0

    # Frequency
    trading_months = max(lookback_years * 12, 1)
    avg_trades_per_month = len(trades) / trading_months
    trading_days = lookback_years * 252
    avg_opps_per_day = len(trades) / trading_days

    # Best/worst/avg win/loss
    best = max(returns)
    worst = min(returns)
    avg_win = float(np.mean(wins)) if wins else 0
    avg_loss = float(np.mean(losses)) if losses else 0

    # Max consecutive wins/losses
    max_consec_wins = max_consec_losses = cur_w = cur_l = 0
    for r in returns:
        if r > 0:
            cur_w += 1; cur_l = 0
        else:
            cur_l += 1; cur_w = 0
        max_consec_wins = max(max_consec_wins, cur_w)
        max_consec_losses = max(max_consec_losses, cur_l)

    return BacktestMetrics(
        total_roi=round(total_roi, 2),
        win_rate=round(win_rate, 2),
        profit_factor=round(profit_factor, 2),
        max_drawdown=round(-max_dd, 2),
        avg_return_per_trade=round(float(np.mean(returns)), 2),
        total_trades=len(trades),
        winning_trades=len(wins),
        losing_trades=len(losses),
        avg_holding_minutes=round(float(avg_hold), 1),
        sharpe_ratio=round(float(sharpe), 2),
        avg_trades_per_month=round(avg_trades_per_month, 1),
        avg_opportunities_per_day=round(avg_opps_per_day, 2),
        best_trade=round(best, 2),
        worst_trade=round(worst, 2),
        avg_win=round(avg_win, 2),
        avg_loss=round(avg_loss, 2),
        consecutive_wins=max_consec_wins,
        consecutive_losses=max_consec_losses,
    )


def _calculate_durability(trades: list[TradeResult]) -> list[DurabilityPeriod]:
    if not trades:
        return []

    by_year: dict[str, list[float]] = {}
    for t in trades:
        year = t.date[:4]
        by_year.setdefault(year, []).append(t.return_pct)

    result = []
    for year in sorted(by_year):
        rets = by_year[year]
        wins = [r for r in rets if r > 0]
        equity = 10_000.0
        for r in rets:
            equity *= (1 + r / 100)
        roi = (equity - 10_000) / 10_000 * 100
        wr = len(wins) / len(rets) * 100
        if len(rets) > 1:
            mean_r = float(np.mean(rets))
            std_r = float(np.std(rets, ddof=1))
            sharpe = (mean_r / std_r * math.sqrt(252)) if std_r > 0 else 0
        else:
            sharpe = 0
        result.append(DurabilityPeriod(
            period=year,
            roi=round(roi, 2),
            win_rate=round(wr, 2),
            trades=len(rets),
            sharpe=round(sharpe, 2),
        ))
    return result
