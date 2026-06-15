"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, CheckSquare, Play, Zap, DollarSign, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { StrategyConfig, BacktestResult, LookbackYears } from "@/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confirmation?: StrategyConfig;
  isTyping?: boolean;
}

interface ChatPanelProps {
  onBacktestResult: (result: BacktestResult) => void;
  onRunning: (running: boolean) => void;
  preloadStrategy?: StrategyConfig;
  startingCapital: number;
  lookbackYears: LookbackYears;
  riskPerTrade: number;
  onCapitalChange: (v: number) => void;
  onLookbackChange: (v: LookbackYears) => void;
  onRiskPerTradeChange: (v: number) => void;
}

const LOOKBACK_OPTIONS: { value: LookbackYears; label: string; badge?: string }[] = [
  { value: 1,  label: "1 שנה" },
  { value: 3,  label: "3 שנים" },
  { value: 5,  label: "5 שנים" },
  { value: 10, label: "10 שנים", badge: "Pro" },
  { value: 15, label: "15 שנים", badge: "Elite" },
  { value: 20, label: "20 שנים", badge: "Elite" },
];

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "היי! אני עוזר הבדיקות שלך. תאר את האסטרטגיה שלך **בעברית או באנגלית** ואני אמיר אותה לחוקים מובנים.\n\nדוגמה בעברית: *\"כניסה כשמחיר עובר מעל VWAP, פלוואט עד 20 מיליון, rvol מעל 3x\"*\n\nדוגמה באנגלית: *\"VWAP cross on 1-min chart, float under 20M, rvol above 3x\"*\n\nאחרי הניתוח תגדיר את אחוזי ה-Take Profit וה-Stop Loss.",
};

