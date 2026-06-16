"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, RefreshCw, Zap, ChevronDown, ChevronRight,
  Wifi, WifiOff, AlertCircle, DollarSign, TrendingUp, Send, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authHeader } from "@/lib/auth";

const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader() },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerConn {
  id: string;
  broker_type: "ibkr" | "colmex" | "alpaca";
  label: string;
  account_id: string | null;
  status: "connected" | "disconnected" | "error";
  auto_execute: boolean;
  last_tested_at: string | null;
  last_error: string | null;
}

interface Position {
  ticker: string;
  qty: number;
  side: string;
  avg_cost: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

interface BrokerOrder {
  id: string;
  ticker: string;
  side: string;
  qty: number;
  order_type: string;
  status: string;
  fill_price: number | null;
  submitted_at: string | null;
  error_msg: string | null;
}

interface AccountInfo {
  account_id: string;
  net_liquidation: number;
  cash: number;
  buying_power: number;
  currency: string;
}

// ─── Broker metadata ──────────────────────────────────────────────────────────

const BROKER_META = {
  ibkr: {
    name: "Interactive Brokers",
    logo: "🏦",
    color: "from-[#E31E24] to-[#9B1316]",
    description: "Client Portal Web API — דורש IBKR Gateway",
    fields: [
      { key: "gateway_url", label: "Gateway URL", placeholder: "https://localhost:5000", type: "text" },
      { key: "account_id", label: "Account ID", placeholder: "U1234567", type: "text" },
    ],
  },
  colmex: {
    name: "Colmex Pro",
    logo: "📊",
    color: "from-[#1E3A8A] to-[#1D4ED8]",
    description: "REST API — דורש API Key מ-Colmex",
    fields: [
      { key: "api_key",    label: "API Key",    placeholder: "colmex_key_...", type: "text" },
      { key: "api_secret", label: "API Secret", placeholder: "••••••••",       type: "password" },
      { key: "account_id", label: "Account ID", placeholder: "CM123456",       type: "text" },
    ],
  },
  alpaca: {
    name: "Alpaca Markets",
    logo: "🦙",
    color: "from-[#FACC15] to-[#F59E0B]",
    description: "REST API — נייר ואמיתי, אמריקאי בלבד",
    fields: [
      { key: "api_key",    label: "API Key",    placeholder: "PKXXXXXXXXXXXXXXXX", type: "text" },
      { key: "secret_key", label: "Secret Key", placeholder: "••••••••",           type: "password" },
      { key: "paper",      label: "Paper trading?", placeholder: "true",           type: "text" },
    ],
  },
} as const;

type BrokerType = keyof typeof BROKER_META;

// ─── Add Broker Modal ─────────────────────────────────────────────────────────

function AddBrokerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [step, setStep] = useState<"type" | "creds">("type");
  const [brokerType, setBrokerType] = useState<BrokerType>("ibkr");
  const [label, setLabel] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [autoExec, setAutoExec] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const meta = BROKER_META[brokerType];

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const result = await apiFetch<{ id: string; status: string; message: string }>("/brokers", {
        method: "POST",
        body: JSON.stringify({
          broker_type: brokerType,
          label: label || meta.name,
          credentials: creds,
          auto_execute: autoExec,
        }),
      });
      onAdded();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#1E293B] bg-[#0D1117] shadow-2xl overflow-hidden">
        <div className="border-b border-[#1E293B] px-5 py-4">
          <h2 className="font-bold text-[#F8FAFC]">חיבור ברוקר חדש</h2>
        </div>

