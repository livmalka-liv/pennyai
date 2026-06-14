"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Lock, BookOpen, Clock, Star, ChevronRight, Crown, Pause, Square, Volume2, VolumeX, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

// ─── Penny — Personal AI Guide ────────────────────────────────────────────────

interface Chapter {
  id: string;
  text: string;
  title: string;
  icon: string;
  bg: string;
  section: string;         // which part of the app we're "in"
  mockup: React.ReactNode; // mini UI visual
  durationMs: number;
}

// Minimal mock UI components used inside the player
function MockStrategyCard({ name, wr, pnl, active = true }: { name: string; wr: number; pnl: number; active?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-[11px]", active ? "border-[#6366F1]/40 bg-[#6366F1]/10" : "border-white/10 bg-white/5")}>
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", active ? "bg-[#10B981]" : "bg-white/20")} />
        <span className="font-semibold text-white/90">{name}</span>
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="text-[#10B981]">{wr}%</span>
        <span className={pnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}>{pnl >= 0 ? "+" : ""}{pnl}$</span>
      </div>
    </div>
  );
}

function MockSignalCard({ ticker, entry, float: fl, rvol, gain }: { ticker: string; entry: number; float: number; rvol: number; gain?: number }) {
  const hotFloat = fl < 5;
  const hotRvol = rvol >= 10;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-sm">{ticker}</span>
        <span className="rounded bg-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 font-semibold">WIN</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div><span className="text-white/40">כניסה</span><br /><span className="text-white font-semibold">${entry}</span></div>
        <div><span className="text-white/40">Float</span><br /><span className={cn("font-semibold", hotFloat ? "text-orange-400" : "text-white")}>{fl}M {hotFloat && "🔥"}</span></div>
        <div><span className="text-white/40">RVOL</span><br /><span className={cn("font-semibold", hotRvol ? "text-orange-400" : "text-white")}>{rvol}x</span></div>
      </div>
      {gain !== undefined && (
        <div className="text-right text-[#10B981] font-bold">+{gain}%</div>
      )}
    </div>
  );
}

function MockBacktest({ wr, pnl, dd }: { wr: number; pnl: number; dd: number }) {
  return (
    <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 px-3 py-2.5 text-[10px] space-y-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-white/60 text-[9px]">VWAP Reclaim — 15 שנים</span>
        <span className="rounded bg-[#10B981]/20 text-[#10B981] px-1.5 font-bold text-[9px]">✓ PASS</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-[#10B981] font-bold text-base">{wr}%</div><div className="text-white/40">Win Rate</div></div>
        <div><div className="text-[#10B981] font-bold text-base">+{pnl}K</div><div className="text-white/40">P&amp;L</div></div>
        <div><div className="text-[#EF4444] font-bold text-base">-{dd}%</div><div className="text-white/40">Max DD</div></div>
      </div>
      <div className="h-8 relative">
        <svg viewBox="0 0 120 30" className="w-full h-full">
          <polyline points="0,28 15,24 30,20 38,22 50,16 65,12 80,8 95,6 110,4 120,3" fill="none" stroke="#10B981" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

function MockPerformance() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] space-y-2">
      <div className="text-white/60 text-[9px] mb-1">AI Optimizer — ממצא חדש</div>
      {[
        { hour: "16:00–17:00", wr: 73, bar: 73 },
        { hour: "11:00–12:00", wr: 61, bar: 61 },
        { hour: "14:00–15:00", wr: 49, bar: 49 },
      ].map((r) => (
        <div key={r.hour} className="flex items-center gap-2">
          <span className="text-white/50 w-[70px] shrink-0">{r.hour}</span>
          <div className="flex-1 h-1.5 rounded bg-white/10 overflow-hidden">
            <div className="h-full rounded bg-[#6366F1]" style={{ width: `${r.bar}%` }} />
          </div>
          <span className={cn("w-8 text-right font-bold", r.wr >= 65 ? "text-[#10B981]" : "text-white/70")}>{r.wr}%</span>
        </div>
      ))}
      <div className="rounded bg-[#6366F1]/15 border border-[#6366F1]/30 px-2 py-1 text-[9px] text-[#A5B4FC] mt-1">
        💡 המלצה: הגבל כניסות ל-16:00–17:00
      </div>
    </div>
  );
}

function MockCourse() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] space-y-1.5">
      <div className="text-white/60 text-[9px]">קורס AI — VWAP Reclaim</div>
      {[
        { n: 1, t: "מה מזיז מניית פני סטוק?", done: true },
        { n: 2, t: "כניסה, יעד, וסטופ לוס שלך", done: true },
        { n: 3, t: "למה 16:00–17:00 עובד לך", done: false },
      ].map(m => (
        <div key={m.n} className="flex items-center gap-2">
          <div className={cn("h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0",
            m.done ? "bg-[#10B981] text-black" : "bg-white/10 text-white/50"
          )}>{m.done ? "✓" : m.n}</div>
          <span className={m.done ? "text-white/70 line-through" : "text-white/90"}>{m.t}</span>
        </div>
      ))}
    </div>
  );
}