export default function ChatPanel({
  onBacktestResult,
  onRunning,
  preloadStrategy,
  startingCapital,
  lookbackYears,
  riskPerTrade,
  onCapitalChange,
  onLookbackChange,
  onRiskPerTradeChange,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStrategy, setPendingStrategy] = useState<StrategyConfig | null>(null);
  const [capitalInput, setCapitalInput] = useState(String(startingCapital));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (preloadStrategy) handlePreloadStrategy(preloadStrategy);
  }, [preloadStrategy]);

  function handlePreloadStrategy(strategy: StrategyConfig) {
    const s = { ...strategy, lookbackYears };
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: `Load strategy: "${strategy.name}"` };
    const aiMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `טענתי את האסטרטגיה **${strategy.name}** מהכספת. בדוק את ההגדרות והפעל כשמוכן:`,
      confirmation: s,
    };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setPendingStrategy(s);
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;
    const userInput = input;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: userInput };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setMessages(prev => [...prev, { id: "typing", role: "assistant", content: "", isTyping: true }]);

    try {
      const resp = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "") + "/backtest/parse",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: userInput, language: "he" }) }
      );
      const data = resp.ok ? await resp.json() : null;

      const s = data?.strategy;
      const parsed: import("@/types").StrategyConfig = s ? {
        name: s.name,
        description: s.description,
        rules: s.rules,
        slippage: s.slippage,
        timeframe: s.timeframe,
        lookbackYears: lookbackYears,
      } : { ...parseStrategyFromText(userInput), lookbackYears };

      setPendingStrategy(parsed);

      const warnings: string[] = data?.warnings ?? [];
      const warningText = warnings.length
        ? "\n\n⚠️ " + warnings.join("\n⚠️ ")
        : "";

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `פרסרתי את האסטרטגיה. בדוק שהחוקים נכונים ואז הפעל את הבדיקה:${warningText}`,
        confirmation: parsed,
      };
      setMessages(prev => prev.filter(m => m.id !== "typing").concat(aiMsg));
    } catch {
      const parsed = { ...parseStrategyFromText(userInput), lookbackYears };
      setPendingStrategy(parsed);
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "פרסרתי את האסטרטגיה. בדוק שהחוקים נכונים ואז הפעל את הבדיקה:",
        confirmation: parsed,
      };
      setMessages(prev => prev.filter(m => m.id !== "typing").concat(aiMsg));
    }
    setIsLoading(false);
  }

  async function handleRunBacktest(tpPct: number, slPct: number) {
    if (!pendingStrategy) return;
    const strategy = {
      ...pendingStrategy,
      lookbackYears,
      rules: [
        ...pendingStrategy.rules.filter(r => r.type !== "exit"),
        { type: "exit" as const, condition: `Take Profit at +${tpPct}%`, parameters: { pct: tpPct } },
        { type: "exit" as const, condition: `Stop Loss at -${slPct}%`, parameters: { pct: -slPct } },
      ],
    };

    const runMsg: Message = {
      id: "running",
      role: "assistant",
      content: `מריץ בדיקה של ${lookbackYears} שנים... סורק ימי קטליסט היסטוריים של מניות פני.`,
      isTyping: true,
    };
    setMessages(prev => [...prev, runMsg]);
    onRunning(true);

    try {
      const { runBacktest } = await import("@/lib/api");

      // Retry up to 3 times — server may be restarting after a deploy
      let result;
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await runBacktest(strategy);
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!result) throw lastErr;

      const finalEquity = startingCapital * (1 + result.metrics.totalRoi / 100);
      const doneMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✅ הבדיקה הושלמה!\n\n**תשואה כוללת:** ${result.metrics.totalRoi >= 0 ? "+" : ""}${result.metrics.totalRoi.toFixed(1)}% על פני ${lookbackYears} שנים\n**אחוז הצלחה:** ${result.metrics.winRate.toFixed(1)}%\n**סה"כ עסקאות:** ${result.metrics.totalTrades}\n**הון סופי:** $${finalEquity.toLocaleString("en-US", { maximumFractionDigits: 0 })} (מתוך $${startingCapital.toLocaleString()})`,
      };
      setMessages(prev => prev.filter(m => m.id !== "running").concat(doneMsg));
      onBacktestResult(result);
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ שגיאה: ${err instanceof Error ? err.message : "הבדיקה נכשלה"}`,
      };
      setMessages(prev => prev.filter(m => m.id !== "running").concat(errMsg));
    } finally {
      onRunning(false);
      setPendingStrategy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#1E293B] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#8B5CF6]/20">
          <Zap className="h-4 w-4 text-[#8B5CF6]" />
        </div>
        <span className="text-sm font-semibold text-[#F8FAFC]">AI Strategy Assistant</span>
        <Badge variant="violet" className="ml-auto">GPT-4o</Badge>
      </div>

      {/* Config bar */}
      <div className="border-b border-[#1E293B] bg-[#0B0E14]/60 px-4 py-3 space-y-2.5">
        {/* Capital */}
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-[#10B981] shrink-0" />
          <span className="text-xs text-[#64748B] shrink-0">הון התחלתי:</span>
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">$</span>
            <input
              type="number"
              value={capitalInput}
              onChange={e => {
                setCapitalInput(e.target.value);
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v > 0) onCapitalChange(v);
              }}
              className="w-full rounded-md border border-[#1E293B] bg-[#131A26] py-1 pl-5 pr-2 text-xs text-[#F8FAFC] focus:border-[#10B981]/50 focus:outline-none"
              min={100}
              step={1000}
            />
          </div>
          <span className="text-xs text-[#94A3B8] shrink-0 tabular-nums">
            → ${(startingCapital * 3.485).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* Risk per trade */}
        <div className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
          <span className="text-xs text-[#64748B] shrink-0">סיכון לעסקה:</span>
          <div className="relative flex-1 max-w-[120px]">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">$</span>
            <input
              type="number"
              value={riskPerTrade}
              onChange={e => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v > 0) onRiskPerTradeChange(v);
              }}
              className="w-full rounded-md border border-[#1E293B] bg-[#131A26] py-1 pl-5 pr-2 text-xs text-[#F8FAFC] focus:border-[#F59E0B]/50 focus:outline-none"
              min={10}
              step={100}
            />
          </div>
          <span className="text-xs text-[#64748B]">לעסקה</span>
        </div>

        {/* Lookback */}
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-[#6366F1] shrink-0" />
          <span className="text-xs text-[#64748B] shrink-0">טווח בדיקה:</span>
          <div className="flex flex-wrap gap-1">
            {LOOKBACK_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onLookbackChange(opt.value)}
                className={cn(
                  "relative rounded px-2 py-0.5 text-[10px] font-semibold transition-all",
                  lookbackYears === opt.value
                    ? "bg-[#6366F1] text-white"
                    : "border border-[#1E293B] bg-[#131A26] text-[#94A3B8] hover:border-[#263147] hover:text-[#F8FAFC]"
                )}
              >
                {opt.label}
                {opt.badge && (
                  <span className="ml-1 text-[8px] text-[#8B5CF6]">{opt.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            <div className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              msg.role === "assistant" ? "bg-[#8B5CF6]/20 text-[#8B5CF6]" : "bg-[#6366F1]/20 text-[#6366F1]"
            )}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
              msg.role === "assistant"
                ? "bg-[#131A26] border border-[#1E293B] text-[#F8FAFC]"
                : "bg-[#6366F1]/15 border border-[#6366F1]/25 text-[#F8FAFC]"
            )}>
              {msg.isTyping ? <TypingIndicator /> : (
                <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\*(.+?)\*/g, "<em>$1</em>"),
                }} />
              )}
              {msg.confirmation && (
                <ConfirmationBlock
                  strategy={msg.confirmation}
                  lookbackYears={lookbackYears}
                  onRun={handleRunBacktest}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1E293B] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="תאר את האסטרטגיה שלך בעברית או באנגלית..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[#1E293B] bg-[#131A26] px-3 py-2 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#6366F1]/50 focus:outline-none focus:ring-1 focus:ring-[#6366F1]/30"
          />
          <Button onClick={handleSend} loading={isLoading} size="sm" className="h-[52px] w-10 p-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-[#64748B]">Enter לשליחה · Shift+Enter לשורה חדשה</p>
      </div>
    </div>
  );
}

function ConfirmationBlock({
  strategy,
  lookbackYears,
  onRun,
}: {
  strategy: StrategyConfig;
  lookbackYears: LookbackYears;
  onRun: (tpPct: number, slPct: number) => void;
}) {
  const displayRules = strategy.rules.filter(r => r.type !== "exit");

  // Extract TP/SL from parsed strategy if available, otherwise use sensible defaults
  const exitRules = strategy.rules.filter(r => r.type === "exit");
  const tpRule = exitRules.find(r => (r.parameters.pct as number) > 0);
  const slRule = exitRules.find(r => (r.parameters.pct as number) < 0);
  const tp = tpRule ? Math.abs(tpRule.parameters.pct as number) : 15;
  const sl = slRule ? Math.abs(slRule.parameters.pct as number) : 5;

  return (
    <div className="mt-3 rounded-lg border border-[#6366F1]/20 bg-[#6366F1]/5 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6366F1]">אישור אסטרטגיה</p>
      <div className="space-y-1.5">
        {displayRules.map((rule, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
            <span className="text-[#94A3B8]">
              <span className="font-medium text-[#F8FAFC]">
                {rule.type === "entry" ? "כניסה" : "פילטר"}:{" "}
              </span>
              {rule.condition}
            </span>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#1E293B] pt-2 text-xs">
          <span className="text-[#64748B]">Slippage: <span className="font-medium text-[#F8FAFC]">{strategy.slippage}%</span></span>
          <span className="text-[#64748B]">Timeframe: <span className="font-medium text-[#F8FAFC]">{strategy.timeframe}</span></span>
          <span className="text-[#64748B]">טווח: <span className="font-medium text-[#F8FAFC]">{lookbackYears} שנים</span></span>
        </div>
      </div>
      <Button
        variant="neon"
        size="sm"
        className="w-full mt-2"
        onClick={() => onRun(tp, sl)}
      >
        <Play className="h-3.5 w-3.5" />
        הפעל בדיקת {lookbackYears} שנים
      </Button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#6366F1] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

function parseStrategyFromText(text: string): Omit<StrategyConfig, "lookbackYears"> {
  const lower = text.toLowerCase();
  const rules = [];

  if (lower.includes("vwap")) {
    rules.push({ type: "entry" as const, condition: "Price crosses above VWAP", parameters: { timeframe: "1m" } });
  } else if (lower.includes("hod") || lower.includes("high of day")) {
    rules.push({ type: "entry" as const, condition: "Break above High of Day", parameters: {} });
  } else {
    rules.push({ type: "entry" as const, condition: "Price momentum signal", parameters: {} });
  }

  const floatMatch = text.match(/float\s*[<under]*\s*(\d+)m/i);
  if (floatMatch) rules.push({ type: "filter" as const, condition: `Float < ${floatMatch[1]}M shares`, parameters: { maxFloat: parseInt(floatMatch[1]) * 1000000 } });

  const rvolMatch = text.match(/r?vol(?:ume)?\s*[>above]*\s*(\d+)x?/i);
  if (rvolMatch) rules.push({ type: "filter" as const, condition: `Relative Volume > ${rvolMatch[1]}x`, parameters: { minRvol: parseInt(rvolMatch[1]) } });

  const tpMatch = text.match(/(\d+)%?\s*(?:take profit|tp|profit)/i) || text.match(/(?:take profit|tp|profit)\s*(?:at)?\s*(\d+)/i);
  const slMatch = text.match(/(\d+)%?\s*(?:stop loss|sl|stop)/i) || text.match(/(?:stop loss|sl|stop)\s*(?:at)?\s*(\d+)/i);

  rules.push({ type: "exit" as const, condition: `Take Profit +${tpMatch ? tpMatch[1] : 15}%`, parameters: { pct: tpMatch ? parseInt(tpMatch[1]) : 15 } });
  rules.push({ type: "exit" as const, condition: `Stop Loss -${slMatch ? slMatch[1] : 5}%`, parameters: { pct: slMatch ? -parseInt(slMatch[1]) : -5 } });

  return {
    name: "Custom Strategy",
    description: text.slice(0, 100),
    rules,
    slippage: 2,
    timeframe: lower.includes("5m") ? "5m" : lower.includes("15m") ? "15m" : "1m",
  };
}