        <div className="p-5 space-y-4">
          {step === "type" ? (
            <>
              <p className="text-xs text-[#64748B] mb-3">בחר את הברוקר שלך:</p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(BROKER_META) as [BrokerType, typeof BROKER_META[BrokerType]][]).map(([key, m]) => (
                  <button
                    key={key}
                    onClick={() => { setBrokerType(key); setLabel(m.name); }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      brokerType === key
                        ? "border-[#6366F1] bg-[#6366F1]/10"
                        : "border-[#1E293B] bg-[#0F1520] hover:border-[#263147]"
                    )}
                  >
                    <div className="text-2xl mb-2">{m.logo}</div>
                    <div className="text-sm font-semibold text-[#F8FAFC]">{m.name}</div>
                    <div className="text-[10px] text-[#64748B] mt-0.5 leading-tight">{m.description}</div>
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">שם לחיבור (אופציונלי)</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={meta.name}
                  className="w-full rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-2 text-sm text-[#F8FAFC] outline-none focus:border-[#6366F1]"
                />
              </div>
              <button
                onClick={() => setStep("creds")}
                className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] transition-colors"
              >
                המשך ←
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{meta.logo}</span>
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">{meta.name}</div>
                  <div className="text-[10px] text-[#64748B]">{meta.description}</div>
                </div>
              </div>

              {meta.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-[#94A3B8] mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={creds[f.key] ?? ""}
                    onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-2 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1]"
                  />
                </div>
              ))}

              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setAutoExec(!autoExec)}
                  className={cn("h-5 w-9 rounded-full transition-colors relative", autoExec ? "bg-[#6366F1]" : "bg-[#1E293B]")}
                >
                  <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", autoExec ? "translate-x-4" : "translate-x-0.5")} />
                </div>
                <div>
                  <span className="text-xs font-medium text-[#F8FAFC]">ביצוע אוטומטי</span>
                  <span className="text-[10px] text-[#64748B] block">שלח פקודות אמיתיות כשסיגנל Live Lab מופיע</span>
                </div>
              </label>

              {error && (
                <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep("type")} className="flex-1 rounded-lg border border-[#1E293B] px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">
                  ← חזרה
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
                >
                  {loading ? "מתחבר..." : "חבר ברוקר"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Broker Card ──────────────────────────────────────────────────────────────

function BrokerCard({ conn, onRefresh }: { conn: BrokerConn; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [orderForm, setOrderForm] = useState({ ticker: "", side: "buy", qty: "100", order_type: "market" });
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");

  const meta = BROKER_META[conn.broker_type as BrokerType] ?? { logo: "🏦", name: conn.broker_type, color: "from-gray-600 to-gray-700" };

  const statusIcon = {
    connected:    <Wifi className="h-3.5 w-3.5 text-[#10B981]" />,
    disconnected: <WifiOff className="h-3.5 w-3.5 text-[#64748B]" />,
    error:        <AlertCircle className="h-3.5 w-3.5 text-[#EF4444]" />,
  }[conn.status];

  async function testConn() {
    setTesting(true);
    try {
      const t0 = Date.now();
      const r = await apiFetch<{ ok: boolean; message: string }>(`/brokers/${conn.id}/test`, { method: "POST" });
      setLatency(Date.now() - t0);
      onRefresh();
    } finally {
      setTesting(false);
    }
  }

  async function loadDetails() {
    if (!expanded) {
      setExpanded(true);
      try {
        const [pos, ords, acct] = await Promise.all([
          apiFetch<Position[]>(`/brokers/${conn.id}/positions`).catch(() => []),
          apiFetch<BrokerOrder[]>(`/brokers/${conn.id}/orders`).catch(() => []),
          apiFetch<AccountInfo>(`/brokers/${conn.id}/account`).catch(() => null),
        ]);
        setPositions(pos);
        setOrders(ords);
        setAccount(acct);
      } catch {}
    } else {
      setExpanded(false);
    }
  }

  async function deleteConn() {
    if (!confirm(`מחק חיבור "${conn.label}"?`)) return;
    await apiFetch(`/brokers/${conn.id}`, { method: "DELETE" });
    onRefresh();
  }

  async function placeOrder() {
    setOrdering(true);
    setOrderMsg("");
    try {
      const r = await apiFetch<{ status: string; fill_price: number | null; error: string | null }>(`/brokers/${conn.id}/order`, {
        method: "POST",
        body: JSON.stringify({ ...orderForm, qty: parseInt(orderForm.qty) }),
      });
      setOrderMsg(r.error ? `שגיאה: ${r.error}` : `✓ פקודה נשלחה · סטטוס: ${r.status}`);
      const ords = await apiFetch<BrokerOrder[]>(`/brokers/${conn.id}/orders`).catch(() => []);
      setOrders(ords);
    } catch (e: unknown) {
      setOrderMsg(`שגיאה: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setOrdering(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl", meta.color)}>
          {meta.logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#F8FAFC] text-sm">{conn.label}</span>
            <div className="flex items-center gap-1">
              {statusIcon}
              <span className={cn("text-[10px] font-medium", {
                connected: "text-[#10B981]",
                disconnected: "text-[#64748B]",
                error: "text-[#EF4444]",
              }[conn.status])}>{conn.status}</span>
            </div>
            {conn.auto_execute && (
              <span className="rounded-full bg-[#F59E0B]/15 border border-[#F59E0B]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#F59E0B]">AUTO</span>
            )}
          </div>
          <div className="text-[10px] text-[#64748B] mt-0.5">
            {conn.account_id || meta.name}
            {latency !== null && <span className="ml-2 text-[#10B981]">· {latency}ms</span>}
          </div>
          {conn.last_error && (
            <div className="text-[10px] text-[#EF4444] mt-0.5 truncate max-w-xs">{conn.last_error}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={testConn} disabled={testing} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1E293B] text-[#64748B] hover:text-[#F8FAFC] transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", testing && "animate-spin")} />
          </button>
          <button onClick={loadDetails} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1E293B] text-[#64748B] hover:text-[#F8FAFC] transition-colors">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button onClick={deleteConn} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#EF4444]/20 text-[#EF4444]/60 hover:text-[#EF4444] transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#1E293B] p-4 space-y-4">
          {/* Account summary */}
          {account && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Net Liq", value: `$${account.net_liquidation.toLocaleString()}`, icon: <DollarSign className="h-3 w-3" /> },
                { label: "Cash", value: `$${account.cash.toLocaleString()}`, icon: <DollarSign className="h-3 w-3" /> },
                { label: "Buying Power", value: `$${account.buying_power.toLocaleString()}`, icon: <TrendingUp className="h-3 w-3" /> },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-[#1E293B] bg-[#0F1520] p-2.5 text-center">
                  <div className="text-[10px] text-[#64748B] flex items-center justify-center gap-1 mb-1">{s.icon}{s.label}</div>
                  <div className="text-sm font-bold text-[#F8FAFC]">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Positions */}
          <div>
            <h4 className="text-xs font-semibold text-[#94A3B8] mb-2">פוזיציות פתוחות ({positions.length})</h4>
            {positions.length === 0 ? (
              <p className="text-xs text-[#475569]">אין פוזיציות פתוחות</p>
            ) : (
              <div className="space-y-1">
                {positions.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0F1520] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", p.side === "long" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#EF4444]/20 text-[#EF4444]")}>
                        {p.side.toUpperCase()}
                      </span>
                      <span className="font-bold text-[#F8FAFC]">{p.ticker}</span>
                      <span className="text-[#64748B]">{p.qty} מניות</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#64748B]">${p.avg_cost.toFixed(2)}</span>
                      <span className={p.unrealized_pnl >= 0 ? "text-[#10B981] font-semibold" : "text-[#EF4444] font-semibold"}>
                        {p.unrealized_pnl >= 0 ? "+" : ""}${p.unrealized_pnl.toFixed(0)} ({p.unrealized_pnl_pct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual order */}
          <div>
            <h4 className="text-xs font-semibold text-[#94A3B8] mb-2">שלח פקודה ידנית</h4>
            <div className="flex gap-2 flex-wrap">
              <input
                value={orderForm.ticker}
                onChange={e => setOrderForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
                placeholder="TICKER"
                className="w-20 rounded-lg border border-[#1E293B] bg-[#131A26] px-2.5 py-1.5 text-xs text-[#F8FAFC] outline-none focus:border-[#6366F1] uppercase"
              />
              <select
                value={orderForm.side}
                onChange={e => setOrderForm(p => ({ ...p, side: e.target.value }))}
                className="rounded-lg border border-[#1E293B] bg-[#131A26] px-2 py-1.5 text-xs text-[#F8FAFC] outline-none"
              >
                <option value="buy">קנה</option>
                <option value="sell">מכור</option>
              </select>
              <input
                value={orderForm.qty}
                onChange={e => setOrderForm(p => ({ ...p, qty: e.target.value }))}
                placeholder="כמות"
                type="number"
                className="w-20 rounded-lg border border-[#1E293B] bg-[#131A26] px-2.5 py-1.5 text-xs text-[#F8FAFC] outline-none focus:border-[#6366F1]"
              />
              <select
                value={orderForm.order_type}
                onChange={e => setOrderForm(p => ({ ...p, order_type: e.target.value }))}
                className="rounded-lg border border-[#1E293B] bg-[#131A26] px-2 py-1.5 text-xs text-[#F8FAFC] outline-none"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
              <button
                onClick={placeOrder}
                disabled={ordering || !orderForm.ticker}
                className="flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-50 transition-colors"
              >
                <Send className="h-3 w-3" />
                {ordering ? "שולח..." : "שלח"}
              </button>
            </div>
            {orderMsg && (
              <p className={cn("text-[10px] mt-1.5", orderMsg.startsWith("שגיאה") ? "text-[#EF4444]" : "text-[#10B981]")}>
                {orderMsg}
              </p>
            )}
          </div>

          {/* Recent orders */}
          {orders.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[#94A3B8] mb-2">פקודות אחרונות</h4>
              <div className="space-y-1">
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#0F1520] px-3 py-1.5 text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-bold", o.side === "buy" ? "text-[#10B981]" : "text-[#EF4444]")}>{o.side.toUpperCase()}</span>
                      <span className="text-[#F8FAFC]">{o.ticker}</span>
                      <span className="text-[#64748B]">{o.qty}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#64748B]">
                      {o.fill_price && <span className="text-[#F8FAFC]">${o.fill_price}</span>}
                      <span className={cn("rounded px-1 py-0.5 font-semibold text-[9px]", {
                        filled:  "bg-[#10B981]/20 text-[#10B981]",
                        pending: "bg-[#F59E0B]/20 text-[#F59E0B]",
                        rejected: "bg-[#EF4444]/20 text-[#EF4444]",
                      }[o.status] ?? "bg-[#1E293B] text-[#64748B]")}>{o.status}</span>
                      {o.submitted_at && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(o.submitted_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<BrokerConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<BrokerConn[]>("/brokers");
      setBrokers(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      {showAdd && <AddBrokerModal onClose={() => setShowAdd(false)} onAdded={load} />}

      {/* Header */}
      <div className="border-b border-[#1E293B] bg-[#0D1117] px-6 py-6">
        <div className="mx-auto max-w-screen-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#F8FAFC]">חיבורי ברוקר</h1>
              <p className="text-sm text-[#64748B] mt-0.5">
                חבר את הברוקר שלך לביצוע אוטומטי של סיגנלים מה-Live Lab
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-all shadow-lg"
            >
              <Plus className="h-4 w-4" />
              חבר ברוקר
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex gap-6 mt-4 text-sm">
            <span className="text-[#94A3B8]">
              <strong className="text-[#F8FAFC]">{brokers.length}</strong> ברוקרים
            </span>
            <span className="text-[#94A3B8]">
              <strong className="text-[#10B981]">{brokers.filter(b => b.status === "connected").length}</strong> מחוברים
            </span>
            <span className="text-[#94A3B8]">
              <strong className="text-[#F59E0B]">{brokers.filter(b => b.auto_execute).length}</strong> ביצוע אוטומטי
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-lg px-6 py-6 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 rounded-xl border border-[#1E293B] bg-[#0D1117] animate-pulse" />
            ))}
          </div>
        ) : brokers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#1E293B] p-12 text-center">
            <div className="text-4xl mb-3">🔌</div>
            <h3 className="text-base font-semibold text-[#F8FAFC] mb-1">אין ברוקרים מחוברים</h3>
            <p className="text-sm text-[#64748B] mb-5 max-w-sm mx-auto">
              חבר את IBKR או Colmex כדי לשלוח סיגנלים מה-Live Lab כפקודות אמיתיות לחשבון שלך
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-xl bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white mx-auto hover:bg-[#4F46E5] transition-colors"
            >
              <Plus className="h-4 w-4" />
              חבר ברוקר ראשון
            </button>
          </div>
        ) : (
          <>
            {brokers.map(b => (
              <BrokerCard key={b.id} conn={b} onRefresh={load} />
            ))}

            {/* Coming soon */}
            <div className="rounded-xl border border-dashed border-[#1E293B] p-5 text-center">
              <div className="text-2xl mb-1">🔜</div>
              <p className="text-xs text-[#475569]">
                בקרוב: Alpaca, Saxo Bank, מזרחי טפחות, פועלים שוקי הון
              </p>
            </div>

            {/* Latency comparison */}
            {brokers.filter(b => b.status === "connected").length > 1 && (
              <LatencyComparison brokers={brokers.filter(b => b.status === "connected")} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LatencyComparison({ brokers }: { brokers: BrokerConn[] }) {
  const [results, setResults] = useState<{ label: string; ms: number }[]>([]);
  const [running, setRunning] = useState(false);

  async function runTest() {
    setRunning(true);
    const res = await Promise.all(
      brokers.map(async b => {
        try {
          const r = await apiFetch<{ latency_ms: number; label: string }>(`/brokers/${b.id}/latency`);
          return { label: r.label, ms: r.latency_ms };
        } catch {
          return { label: b.label, ms: -1 };
        }
      })
    );
    setResults(res.sort((a, b) => a.ms - b.ms));
    setRunning(false);
  }

  const max = Math.max(...results.map(r => r.ms), 1);

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#F8FAFC]">השוואת מהירות ביצוע</h3>
          <p className="text-[10px] text-[#64748B]">latency round-trip לכל ברוקר</p>
        </div>
        <button
          onClick={runTest}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <Zap className={cn("h-3.5 w-3.5", running && "animate-pulse text-[#F59E0B]")} />
          {running ? "בודק..." : "הרץ בדיקה"}
        </button>
      </div>

      {results.length > 0 ? (
        <div className="space-y-2.5">
          {results.map((r, i) => (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <div className="flex items-center gap-2">
                  {i === 0 && <span className="rounded bg-[#10B981]/20 text-[#10B981] px-1.5 text-[9px] font-bold">הכי מהיר</span>}
                  <span className="text-[#F8FAFC] font-medium">{r.label}</span>
                </div>
                <span className={cn("font-mono font-bold", i === 0 ? "text-[#10B981]" : "text-[#94A3B8]")}>
                  {r.ms < 0 ? "שגיאה" : `${r.ms}ms`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1E293B] overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", i === 0 ? "bg-[#10B981]" : "bg-[#6366F1]")}
                  style={{ width: r.ms < 0 ? "0%" : `${(r.ms / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[#475569] text-center mt-2">
            מומלץ להשתמש ב-{results[0]?.label} לאסטרטגיות בנפח גבוה
          </p>
        </div>
      ) : (
        <p className="text-xs text-[#475569] text-center">לחץ "הרץ בדיקה" להשוואה</p>
      )}
    </div>
  );
}
