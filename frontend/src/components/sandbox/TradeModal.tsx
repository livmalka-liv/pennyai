"use client";

import { useEffect } from "react";
import { X, TrendingUp, TrendingDown, BarChart2, Clock, Layers } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { cn, formatPercent, formatNumber } from "@/lib/utils";
import type { Trade } from "@/types";

interface TradeModalProps {
  trade: Trade;
  onClose: () => void;
}

export default function TradeModal({ trade, onClose }: TradeModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isWin = trade.returnPct >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                isWin ? "bg-[#10B981]/15" : "bg-[#EF4444]/15"
              )}
            >
              {isWin ? (
                <TrendingUp className="h-5 w-5 text-[#10B981]" />
              ) : (
                <TrendingDown className="h-5 w-5 text-[#EF4444]" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8FAFC]">{trade.ticker}</h2>
              <p className="text-xs text-[#64748B]">{trade.date} · Long</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-2xl font-bold tabular-nums", isWin ? "text-[#10B981]" : "text-[#EF4444]")}>
              {formatPercent(trade.returnPct)}
            </span>
            <button onClick={onClose} className="rounded-md p-1 text-[#64748B] hover:bg-[#131A26] hover:text-[#F8FAFC]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Trade Details */}
        <div className="grid grid-cols-2 gap-3 p-5">
          {[
            { label: "Entry Price", value: `$${trade.entryPrice.toFixed(2)}`, icon: TrendingUp },
            { label: "Exit Price", value: `$${trade.exitPrice.toFixed(2)}`, icon: TrendingDown },
            { label: "Hold Time", value: `${trade.holdingMinutes} minutes`, icon: Clock },
            { label: "Volume", value: formatNumber(trade.volume), icon: BarChart2 },
            { label: "Float", value: `${(trade.float / 1000000).toFixed(1)}M shares`, icon: Layers },
            { label: "P&L", value: formatPercent(trade.returnPct), icon: isWin ? TrendingUp : TrendingDown },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-[#131A26] border border-[#1E293B] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className="h-3 w-3 text-[#64748B]" />
                <span className="text-[10px] uppercase tracking-wider text-[#64748B]">{item.label}</span>
              </div>
              <span className="text-sm font-semibold text-[#F8FAFC]">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Level 2 Replay Preview */}
        <div className="mx-5 mb-5 rounded-lg border border-[#1E293B] bg-[#0B0E14] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6366F1]">
              Level 2 Order Book Snapshot
            </span>
            <Badge variant="violet">Trade Window</Badge>
          </div>
          <Level2Preview ticker={trade.ticker} entryPrice={trade.entryPrice} />
        </div>
      </div>
    </div>
  );
}

function Level2Preview({ ticker, entryPrice }: { ticker: string; entryPrice: number }) {
  const asks = Array.from({ length: 5 }, (_, i) => ({
    price: (entryPrice + (i + 1) * 0.01).toFixed(2),
    size: Math.floor(Math.random() * 5000 + 500),
  }));
  const bids = Array.from({ length: 5 }, (_, i) => ({
    price: (entryPrice - i * 0.01).toFixed(2),
    size: Math.floor(Math.random() * 5000 + 500),
  }));
  const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size));

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div>
        <p className="mb-1.5 font-medium text-[#EF4444]">ASK (Sell Side)</p>
        <div className="space-y-1">
          {asks.reverse().map((ask) => (
            <div key={ask.price} className="relative flex items-center justify-between rounded px-2 py-0.5 overflow-hidden">
              <div
                className="absolute inset-0 bg-[#EF4444]/10"
                style={{ width: `${(ask.size / maxSize) * 100}%` }}
              />
              <span className="relative text-[#EF4444]">${ask.price}</span>
              <span className="relative text-[#94A3B8]">{ask.size.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-[#10B981]">BID (Buy Side)</p>
        <div className="space-y-1">
          {bids.map((bid) => (
            <div key={bid.price} className="relative flex items-center justify-between rounded px-2 py-0.5 overflow-hidden">
              <div
                className="absolute inset-0 bg-[#10B981]/10"
                style={{ width: `${(bid.size / maxSize) * 100}%` }}
              />
              <span className="relative text-[#10B981]">${bid.price}</span>
              <span className="relative text-[#94A3B8]">{bid.size.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
