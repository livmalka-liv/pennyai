"""Abstract broker interface — all brokers implement this."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class Position:
    ticker: str
    qty: int
    avg_cost: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    side: str  # long | short


@dataclass
class OrderResult:
    broker_order_id: str
    status: str        # pending | filled | rejected
    fill_price: Optional[float] = None
    fill_qty: Optional[int] = None
    error_msg: Optional[str] = None


@dataclass
class AccountInfo:
    account_id: str
    net_liquidation: float
    cash: float
    buying_power: float
    currency: str = "USD"


class BrokerBase(ABC):

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        """Returns (success, message)."""

    @abstractmethod
    async def get_account(self) -> AccountInfo:
        """Fetch account summary."""

    @abstractmethod
    async def get_positions(self) -> list[Position]:
        """Fetch open positions."""

    @abstractmethod
    async def place_market_order(self, ticker: str, side: str, qty: int) -> OrderResult:
        """Place a market order. side = 'buy' | 'sell'."""

    @abstractmethod
    async def place_limit_order(self, ticker: str, side: str, qty: int, limit_price: float) -> OrderResult:
        """Place a limit order."""

    @abstractmethod
    async def cancel_order(self, broker_order_id: str) -> bool:
        """Cancel an open order. Returns True if cancelled."""

    @abstractmethod
    async def get_order_status(self, broker_order_id: str) -> OrderResult:
        """Fetch current status of a submitted order."""
