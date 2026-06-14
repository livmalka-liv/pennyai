"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Lock, BookOpen, Clock, Star, ChevronRight, Crown, Pause, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

// ─── Penny — Personal AI Guide ────────────────────────────────────────────────

interface Chapter {
  id: string;
  text: string;        // spoken Hebrew narration
  title: string;       // visual title
  icon: string;
  bg: string;          // gradient
  bullets: string[];   // visual bullet points shown on screen
  durationMs: number;  // approx speech duration
}

const CHAPTERS: Chapter[] = [
  {
    id: "intro",
    title: "ברוכים הבאים ל-PennyAI",
    icon: "👋",
    bg: "from-[#6366F1] via-[#7C3AED] to-[#8B5CF6]",
    text: "שלום! אני פני, העוזרת האישית שלך ב-PennyAI. בוא אראה לך בדיוק איך הפלטפורמה עובדת ואיך היא יכולה לשנות את המסחר שלך לנצח.",
    bullets: [
      "🤖 AI שלומד מהנתונים האישיים שלך",
      "⚡ סריקה בזמן אמת — כל שנייה",
      "📈 מחושב ומדויק — לא ניחושים",
    ],
    durationMs: 8500,
  },
  {
    id: "sandbox",
    title: "שלב 1 — Sandbox: הבאקטסט",
    icon: "📊",
    bg: "from-[#10B981] via-[#059669] to-[#047857]",
    text: "לפני שמסכנים שקל אחד, ה-Sandbox מאפשר לך לבדוק כל אסטרטגיה על 15 שנות נתונים היסטוריים. תראה בדיוק מה היה קורה אם היית מסחר עם האסטרטגיה הזאת בכל תקופה. כולל עלויות מסחר אמיתיות, ספרד, ועמלות.",
    bullets: [
      "📅 15 שנות נתונים היסטוריים",
      "💰 עלויות מסחר אמיתיות כלולות",
      "📉 Win Rate, Max Drawdown, P&L",
    ],
    durationMs: 12000,
  },
  {
    id: "livelab-left",
    title: "Live Lab — עמודה שמאל: אסטרטגיות",
    icon: "🎯",
    bg: "from-[#EF4444] via-[#DC2626] to-[#B91C1C]",
    text: "ה-Live Lab הוא הלב של הפלטפורמה. בעמודה השמאלית תמצא את האסטרטגיות שלך. אתה בוחר איזו לבדוק, מפעיל וכיבוי בקליק. החבילה החינמית מאפשרת שלוש אסטרטגיות בו-זמנית. ואתה רואה בזמן אמת אחוז ההצלחה ורווח מצטבר של כל אחת.",
    bullets: [
      "3 אסטרטגיות חינמיות, עד 15 ב-Starter",
      "toggle פשוט להפעלה וכיבוי",
      "Win Rate ו-P&L בזמן אמת לכל אסטרטגיה",
    ],
    durationMs: 12000,
  },
  {
    id: "livelab-center",
    title: "Live Lab — עמודה מרכז: סיגנלים",
    icon: "🔴",
    bg: "from-[#F59E0B] via-[#D97706] to-[#B45309]",
    text: "העמודה האמצעית היא פיד הסיגנלים החי. כל מניה שהסורק מזהה מופיעה כאן תוך שנייה. תראה את הטיקר, מחיר הכניסה, יעד הרווח, סטופ לוס, ה-Float של המניה, ה-RVOL. ועסקאות פתוחות מראות רווח והפסד לא סגור בזמן אמת.",
    bullets: [
      "Float מתחת ל-5 מיליון — כתום עם 🔥",
      "RVOL מעל 10 — כתום מודגש",
      "רווח/הפסד לא סגור לעסקות פתוחות",
    ],
    durationMs: 13000,
  },
  {
    id: "livelab-right",
    title: "Live Lab — עמודה ימין: ניתוח AI",
    icon: "🧠",
    bg: "from-[#8B5CF6] via-[#7C3AED] to-[#6D28D9]",
    text: "בעמודה הימנית יש ניתוח מצטבר של כל הביצועים שלך. אחוז הצלחה כולל, P&L, שעות הכי טובות, ודירוג האסטרטגיות. ה-AI Optimizer בודק כל שבוע אם יש משתנה שמשפר את אחוז ההצלחה שלך — שעה ספציפית, טווח מחיר, RVOL מינימלי. הוא מציע שינויים רק כשיש שיפור מוכח.",
    bullets: [
      "דירוג אסטרטגיות לפי ביצועים",
      "שעות הכי רווחיות בחשבון שלך",
      "AI Optimizer — שיפור אוטומטי שבועי",
    ],
    durationMs: 14000,
  },
  {
    id: "scanner",
    title: "הסורק — WebSocket כל שנייה",
    icon: "⚡",
    bg: "from-[#22C55E] via-[#16A34A] to-[#15803D]",
    text: "הסורק מחובר ל-Polygon.io דרך WebSocket ומקבל עדכון על כל המניות כל שנייה. הוא לא תלוי בכך שהמסך פתוח — הוא רץ על השרת 24 שעות ביממה, שבעה ימים בשבוע. מניה עולה יותר מ-10 אחוז עם נפח חריג ו-Float נמוך? הסורק מזהה אותה ומכניס עסקת ניייר תוך שנייה אחת.",
    bullets: [
      "שרת עצמאי — רץ גם כשהמסך סגור",
      "200 מניות בו-זמנית — מקבילות",
      "גילוי תוך שנייה 1 מרגע הפיצוץ",
    ],
    durationMs: 13000,
  },
  {
    id: "course",
    title: "קורס AI — מותאם אישית לך",
    icon: "🎓",
    bg: "from-[#6366F1] via-[#4F46E5] to-[#4338CA]",
    text: "אחרי שאסטרטגיה מוכיחה את עצמה, לוחצים על בנה קורס AI ואני בונה לך קורס מסחר מותאם אישית. לא קורס גנרי מיוטיוב. הקורס אומר לך: בחשבון שלך, בין 16:00 ל-17:00 שעון ישראל אחוז ההצלחה הוא 68 אחוז. זה למה. הקורס כולל שישה מודולים, שאלות בדיקה, וצ'קליסט לפני כל עסקה.",
    bullets: [
      "מבוסס הנתונים האמיתיים שלך",
      "6 מודולים + שאלות + צ'קליסט",
      "מתעדכן אוטומטית עם נתונים חדשים",
    ],
    durationMs: 13000,
  },
  {
    id: "cta",
    title: "התחל היום — חינם",
    icon: "🚀",
    bg: "from-[#F59E0B] via-[#EF4444] to-[#8B5CF6]",
    text: "PennyAI היא הפלטפורמה היחידה שמשלבת בדיקה היסטורית, סריקה חיה בזמן אמת, AI שמשתפר, וקורסים מותאמים אישית. שלוש אסטרטגיות ראשונות — חינם לגמרי. מוכן לשנות את המסחר שלך? בוא נתחיל.",
    bullets: [
      "✅ Free: 3 אסטרטגיות + Sandbox + Live Lab",
      "✅ Starter ₪59/חודש: עד 15 + AI קורסים",
      "✅ Pro ₪149/חודש: ללא הגבלה + ברוקר חי",
    ],
    durationMs: 11000,
  },
];

