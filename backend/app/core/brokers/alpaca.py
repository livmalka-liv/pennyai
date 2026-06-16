"""
Alpaca Markets broker integration.

Supports both paper and live trading via Alpaca's REST API v2.
Credentials dict expected:
  { "api_key": "...", "secret_key": "...", "paper": true }
"""

import httpx
from .base import BrokerBase, Position, OrderResult, AccountInfo

# Alpaca order status → internal status
_STATUS_MAP = {
    "new":              "pending",
    "partially_filled": "pending",
    "filled":           "filled",
    "canceled":         "canceled",
    "cancelled":        "canceled",
    "rejected":         "rejected",
    "expired":          "rejected",
    "pending_new":      "pending",
    "accepted":         "pending",
    "held":             "pending",
    "done_for_day":     "canceled",
    "replaced":         "canceled",
    "pending_cancel":   "pending",
    "pending_replace":  "pending",
    "suspended":        "rejected",
}

_PAPER_BASE = "https://paper-api.alpaca.markets"
_LIVE_BASE  = "https://api.alpaca.markets"


class AlpacaBroker(BrokerBase):

    def __init__(self, credentials: dict):
        self.api_key    = credentials.get("api_key", "")
        self.secret_key = credentials.get("secret_key", "")
        is_paper        = credentials.get("paper", True)
        self.base_url   = _PAPER_BASE if is_paper else _LIVE_BASE

    def _headers(self) -> dict:
        return {
            "APCA-API-KEY-ID":     self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
            "Content-Type":        "application/json",
        }

    async def test_connection(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{self.base_url}/v2/account", headers=self._headers())
                if r.status_code == 200:
                    data = r.json()
                    account_id = data.get("account_number", data.get("id", ""))
                    mode = "Paper" if self.base_url == _PAPER_BASE else "Live"
                    return True, f"Connected — Alpaca {mode} ({account_id})"
                return False, f"Alpaca auth error ({r.status_code}): {r.text}"
        except Exception as e:
            return False, f"Cannot reach Alpaca: {e}"

    async def get_account(self) -> AccountInfo:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base_url}/v2/account", headers=self._headers())
            r.raise_for_status()
            d = r.json()
        return AccountInfo(
            account_id=d.get("account_number", d.get("id", "")),
            net_liquidation=float(d.get("portfolio_value", 0) or 0),
            cash=float(d.get("cash", 0) or 0),
            buying_power=float(d.get("buying_power", 0) or 0),
            currency=d.get("currency", "USD"),
        )

    async def get_positions(self) -> list[Position]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base_url}/v2/positions", headers=self._headers())
            r.raise_for_status()
            raw = r.json()

        positions = []
        for p in raw:
            qty        = int(float(p.get("qty", 0)))
            avg_cost   = float(p.get("avg_entry_price", 0) or 0)
            mkt_value  = float(p.get("market_value", 0) or 0)
            unreal_pnl = float(p.get("unrealized_pl", 0) or 0)
            unreal_pct = float(p.get("unrealized_plpc", 0) or 0) * 100
            side_raw   = p.get("side", "long")
            positions.append(Position(
                ticker=p.get("symbol", ""),
                qty=qty,
                avg_cost=avg_cost,
                market_value=mkt_value,
                unrealized_pnl=unreal_pnl,
                unrealized_pnl_pct=round(unreal_pct, 4),
                side=side_raw,  # Alpaca already returns "long" | "short"
            ))
        return positions

    async def place_market_order(self, ticker: str, side: str, qty: int) -> OrderResult:
        return await self._submit_order(ticker, side, qty, "market")

    async def place_limit_order(self, ticker: str, side: str, qty: int, limit_price: float) -> OrderResult:
        return await self._submit_order(ticker, side, qty, "limit", limit_price)

    async def _submit_order(
        self,
        ticker: str,
        side: str,
        qty: int,
        order_type: str,
        limit_price: float | None = None,
    ) -> OrderResult:
        body: dict = {
            "symbol":     ticker,
            "qty":        str(qty),
            "side":       side,
            "type":       order_type,
            "time_in_force": "day",
        }
        if limit_price is not None:
            body["limit_price"] = str(limit_price)

        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base_url}/v2/orders", headers=self._headers(), json=body)
            if r.status_code >= 400:
                return OrderResult(
                    broker_order_id="",
                    status="rejected",
                    error_msg=r.text,
                )
            d = r.json()

        return OrderResult(
            broker_order_id=d.get("id", ""),
            status=_STATUS_MAP.get(d.get("status", ""), "pending"),
            fill_price=float(d["filled_avg_price"]) if d.get("filled_avg_price") else None,
            fill_qty=int(d["filled_qty"]) if d.get("filled_qty") else None,
        )

    async def cancel_order(self, broker_order_id: str) -> bool:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.delete(
                f"{self.base_url}/v2/orders/{broker_order_id}",
                headers=self._headers(),
            )
            # 204 = cancelled successfully; 422 = already filled/cancelled (treat as ok)
            return r.status_code in (200, 204, 422)

    async def get_order_status(self, broker_order_id: str) -> OrderResult:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{self.base_url}/v2/orders/{broker_order_id}",
                headers=self._headers(),
            )
            r.raise_for_status()
            d = r.json()

        return OrderResult(
            broker_order_id=broker_order_id,
            status=_STATUS_MAP.get(d.get("status", ""), "pending"),
            fill_price=float(d["filled_avg_price"]) if d.get("filled_avg_price") else None,
            fill_qty=int(d["filled_qty"]) if d.get("filled_qty") else None,
        )
