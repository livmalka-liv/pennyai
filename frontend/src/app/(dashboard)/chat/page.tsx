"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { authHeader } from "@/lib/auth";
import { Send, Bot, User, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const API = (process.env.NEXT_PUBLIC_API_URL || "https://pennyai-backend-production.up.railway.app/api/v1").replace(/\/$/, "");

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SUGGESTED = [
  "מה זה VWAP Reclaim ואיך נכנסים לעסקה?",
  "איך לחשב גודל פוזיציה נכון?",
  "מה ההבדל בין Gap and Go ל-HOD Breakout?",
  "מה פירוש RVOL ומתי הוא חשוב?",
  "איך לקרוא טייפ ב-Level 2?",
  "מה זה float rotation ולמה זה קורה?",
];

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `היי! אני פני, עוזר המסחר שלך 🤖\n\nאני כאן 24/7 לענות על שאלות על:\n• אסטרטגיות מסחר (VWAP, Gap and Go, HOD Breakout)\n• ניתוח טכני ופרמטרים (Float, RVOL, קטליסטים)\n• ניהול סיכונים וגודל פוזיציה\n• פרשנות תוצאות Backtest\n\nשאל אותי כל שאלה!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
    const allMessages = [...messages.filter(m => m.id !== "welcome"), userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`${API}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("שגיאה");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)
              );
            }
          } catch {}
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: "מצטער, אירעה שגיאה. נסה שוב.", streaming: false } : m)
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#0B0E14]">

      {/* Header */}
      <div className="border-b border-[#1E293B] px-6 py-3 flex items-center gap-3 bg-[#0D1117]">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">פני — AI Trading Assistant</div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[10px] text-[#64748B]">זמין 24/7</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">

        {messages.map(msg => (
          <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            {/* Avatar */}
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              msg.role === "assistant"
                ? "bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]"
                : "bg-[#1E293B]"
            )}>
              {msg.role === "assistant"
                ? <Bot className="h-3.5 w-3.5 text-white" />
                : <User className="h-3.5 w-3.5 text-[#94A3B8]" />
              }
            </div>

            {/* Bubble */}
            <div className={cn(
              "max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
              msg.role === "assistant"
                ? "bg-[#0D1117] border border-[#1E293B] text-[#E2E8F0] rounded-tl-sm"
                : "bg-[#6366F1] text-white rounded-tr-sm"
            )}>
              {msg.content}
              {msg.streaming && (
                <span className="inline-block w-1 h-4 bg-[#6366F1] ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        ))}

        {/* Suggested questions (only if first message) */}
        {messages.length === 1 && (
          <div className="mt-4">
            <p className="text-xs text-[#475569] mb-2 text-center">שאלות נפוצות</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="rounded-lg border border-[#1E293B] bg-[#0D1117] px-3 py-2 text-xs text-[#94A3B8] hover:border-[#6366F1]/40 hover:text-[#F8FAFC] transition-all text-right"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1E293B] bg-[#0D1117] px-4 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל אותי כל שאלה על מסחר..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-[#1E293B] bg-[#131A26] px-4 py-2.5 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1] transition-all max-h-32 overflow-y-auto disabled:opacity-50"
            style={{ direction: "rtl" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 w-10 rounded-xl bg-[#6366F1] flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shrink-0"
          >
            {loading
              ? <Loader2 className="h-4 w-4 text-white animate-spin" />
              : <Send className="h-4 w-4 text-white" />
            }
          </button>
        </form>
        <p className="text-[10px] text-[#334155] mt-1.5 text-center">
          Enter לשליחה · Shift+Enter לשורה חדשה
        </p>
      </div>
    </div>
  );
}