function PennyGuide() {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [chapterIdx, setChapterIdx] = useState(0);
  const [innerProgress, setInnerProgress] = useState(0); // 0-100 within chapter
  const [muted, setMuted] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopAll = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startChapter = useCallback((idx: number) => {
    if (idx >= CHAPTERS.length) {
      setState("done");
      setChapterIdx(0);
      setInnerProgress(0);
      return;
    }

    const ch = CHAPTERS[idx];
    setChapterIdx(idx);
    setInnerProgress(0);
    startTimeRef.current = Date.now();

    // Start visual progress timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / ch.durationMs) * 100);
      setInnerProgress(pct);
      if (pct >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 80);

    // TTS
    if (!muted && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(ch.text);
      utt.lang = "he-IL";
      utt.rate = 0.95;
      utt.pitch = 1.05;

      // Try to pick a natural Hebrew voice
      const voices = window.speechSynthesis.getVoices();
      const heVoice =
        voices.find(v => v.lang === "he-IL" && v.name.toLowerCase().includes("google")) ||
        voices.find(v => v.lang === "he-IL") ||
        voices.find(v => v.lang.startsWith("he"));
      if (heVoice) utt.voice = heVoice;

      utt.onend = () => startChapter(idx + 1);
      utteranceRef.current = utt;
      window.speechSynthesis.speak(utt);
    } else {
      // No TTS: advance by timer
      setTimeout(() => startChapter(idx + 1), ch.durationMs);
    }
  }, [muted]);

  const play = () => {
    setState("playing");
    startChapter(0);
  };

  const pause = () => {
    if (state === "playing") {
      setState("paused");
      window.speechSynthesis?.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (state === "paused") {
      setState("playing");
      window.speechSynthesis?.resume();
      startTimeRef.current = Date.now() - (innerProgress / 100 * CHAPTERS[chapterIdx].durationMs);
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const pct = Math.min(100, (elapsed / CHAPTERS[chapterIdx].durationMs) * 100);
        setInnerProgress(pct);
        if (pct >= 100 && timerRef.current) clearInterval(timerRef.current);
      }, 80);
    }
  };

  const stop = () => {
    stopAll();
    setState("idle");
    setChapterIdx(0);
    setInnerProgress(0);
  };

  // Cleanup
  useEffect(() => () => stopAll(), [stopAll]);

  // Reload voices on mount
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
    }
  }, []);

  const ch = CHAPTERS[chapterIdx];
  const totalProgress = ((chapterIdx + innerProgress / 100) / CHAPTERS.length) * 100;
  const isActive = state === "playing" || state === "paused";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ aspectRatio: "16/9" }}>
      {/* Background */}
      <div className={cn("absolute inset-0 bg-gradient-to-br transition-all duration-1000", ch.bg)} />
      <div className="absolute inset-0 bg-black/45" />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center px-8 text-center">

        {/* Penny avatar */}
        <div className={cn(
          "relative mb-5",
          isActive && state === "playing" && "animate-pulse"
        )}>
          <div className="h-20 w-20 rounded-full border-4 border-white/30 bg-white/15 backdrop-blur-sm flex items-center justify-center text-4xl shadow-xl">
            🤖
          </div>
          {state === "playing" && (
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[#10B981] border-2 border-black flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-white animate-ping" />
            </div>
          )}
          <div className="absolute -top-1 -left-1 rounded-full bg-[#6366F1] border-2 border-black px-2 py-0.5">
            <span className="text-[10px] font-bold text-white">פני</span>
          </div>
        </div>

        {/* Idle state */}
        {state === "idle" && (
          <>
            <h2 className="text-2xl font-bold text-white mb-1">היי! אני פני 👋</h2>
            <p className="text-white/70 text-sm mb-2 max-w-md">
              העוזרת האישית שלך ב-PennyAI.<br />
              אסביר לך איך כל חלק בפלטפורמה עובד — בקול, בעברית.
            </p>
            <p className="text-white/40 text-xs mb-6">כ-2 דקות · 8 פרקים · עברית</p>
            <button
              onClick={play}
              className="flex items-center gap-3 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-7 py-3.5 text-white font-bold text-base transition-all hover:scale-105 shadow-lg"
            >
              <div className="h-10 w-10 rounded-full bg-white/25 flex items-center justify-center">
                <Play className="h-5 w-5 text-white" fill="white" />
              </div>
              הפעל מדריך קולי
            </button>
            <p className="mt-4 text-white/30 text-xs">ודא שהרמקולים מופעלים · עברית · Chrome מומלץ</p>
          </>
        )}

        {/* Done state */}
        {state === "done" && (
          <>
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-white mb-2">סיימנו את הסיור!</h2>
            <p className="text-white/70 text-sm mb-5">עכשיו אתה יודע כל מה שצריך. מוכן להתחיל?</p>
            <div className="flex gap-3">
              <a href="/live-lab" className="rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 px-5 py-2.5 text-sm font-bold text-white transition-all">
                → Live Lab
              </a>
              <button onClick={play} className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-2.5 text-sm text-white/70 transition-all">
                צפה שוב
              </button>
            </div>
          </>
        )}

        {/* Playing / Paused state */}
        {isActive && (
          <>
            <div className="text-4xl mb-3">{ch.icon}</div>
            <h2 className="text-xl font-bold text-white mb-1">{ch.title}</h2>
            <ul className="space-y-1.5 mb-3">
              {ch.bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-white/85 justify-center">
                  <span className="h-1 w-1 rounded-full bg-white/60 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
            {state === "paused" && (
              <div className="rounded-full bg-white/15 border border-white/20 px-3 py-1 text-xs text-white/60 mb-2">
                ⏸ מושהה — לחץ להמשך
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom controls & progress (visible when active or done) */}
      {(isActive || state === "done") && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-10">
          {/* Chapter dots */}
          <div className="flex gap-1 mb-3 justify-center">
            {CHAPTERS.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all duration-500 overflow-hidden bg-white/20",
                  i < chapterIdx ? "w-6" : i === chapterIdx ? "w-8" : "w-3"
                )}
              >
                {i < chapterIdx && <div className="h-full w-full bg-white/70 rounded-full" />}
                {i === chapterIdx && (
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${innerProgress}%` }} />
                )}
              </div>
            ))}
          </div>

          {/* Overall progress bar */}
          <div className="h-0.5 w-full rounded-full bg-white/15 mb-3 overflow-hidden">
            <div className="h-0.5 bg-white/60 rounded-full transition-all duration-300" style={{ width: `${totalProgress}%` }} />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={pause}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-all"
            >
              {state === "paused" ? <Play className="h-4 w-4" fill="white" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              onClick={stop}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 transition-all"
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
            <div className="flex-1 text-center">
              <span className="text-white/60 text-xs">
                {chapterIdx + 1}/{CHAPTERS.length} · {ch.title}
              </span>
            </div>
            <button
              onClick={() => {
                setMuted(!muted);
                if (!muted) window.speechSynthesis?.cancel();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 transition-all"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
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

      {/* ── Penny Guide — top hero ── */}
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
              פני תסביר לך איך כל חלק בפלטפורמה עובד · בעברית · עם קול · 2 דקות
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

      {/* ── Academy courses hero ── */}
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
