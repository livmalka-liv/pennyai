"""
IBKR Client Portal Web API integration.

The user must run the IBKR Client Portal Gateway (a lightweight Java app):
  https://www.interactivebrokers.com/en/trading/ib-api.php

After launching the gateway, it listens on https://localhost:5000
The user provides us with the gateway URL (can be a cloud VM).

Credentials dict expected:
  { "gateway_url": "https://...:5000", "account_id": "U1234567" }
"""

import ssl
import httpx
from .base import BrokerBase, Position, OrderResult, AccountInfo

# IBKR gateway uses a self-signed cert — we skip verify in dev
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


class IBKRBroker(BrokerBase):

    def __init__(self, credentials: dict):
        self.base = credentials.get("gateway_url", "https://localhost:5000").rstrip("/")
        self.account_id = credentials.get("account_id", "")

    def _client(self) -> httpx.AsyncClient:
        # ngrok-skip-browser-warning bypasses ngrok's interstitial page for API calls
        headers = {"ngrok-skip-browser-warning": "true", "User-Agent": "PennyAI/1.0"}
        return httpx.AsyncClient(base_url=f"{self.base}/v1/api", verify=False, timeout=10, headers=headers)

    async def test_connection(self) -> tuple[bool, str]:
        try:
            async with self._client() as c:
                r = await c.get("/iserver/auth/status")
                data = r.json()
                if data.get("authenticated"):
                    return True, f"מחובר — IBKR {self.account_id}"
                return False, "Gateway פעיל אבל לא מאומת. התחבר דרך הגייטוויי."
        except Exception as e:
            return False, f"לא ניתן להגיע ל-Gateway: {e}"

    async def get_account(self) -> AccountInfo:
        async with self._client() as c:
            r = await c.get(f"/portfolio/{self.account_id}/summary")
            r.raise_for_status()
            d = r.json()

        def _val(key: str) -> float:
            item = d.get(key, {})
            return float(item.get("amount", 0))

        return AccountInfo(
            account_id=self.account_id,
            net_liquidation=_val("netliquidation"),
            cash=_val("totalcashvalue"),
            buying_power=_val("buyingpower"),
        )

    async def get_positions(self) -> list[Position]:
        async with self._client() as c:
            r = await c.get(f"/portfolio/{self.account_id}/positions/0")
            r.raise_for_status()
            raw = r.json()

        positions = []
        for p in raw:
            mktval = float(p.get("mktValue", 0))
            cost = float(p.get("avgCost", 0))
            qty = int(p.get("position", 0))
            unrealized = float(p.get("unrealizedPnl", 0))
            positions.append(Position(
                ticker=p.get("ticker", p.get("contractDesc", "")),
                qty=abs(qty),
                avg_cost=cost,
                market_value=mktval,
                unrealized_pnl=unrealized,
                unrealized_pnl_pct=(unrealized / (cost * abs(qty)) * 100) if cost and qty else 0,
                side="long" if qty > 0 else "short",
            ))
        return positions

    async def place_market_order(self, ticker: str, side: str, qty: int) -> OrderResult:
        return await self._place_order(ticker, side, qty, "MKT")

    async def place_limit_order(self, ticker: str, side: str, qty: int, limit_price: float) -> OrderResult:
        return await self._place_order(ticker, side, qty, "LMT", limit_price)

    async def _place_order(self, ticker: str, side: str, qty: int, order_type: str, price: float | None = None) -> OrderResult:
        body: dict = {
            "orders": [{
                "conid": await self._get_conid(ticker),
                "orderType": order_type,
                "side": "BUY" if side == "buy" else "SELL",
                "quantity": qty,
                "tif": "DAY",
            }]
        }
        if price and order_type == "LMT":
            body["orders"][0]["price"] = price

        async with self._client() as c:
            r = await c.post(f"/iserver/account/{self.account_id}/orders", json=body)
            if r.status_code >= 400:
                return OrderResult(broker_order_id="", status="rejected", error_msg=r.text)
            data = r.json()
            # IBKR may return a reply-needed confirmation
            if isinstance(data, list) and data and data[0].get("id"):
                # Confirm the order
                confirm_id = data[0]["id"]
                cr = await c.post(f"/iserver/reply/{confirm_id}", json={"confirmed": True})
                data = cr.json()

        order_id = ""
        if isinstance(data, list) and data:
            order_id = str(data[0].get("order_id", ""))
        return OrderResult(broker_order_id=order_id, status="pending")

    async def _get_conid(self, ticker: str) -> int:
        """Resolve ticker to IBKR contract ID (US equity)."""
        async with self._client() as c:
            r = await c.get("/trsrv/stocks", params={"symbols": ticker})
            r.raise_for_status()
            data = r.json()
            contracts = data.get(ticker, [{}])
            for c_item in contracts:
                for contract in c_item.get("contracts", []):
                    if contract.get("exchange") in ("NASDAQ", "NYSE", "SMART", "AMEX"):
                        return contract["conid"]
            return contracts[0].get("contracts", [{}])[0].get("conid", 0)

    async def cancel_order(self, broker_order_id: str) -> bool:
        async with self._client() as c:
            r = await c.delete(f"/iserver/account/{self.account_id}/order/{broker_order_id}")
            return r.status_code < 400

    async def get_order_status(self, broker_order_id: str) -> OrderResult:
        async with self._client() as c:
            r = await c.get(f"/iserver/account/order/status/{broker_order_id}")
            r.raise_for_status()
            d = r.json()
        status_map = {"Filled": "filled", "Submitted": "pending", "Cancelled": "cancelled"}
        return OrderResult(
            broker_order_id=broker_order_id,
            status=status_map.get(d.get("status", ""), "pending"),
            fill_price=float(d.get("avgPrice", 0) or 0) or None,
            fill_qty=int(d.get("filledQuantity", 0) or 0) or None,
        )