function MockScanner() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
        <span className="text-[9px] text-white/50">WebSocket · 200 מניות · כל שנייה</span>
      </div>
      {[
        { t: "FFIE",  p: 0.94, chg: "+18.4%", alert: true },
        { t: "MULN",  p: 1.12, chg: "+11.2%", alert: true },
        { t: "CENN",  p: 0.31, chg: "+6.1%",  alert: false },
        { t: "PHUN",  p: 2.44, chg: "+3.2%",  alert: false },
      ].map(r => (
        <div key={r.t} className={cn("flex items-center justify-between rounded px-2 py-1", r.alert ? "bg-[#F59E0B]/10 border border-[#F59E0B]/30" : "border border-transparent")}>
          <span className="font-bold text-white">{r.t}</span>
          <span className="text-white/60">${r.p}</span>
          <span className={r.alert ? "text-[#F59E0B] font-bold" : "text-[#10B981]"}>{r.chg}</span>
          {r.alert && <span className="text-[8px] bg-[#EF4444]/30 text-[#EF4444] rounded px-1">🔥 SIGNAL</span>}
        </div>
      ))}
    </div>
  );
}

const CHAPTERS: Chapter[] = [
  {
    id: "intro",
    title: "היי, אני פני 👋",
    icon: "🤖",
    section: "כללי",
    bg: "from-[#6366F1] via-[#7C3AED] to-[#4F46E5]",
    text: "היי! אני פני, העוזרת האישית שלך ב-PennyAI. בואו ניתן לי שתי דקות ואראה לך בדיוק איך הפלטפורמה עובדת, מה כל כפתור עושה, ולמה זה שונה מכל דבר אחר שראית. מוכן? יאלה, מתחילים.",
    mockup: (
      <div className="text-center py-3">
        <div className="text-4xl mb-2">🤖</div>
        <div className="text-white/80 text-sm font-semibold">PennyAI</div>
        <div className="text-white/40 text-[10px] mt-1">Backtest · Live Lab · AI Course</div>
        <div className="mt-3 flex justify-center gap-2">
          {["Sandbox", "Live Lab", "Academy"].map(t => (
            <div key={t} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] text-white/70">{t}</div>
          ))}
        </div>
      </div>
    ),
    durationMs: 9000,
  },
  {
    id: "sandbox",
    title: "Sandbox — הבאקטסט",
    icon: "📊",
    section: "Sandbox",
    bg: "from-[#10B981] via-[#059669] to-[#065F46]",
    text: "אוקיי, אז נתחיל מהסאנדבוקס. נניח שמצאתי אסטרטגיה — VWAP Reclaim. לוחצים Backtest. המערכת רצה אותה על 15 שנות מסחר אמיתי, עם עמלות, עם ספרד, עם הכל. ותראו את התוצאה — שישים ושבע אחוז הצלחה, פי-אנד-אל חיובי, מקסימום דרואדאון שמונה עשרה אחוז. זה מספר רציני. לא ניחוש. ורק אחרי שהאסטרטגיה עוברת בדיקה כזאת — היא עוברת לשלב הבא.",
    mockup: <MockBacktest wr={67} pnl={42} dd={18} />,
    durationMs: 15000,
  },
  {
    id: "livelab-left",
    title: "Live Lab — עמודה שמאל",
    icon: "🎯",
    section: "Live Lab › אסטרטגיות",
    bg: "from-[#EF4444] via-[#DC2626] to-[#991B1B]",
    text: "עכשיו נכנסים ל-Live Lab. זה הלב של הפלטפורמה. תראו שלוש עמודות — בואו נתחיל עם הצד השמאלי. כאן יושבות האסטרטגיות שלי. לכל אחת יש toggle — לוחצים, היא חיה. רואים פה VWAP Reclaim — שבעים ואחד אחוז הצלחה, פלוס שלוש מאות ארבעים ושבע דולר מצטבר. זה נתון אמיתי מהמסחר על ניייר שרץ ברקע. בחינם — שלוש אסטרטגיות. ב-Starter בשישים ותשע שקל — עד חמש עשרה.",
    mockup: (
      <div className="space-y-1.5">
        <MockStrategyCard name="VWAP Reclaim" wr={71} pnl={347} active />
        <MockStrategyCard name="Gap and Go" wr={64} pnl={182} active />
        <MockStrategyCard name="HOD Breakout" wr={58} pnl={91} active />
        <div className="rounded-lg border border-white/10 border-dashed px-3 py-1.5 text-center text-[9px] text-white/30">+ Starter: 15 אסטרטגיות</div>
      </div>
    ),
    durationMs: 15000,
  },
  {
    id: "livelab-center",
    title: "Live Lab — עמודה אמצע",
    icon: "🔴",
    section: "Live Lab › סיגנלים",
    bg: "from-[#F59E0B] via-[#D97706] to-[#92400E]",
    text: "עוברים לעמודה האמצעית — הפיד החי. כאן נכנסת כל מניה שהסורק מזהה. תראו — FFIE. Float שלושה מיליון — רואים בכתום עם האש? זה אומר מניה קטנה שיכולה לעשות עשרים שלושים אחוז מהר מאוד. RVOL פי שתיים עשרה מהנפח הממוצע — זה ענק. הסורק נכנס ב-0.94, יעד ב-1.10, סטופ ב-0.87. ועסקאות שעדיין פתוחות מציגות כאן רווח לא סגור בזמן אמת — בירוק.",
    mockup: (
      <div className="space-y-1.5">
        <MockSignalCard ticker="FFIE" entry={0.94} float={3.1} rvol={12} gain={17.2} />
        <MockSignalCard ticker="MULN" entry={1.12} float={8.4} rvol={7} />
      </div>
    ),
    durationMs: 16000,
  },
  {
    id: "livelab-right",
    title: "Live Lab — עמודה ימין",
    icon: "🧠",
    section: "Live Lab › ניתוח AI",
    bg: "from-[#8B5CF6] via-[#7C3AED] to-[#5B21B6]",
    text: "ועמודה ימינית — זה הניתוח של ה-AI. תראו, ה-Optimizer בדק את כל העסקאות שלי ומצא שבין ארבע לחמש אחר הצהריים שעון ישראל — Win Rate שבעים ושלושה אחוז. זה לא מקרי. זה הזמן שהשוק האמריקאי עבר שעה ורואים נפח שניוני חזק. הוא מציע: הגבל כניסות לשעה הזאת. שיפור מוכח, לא ניחוש. הוא רץ כל שבוע ובודק מחדש.",
    mockup: <MockPerformance />,
    durationMs: 15000,
  },
  {
    id: "scanner",
    title: "הסורק — WebSocket",
    icon: "⚡",
    section: "סורק פנימי",
    bg: "from-[#22C55E] via-[#16A34A] to-[#14532D]",
    text: "אבל מי בכלל מוצא את המניות? הסורק הפנימי. הוא מחובר ל-Polygon.io דרך WebSocket ומקבל עדכון כל שנייה — לא כל חמש דקות — כל שנייה. ורץ על השרת, לא על המחשב שלך. אפשר לסגור את הדפדפן, הוא ממשיך. מאתיים מניות במקביל. מניה עולה מעל עשרה אחוז, RVOL מעל שש, Float מתחת לעשרה מיליון — מזהה תוך שנייה ומכניס עסקה על ניייר אוטומטית.",
    mockup: <MockScanner />,
    durationMs: 16000,
  },
  {
    id: "course",
    title: "קורס AI — אישי לך",
    icon: "🎓",
    section: "קורס AI",
    bg: "from-[#6366F1] via-[#4F46E5] to-[#3730A3]",
    text: "ועכשיו הדבר שהכי גאה בו. כשאסטרטגיה עושה לפחות עשרים עסקאות ועומדת מעל חמישים וחמש אחוז הצלחה — מופיע כפתור: בנה קורס AI. לוחצים — ואני בונה קורס מסחר שמותאם לחשבון שלך ספציפית. לא קורס גנרי מיוטיוב. הקורס אומר לך: בשעה 16:00 ב-VWAP Reclaim, בחשבון שלך, ההצלחה היא 68 אחוז — זה למה. שישה מודולים, שאלות, וצ'קליסט לפני כל עסקה.",
    mockup: <MockCourse />,
    durationMs: 16000,
  },
  {
    id: "cta",
    title: "בוא נתחיל 🚀",
    icon: "🚀",
    section: "סיכום",
    bg: "from-[#F59E0B] via-[#EF4444] to-[#8B5CF6]",
    text: "אז מה עושים? פשוט מאוד. שלוש אסטרטגיות ראשונות — חינם. אין כרטיס אשראי, אין טריק. נכנסים לסאנדבוקס, בוחרים אסטרטגיה, מריצים בדיקה. אם היא עוברת — שולחים אותה ל-Live Lab. אחרי חודשיים של נתונים — בונים קורס. מי שרוצה יותר אסטרטגיות — Starter בשישים ותשע שקל בחודש. ומי שרוצה ללא הגבלה — Pro, מאה ארבעים ותשע. אני ממתינה לך בפנים. יאלה!",
    mockup: (
      <div className="space-y-1.5 text-[10px]">
        {[
          { t: "Free", p: "₪0", f: "3 אסטרטגיות + Sandbox", c: "bg-white/10 border-white/20" },
          { t: "Starter", p: "₪59/חודש", f: "15 אסטרטגיות + קורסים AI", c: "bg-[#6366F1]/20 border-[#6366F1]/40" },
          { t: "Pro", p: "₪149/חודש", f: "ללא הגבלה + ברוקר חי", c: "bg-[#F59E0B]/20 border-[#F59E0B]/40" },
        ].map(r => (
          <div key={r.t} className={cn("rounded-lg border px-3 py-2 flex justify-between items-center", r.c)}>
            <div>
              <div className="font-bold text-white">{r.t}</div>
              <div className="text-white/50 text-[9px]">{r.f}</div>
            </div>
            <div className="font-bold text-white">{r.p}</div>
          </div>
        ))}
      </div>
    ),
    durationMs: 16000,
  },
];

