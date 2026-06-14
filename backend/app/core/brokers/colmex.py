"""
Colmex Pro REST API integration.

Colmex Pro is an MT4/MT5 based broker with a proprietary REST API.
Credentials dict expected:
  { "api_key": "...", "api_secret": "...", "account_id": "..." }

API base: https://api.colmex.com/v2
"""

import httpx
from .base import BrokerBase, Position, OrderResult, AccountInfo


class ColmexBroker(BrokerBase):

    BASE = "https://api.colmex.com/v2"

    def __init__(self, credentials: dict):
        self.api_key = credentials.get("api_key", "")
        self.api_secret = credentials.get("api_secret", "")
        self.account_id = credentials.get("account_id", "")

    def _headers(self) -> dict:
        return {
            "X-API-Key": self.api_key,
            "X-API-Secret": self.api_secret,
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{self.BASE}/account/info", headers=self._headers())
                if r.status_code == 200:
                    data = r.json()
                    name = data.get("name", self.account_id)
                    return True, f"מחובר — Colmex {name}"
                return False, f"שגיאת אימות Colmex ({r.status_code})"
        except Exception as e:
            return False, f"לא ניתן להגיע ל-Colmex: {e}"

    async def get_account(self) -> AccountInfo:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.BASE}/account/balance", headers=self._headers())
            r.raise_for_status()
            d = r.json()
        return AccountInfo(
            account_id=self.account_id,
            net_liquidation=float(d.get("equity", 0)),
            cash=float(d.get("free_margin", 0)),
            buying_power=float(d.get("free_margin", 0)),
            currency=d.get("currency", "USD"),
        )

    async def get_positions(self) -> list[Position]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.BASE}/positions", headers=self._headers())
            r.raise_for_status()
            raw = r.json()

        positions = []
        for p in raw.get("positions", []):
            qty = int(p.get("volume", 0))
            cost = float(p.get("open_price", 0))
            mkt = float(p.get("current_price", cost))
            pnl = float(p.get("profit", 0))
            positions.append(Position(
                ticker=p.get("symbol", ""),
                qty=qty,
                avg_cost=cost,
                market_value=mkt * qty,
                unrealized_pnl=pnl,
                unrealized_pnl_pct=(pnl / (cost * qty) * 100) if cost and qty else 0,
                side="long" if p.get("type") == "buy" else "short",
            ))
        return positions

    async def place_market_order(self, ticker: str, side: str, qty: int) -> OrderResult:
        return await self._send_order(ticker, side, qty, "market")

    async def place_limit_order(self, ticker: str, side: str, qty: int, limit_price: float) -> OrderResult:
        return await self._send_order(ticker, side, qty, "limit", limit_price)

    async def _send_order(self, ticker: str, side: str, qty: int, order_type: str, price: float | None = None) -> OrderResult:
        body = {
            "symbol": ticker,
            "side": side,
            "volume": qty,
            "order_type": order_type,
        }
        if price:
            body["price"] = price

        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.BASE}/orders", headers=self._headers(), json=body)
            if r.status_code >= 400:
                return OrderResult(broker_order_id="", status="rejected", error_msg=r.text)
            d = r.json()
        return OrderResult(
            broker_order_id=str(d.get("order_id", "")),
            status="pending",
        )

    async def cancel_order(self, broker_order_id: str) -> bool:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.delete(f"{self.BASE}/orders/{broker_order_id}", headers=self._headers())
            return r.status_code < 400

    async def get_order_status(self, broker_order_id: str) -> OrderResult:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.BASE}/orders/{broker_order_id}", headers=self._headers())
            r.raise_for_status()
            d = r.json()
        status_map = {"filled": "filled", "pending": "pending", "cancelled": "cancelled", "rejected": "rejected"}
        return OrderResult(
            broker_order_id=broker_order_id,
            status=status_map.get(d.get("status", "pending"), "pending"),
            fill_price=float(d.get("fill_price", 0)) or None,
            fill_qty=int(d.get("filled_volume", 0)) or None,
        )