// Highlighted "location" breadcrumb showing where we are in the app
function SectionBadge({ section }: { section: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-black/30 border border-white/20 px-3 py-1 text-[10px] text-white/70 backdrop-blur-sm">
      <div className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
      {section}
    </div>
  );
}

function PennyGuide() {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [chapterIdx, setChapterIdx] = useState(0);
  const [innerProgress, setInnerProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressBaseRef = useRef<number>(0);

  const stopAll = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startChapterTimer = useCallback((idx: number, fromPct = 0) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const ch = CHAPTERS[idx];
    const remaining = ch.durationMs * (1 - fromPct / 100);
    startTimeRef.current = Date.now();
    progressBaseRef.current = fromPct;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, progressBaseRef.current + (elapsed / remaining) * (100 - progressBaseRef.current));
      setInnerProgress(pct);
      if (pct >= 100 && timerRef.current) clearInterval(timerRef.current);
    }, 80);
  }, []);

  const startChapter = useCallback((idx: number) => {
    if (idx >= CHAPTERS.length) {
      setState("done");
      if (timerRef.current) clearInterval(timerRef.current);
      setInnerProgress(100);
      return;
    }

    const ch = CHAPTERS[idx];
    setChapterIdx(idx);
    setInnerProgress(0);
    startChapterTimer(idx, 0);

    if (!muted && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(ch.text);
      utt.lang = "he-IL";
      utt.rate = 0.92;
      utt.pitch = 1.05;
      utt.volume = 1;

      const trySpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const heVoice =
          voices.find(v => v.lang === "he-IL" && v.name.toLowerCase().includes("google")) ||
          voices.find(v => v.lang === "he-IL") ||
          voices.find(v => v.lang.startsWith("he"));
        if (heVoice) utt.voice = heVoice;
        utt.onend = () => startChapter(idx + 1);
        utt.onerror = () => { if (timerRef.current) clearInterval(timerRef.current); setTimeout(() => startChapter(idx + 1), 500); };
        utteranceRef.current = utt;
        window.speechSynthesis.speak(utt);
      };

      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener("voiceschanged", trySpeak, { once: true });
      } else {
        trySpeak();
      }
    } else {
      setTimeout(() => startChapter(idx + 1), ch.durationMs);
    }
  }, [muted, startChapterTimer]);

  const play = useCallback(() => {
    setState("playing");
    startChapter(0);
  }, [startChapter]);

  const jumpTo = useCallback((idx: number) => {
    if (state === "idle" || state === "done") setState("playing");
    stopAll();
    startChapter(idx);
  }, [state, stopAll, startChapter]);

  const pause = useCallback(() => {
    if (state === "playing") {
      setState("paused");
      window.speechSynthesis?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (state === "paused") {
      setState("playing");
      window.speechSynthesis?.resume();
      startChapterTimer(chapterIdx, innerProgress);
    }
  }, [state, chapterIdx, innerProgress, startChapterTimer]);

  const stop = useCallback(() => {
    stopAll();
    setState("idle");
    setChapterIdx(0);
    setInnerProgress(0);
  }, [stopAll]);

  const skipNext = useCallback(() => {
    stopAll();
    const next = chapterIdx + 1;
    if (next >= CHAPTERS.length) { setState("done"); return; }
    startChapter(next);
  }, [chapterIdx, stopAll, startChapter]);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  const ch = CHAPTERS[chapterIdx];
  const totalProgress = ((chapterIdx + innerProgress / 100) / CHAPTERS.length) * 100;
  const isActive = state === "playing" || state === "paused";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ aspectRatio: "16/9" }}>
      {/* Background gradient — transitions between chapters */}
      <div className={cn("absolute inset-0 bg-gradient-to-br transition-all duration-1000", ch.bg)} />
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div className="relative h-full flex">

        {/* Left panel — narration / idle / done */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">

          {/* Penny avatar */}
          <div className="relative mb-4">
            <div className={cn(
              "h-16 w-16 rounded-full border-4 border-white/30 bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl shadow-xl",
              state === "playing" && "ring-2 ring-[#10B981]/60 ring-offset-2 ring-offset-transparent"
            )}>
              🤖
            </div>
            {state === "playing" && (
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#10B981] border-2 border-black flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
              </div>
            )}
            <div className="absolute -top-1 -left-1 rounded-full bg-[#6366F1] border-2 border-black px-2 py-0.5">
              <span className="text-[9px] font-bold text-white">פני</span>
            </div>
          </div>

          {/* Idle */}
          {state === "idle" && (
            <>
              <h2 className="text-xl font-bold text-white mb-1">היי! אני פני 👋</h2>
              <p className="text-white/65 text-xs mb-1 max-w-xs leading-relaxed">
                אראה לך איך כל חלק ב-PennyAI עובד —<br />בקול, בעברית, כאילו אנחנו יושבים ביחד.
              </p>
              <p className="text-white/35 text-[10px] mb-4">2 דקות · 8 פרקים · עברית</p>
              <button
                onClick={play}
                className="flex items-center gap-2 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-6 py-3 text-white font-bold text-sm transition-all hover:scale-105 shadow-lg"
              >
                <div className="h-8 w-8 rounded-full bg-white/25 flex items-center justify-center">
                  <Play className="h-4 w-4 text-white" fill="white" />
                </div>
                הפעל מדריך קולי
              </button>
              <p className="mt-3 text-white/25 text-[10px]">רמקולים מופעלים · Chrome מומלץ</p>
            </>
          )}

          {/* Done */}
          {state === "done" && (
            <>
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-lg font-bold text-white mb-1">סיימנו!</h2>
              <p className="text-white/65 text-xs mb-4">עכשיו אתה יודע הכל. מוכן להתחיל?</p>
              <div className="flex gap-2">
                <a href="/live-lab" className="rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 px-4 py-2 text-xs font-bold text-white transition-all">
                  → Live Lab
                </a>
                <button onClick={play} className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 text-xs text-white/60 transition-all">
                  צפה שוב
                </button>
              </div>
            </>
          )}

          {/* Playing / Paused */}
          {isActive && (
            <>
              <SectionBadge section={ch.section} />
              <div className="text-3xl mt-2 mb-1">{ch.icon}</div>
              <h2 className="text-base font-bold text-white mb-0.5">{ch.title}</h2>
              {state === "paused" && (
                <div className="rounded-full bg-white/15 border border-white/20 px-3 py-0.5 text-[10px] text-white/50 mt-1">
                  ⏸ מושהה
                </div>
              )}
            </>
          )}
        </div>

        {/* Right panel — mockup (only when active) */}
        {isActive && (
          <div className="w-52 shrink-0 flex flex-col justify-center pr-5 pl-2">
            <div className="rounded-xl border border-white/15 bg-black/35 backdrop-blur-sm p-3 shadow-xl">
              <div className="text-[9px] text-white/30 mb-2 font-medium uppercase tracking-wide">תצוגה חיה</div>
              {ch.mockup}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {(isActive || state === "done") && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-8">
          {/* Chapter dots — clickable */}
          <div className="flex gap-1 mb-2 justify-center">
            {CHAPTERS.map((c, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                title={c.title}
                className={cn(
                  "h-1 rounded-full transition-all duration-500 overflow-hidden relative",
                  i < chapterIdx ? "w-5 bg-white/50" : i === chapterIdx ? "w-7 bg-white/20" : "w-2.5 bg-white/15",
                  "hover:opacity-80"
                )}
              >
                {i === chapterIdx && (
                  <div className="absolute inset-y-0 left-0 bg-white rounded-full transition-all" style={{ width: `${innerProgress}%` }} />
                )}
                {i < chapterIdx && <div className="absolute inset-0 bg-white/60" />}
              </button>
            ))}
          </div>

          {/* Overall progress */}
          <div className="h-px w-full rounded-full bg-white/10 mb-2 overflow-hidden">
            <div className="h-px bg-white/50 rounded-full transition-all duration-300" style={{ width: `${totalProgress}%` }} />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={pause} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-all">
              {state === "paused" ? <Play className="h-3.5 w-3.5" fill="white" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button onClick={skipNext} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 transition-all">
              <SkipForward className="h-3 w-3" />
            </button>
            <button onClick={stop} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 transition-all">
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
            <div className="flex-1 text-center">
              <span className="text-white/45 text-[10px]">{chapterIdx + 1}/{CHAPTERS.length} · {ch.title}</span>
            </div>
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (next) window.speechSynthesis?.cancel();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 transition-all"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Courses data ─────────────────────────────────────────────────────────────

interface Course {
  id: string;
  title: string;
  description: string;
  lessons: number;
  duration: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  rating: number;
  thumbnailGradient: string;
  locked: boolean;
  modules: { title: string; duration: string; locked: boolean }[];
}

const COURSES: Course[] = [
  {
    id: "c1",
    title: "Penny Stock Fundamentals",
    description: "Master the core concepts: catalysts, float theory, tape reading, and Level 2 interpretation.",
    lessons: 12,
    duration: "4h 20m",
    level: "Beginner",
    rating: 4.9,
    thumbnailGradient: "from-[#6366F1] to-[#8B5CF6]",
    locked: false,
    modules: [
      { title: "What Makes a Penny Stock Move?", duration: "22min", locked: false },
      { title: "Understanding Float & Short Interest", duration: "31min", locked: false },
      { title: "Reading the Level 2 Order Book", duration: "45min", locked: false },
      { title: "Tape Reading Fundamentals", duration: "38min", locked: true },
      { title: "Catalyst-Based Trading Framework", duration: "29min", locked: true },
    ],
  },
  {
    id: "c2",
    title: "VWAP Strategies Deep Dive",
    description: "A complete course on VWAP-based entries, hold levels, and the reclaim pattern with real trade examples.",
    lessons: 9,
    duration: "3h 15m",
    level: "Intermediate",
    rating: 4.8,
    thumbnailGradient: "from-[#10B981] to-[#059669]",
    locked: false,
    modules: [
      { title: "VWAP Calculation & Logic", duration: "18min", locked: false },
      { title: "First VWAP Cross Setup", duration: "42min", locked: false },
      { title: "VWAP Hold & Reclaim Pattern", duration: "55min", locked: true },
      { title: "Live Trade Replay: 5 Verified Setups", duration: "68min", locked: true },
    ],
  },
  {
    id: "c3",
    title: "Advanced Backtesting & Strategy Building",
    description: "Learn to design, validate, and iterate backtests. Avoid overfitting. Build strategies that survive live markets.",
    lessons: 15,
    duration: "6h 40m",
    level: "Advanced",
    rating: 4.9,
    thumbnailGradient: "from-[#F59E0B] to-[#EF4444]",
    locked: true,
    modules: [
      { title: "Why Most Backtests Lie", duration: "25min", locked: true },
      { title: "Slippage Reality in Penny Stocks", duration: "33min", locked: true },
      { title: "Vectorized vs Event-Driven Engines", duration: "41min", locked: true },
      { title: "Walk-Forward Optimization", duration: "52min", locked: true },
    ],
  },
];

const LEVEL_COLORS: Record<string, "muted" | "brand" | "violet" | "green"> = {
  Beginner: "green",
  Intermediate: "brand",
  Advanced: "violet",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AcademyPage() {
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);

  if (activeCourse && activeLesson) {
    return <VideoPlayer course={activeCourse} lessonTitle={activeLesson} onBack={() => setActiveLesson(null)} />;
  }
  if (activeCourse) {
    return <CourseDetail course={activeCourse} onBack={() => setActiveCourse(null)} onPlayLesson={setActiveLesson} />;
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">

      {/* ── Penny Guide ── */}
      <div className="relative border-b border-[#1E293B] bg-[#0D1117]">
        <div className="mx-auto max-w-screen-lg px-6 py-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-4 py-1.5 mb-3">
              <span className="text-lg">🤖</span>
              <span className="text-xs font-semibold text-[#A5B4FC]">פני — המדריכה האישית שלך</span>
            </div>
            <h1 className="text-2xl font-bold text-[#F8FAFC] mb-1">
              מדריך קולי אישי — הכר את PennyAI
            </h1>
            <p className="text-[#64748B] text-sm">
              פני מסבירה איך כל חלק עובד · בעברית · עם קול · 2 דקות
            </p>
          </div>

          <PennyGuide />

          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { icon: "⚡", value: "שנייה 1", label: "זמן גילוי מניה" },
              { icon: "📊", value: "15 שנה",  label: "נתוני באקטסט" },
              { icon: "🧠", value: "AI שבועי", label: "AI Optimizer" },
              { icon: "🎓", value: "6 מודולים", label: "בכל קורס AI" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-[#1E293B] bg-[#0F1520] p-3 text-center">
                <div className="text-lg mb-0.5">{s.icon}</div>
                <p className="text-sm font-bold text-[#F8FAFC]">{s.value}</p>
                <p className="text-[9px] text-[#64748B]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Academy courses ── */}
      <div className="relative border-b border-[#1E293B] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/10 to-transparent" />
        <div className="relative mx-auto max-w-screen-xl px-6 py-10">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-[#8B5CF6]" />
            <Badge variant="violet">PennyAI Academy</Badge>
          </div>
          <h2 className="text-3xl font-bold text-[#F8FAFC] leading-tight max-w-xl">
            קורסים מקצועיים{" "}
            <span className="gradient-text">מאפס לעקביות</span>
          </h2>
          <p className="mt-3 text-[#94A3B8] text-sm max-w-lg leading-relaxed">
            קורסים מבוססי וידאו עם עסקאות אמיתיות מהבאקטסט, ניתוח Level 2, ודוגמאות חיות.
          </p>
          <div className="mt-6 flex items-center gap-6 text-sm">
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">3</strong> קורסים</span>
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">36</strong> שיעורים</span>
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">14+ שעות</strong> תוכן</span>
          </div>
        </div>
      </div>

      {/* Courses grid */}
      <div className="mx-auto max-w-screen-xl px-6 py-10 space-y-6">
        {COURSES.map((course) => (
          <div key={course.id} className="glass-card overflow-hidden">
            <div className="flex gap-0">
              <div className={cn("relative w-64 shrink-0 bg-gradient-to-br flex-col flex items-center justify-center", course.thumbnailGradient)}>
                <div className="absolute inset-0 bg-black/25" />
                {course.locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Lock className="h-8 w-8 text-white/70" />
                  </div>
                )}
                {!course.locked && (
                  <button onClick={() => setActiveCourse(course)} className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30">
                      <Play className="h-5 w-5 text-white" fill="white" />
                    </div>
                  </button>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant={LEVEL_COLORS[course.level]}>{course.level}</Badge>
                        {course.locked && <Badge variant="muted"><Lock className="h-2.5 w-2.5 mr-1" />Elite Only</Badge>}
                      </div>
                      <h2 className="text-base font-bold text-[#F8FAFC]">{course.title}</h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Star className="h-3.5 w-3.5 text-[#F59E0B] fill-[#F59E0B]" />
                      <span className="text-sm font-semibold text-[#F8FAFC]">{course.rating}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed max-w-lg">{course.description}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4 text-xs text-[#64748B]">
                    <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{course.lessons} lessons</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{course.duration}</span>
                  </div>
                  <Button variant={course.locked ? "secondary" : "primary"} size="sm" onClick={() => !course.locked && setActiveCourse(course)} disabled={course.locked} className="gap-1.5">
                    {course.locked ? <><Lock className="h-3.5 w-3.5" />Unlock</> : <><Play className="h-3.5 w-3.5" />Start Course</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-[#6366F1]/5 p-8 text-center">
          <Crown className="mx-auto h-10 w-10 text-[#8B5CF6] mb-3" />
          <h2 className="text-xl font-bold text-[#F8FAFC]">פתח את כל הקורסים ואת ה-Vault</h2>
          <p className="mt-2 text-sm text-[#94A3B8] max-w-md mx-auto">
            מנוי Elite נותן גישה מלאה לאקדמיה, 6 אסטרטגיות מוכחות, ובאקטסט ללא הגבלה עם נתוני 5 שנים.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="primary" size="lg"><Crown className="h-4 w-4" />שדרג ל-Elite — ₪149/חודש</Button>
            <span className="text-sm text-[#64748B]">או ₪1,200/שנה (חיסכון 33%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CourseDetail({ course, onBack, onPlayLesson }: { course: Course; onBack: () => void; onPlayLesson: (t: string) => void }) {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      <div className="mx-auto max-w-screen-lg px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] mb-6 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" /> חזרה לאקדמיה
        </button>
        <div className="glass-card p-6 mb-6">
          <Badge variant={LEVEL_COLORS[course.level]}>{course.level}</Badge>
          <h1 className="mt-2 text-2xl font-bold text-[#F8FAFC]">{course.title}</h1>
          <p className="mt-2 text-[#94A3B8] text-sm">{course.description}</p>
        </div>
        <div className="space-y-2">
          {course.modules.map((module, i) => (
            <div key={i} className={cn("glass-card flex items-center justify-between px-4 py-3 transition-all", !module.locked && "cursor-pointer hover:border-[#263147]")} onClick={() => !module.locked && onPlayLesson(module.title)}>
              <div className="flex items-center gap-3">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", module.locked ? "bg-[#1E293B] text-[#64748B]" : "bg-[#6366F1]/20 text-[#6366F1]")}>
                  {module.locked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={cn("text-sm font-medium", module.locked ? "text-[#64748B]" : "text-[#F8FAFC]")}>{module.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#64748B]">{module.duration}</span>
                {!module.locked && <Play className="h-3.5 w-3.5 text-[#6366F1]" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoPlayer({ course, lessonTitle, onBack }: { course: Course; lessonTitle: string; onBack: () => void }) {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      <div className="mx-auto max-w-screen-xl px-6 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" /> חזרה ל-{course.title}
        </button>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <div className={cn("aspect-video rounded-xl bg-gradient-to-br flex items-center justify-center relative overflow-hidden", course.thumbnailGradient)}>
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative flex flex-col items-center gap-3 text-center px-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30">
                  <Play className="h-7 w-7 text-white" fill="white" />
                </div>
                <p className="text-white font-semibold">{lessonTitle}</p>
                <p className="text-white/60 text-sm">Video content available with Elite subscription</p>
              </div>
            </div>
            <div className="glass-card p-5">
              <h2 className="text-base font-bold text-[#F8FAFC]">{lessonTitle}</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">This lesson covers the key concepts from the {course.title} curriculum.</p>
            </div>
          </div>
          <div className="glass-card p-4 self-start">
            <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Course Modules</h3>
            <div className="space-y-1">
              {course.modules.map((m, i) => (
                <div key={i} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all", m.title === lessonTitle ? "bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20" : m.locked ? "text-[#64748B] cursor-not-allowed" : "text-[#94A3B8] hover:bg-[#131A26] cursor-pointer")}>
                  {m.locked ? <Lock className="h-3 w-3 shrink-0" /> : <Play className="h-3 w-3 shrink-0" />}
                  <span className="flex-1 truncate">{m.title}</span>
                  <span className="text-[#64748B] shrink-0">{m.duration}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
