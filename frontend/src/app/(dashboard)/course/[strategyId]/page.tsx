"use client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Brain, BookOpen, CheckCircle, XCircle, ChevronRight,
  ChevronDown, ChevronUp, Clock, Target, AlertTriangle,
  Award, BarChart2, Zap, RefreshCw, ArrowLeft, Lock,
  TrendingUp, TrendingDown, Star, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface Module {
  number: number;
  title: string;
  type: "theory" | "criteria" | "risk" | "psychology" | "live_data" | "action";
  duration_minutes: number;
  content: string;
  key_points: string[];
  quiz: QuizQuestion[];
}

interface CourseData {
  strategy_id: string;
  title: string;
  subtitle: string;
  duration_hours: number;
  difficulty: string;
  modules: Module[];
  checklist: string[];
  common_mistakes: string[];
  ai_insights: string;
  personal_stats: {
    total_trades: number;
    win_rate: number;
    total_pnl: number;
    days_tested: number;
    best_hour: string;
    best_price_range: string;
    avg_win_pct: number;
    avg_loss_pct: number;
  };
  generated_at: string;
  is_mock: boolean;
}

// ─── Module type config ───────────────────────────────────────────────────────

const MODULE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  theory:     { icon: <BookOpen className="h-4 w-4" />,    color: "#6366F1", label: "תיאוריה" },
  criteria:   { icon: <Target className="h-4 w-4" />,      color: "#10B981", label: "קריטריונים" },
  risk:       { icon: <AlertTriangle className="h-4 w-4" />, color: "#F59E0B", label: "ניהול סיכון" },
  psychology: { icon: <Brain className="h-4 w-4" />,       color: "#8B5CF6", label: "פסיכולוגיה" },
  live_data:  { icon: <BarChart2 className="h-4 w-4" />,   color: "#22C55E", label: "נתוני Live" },
  action:     { icon: <Play className="h-4 w-4" />,        color: "#EC4899", label: "תוכנית פעולה" },
};

// ─── Quiz component ───────────────────────────────────────────────────────────

function QuizCard({ q, index }: { q: QuizQuestion; index: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0B0E14] p-4 mt-4">
      <p className="text-sm font-semibold text-[#F8FAFC] mb-3">
        <span className="text-[#6366F1]">שאלה {index + 1}:</span> {q.question}
      </p>
      <div className="grid gap-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => !answered && setSelected(i)}
            className={cn(
              "rounded-lg px-4 py-2.5 text-sm text-right transition-all border",
              !answered
                ? "border-[#1E293B] bg-[#131A26] text-[#94A3B8] hover:border-[#6366F1]/40 hover:text-[#F8FAFC]"
                : i === q.correct
                ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981] font-semibold"
                : i === selected
                ? "border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]"
                : "border-[#1E293B] bg-[#0B0E14] text-[#475569]"
            )}
          >
            <span className="flex items-center gap-2">
              {answered && i === q.correct && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />}
              {answered && i === selected && i !== q.correct && <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
              {opt}
            </span>
          </button>
        ))}
      </div>
      {answered && (
        <div className={cn(
          "mt-3 rounded-lg px-3 py-2 text-xs",
          selected === q.correct ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#F59E0B]/10 text-[#F59E0B]"
        )}>
          {selected === q.correct ? "✅ נכון! " : "❌ לא נכון. "}{q.explanation}
        </div>
      )}
    </div>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod, moduleIndex, isActive, onToggle, onComplete, completed }:
  { mod: Module; moduleIndex: number; isActive: boolean; onToggle: () => void; onComplete: () => void; completed: boolean }
) {
  const meta = MODULE_META[mod.type] || MODULE_META.theory;

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      completed
        ? "border-[#10B981]/30 bg-[#10B981]/5"
        : isActive
        ? "border-[#6366F1]/40 bg-[#131A26]"
        : "border-[#1E293B] bg-[#0D1117]"
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-right"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
          {completed ? <CheckCircle className="h-4 w-4 text-[#10B981]" /> : <span className="text-xs font-bold">{mod.number}</span>}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#F8FAFC]">{mod.title}</p>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <p className="text-[10px] text-[#64748B] mt-0.5">{mod.duration_minutes} דקות</p>
        </div>
        <div className="flex-shrink-0 text-[#64748B]">
          {isActive ? <ChevronUp className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* Content */}
      {isActive && (
        <div className="px-5 pb-5 space-y-4">
          {/* Main content */}
          <div className="rounded-lg bg-[#0B0E14] border border-[#1E293B] p-4">
            <p className="text-sm text-[#94A3B8] leading-relaxed whitespace-pre-line">{mod.content}</p>
          </div>

          {/* Key points */}
          <div>
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">נקודות מפתח</p>
            <ul className="space-y-1.5">
              {mod.key_points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#6366F1]" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>

          {/* Quiz */}
          {mod.quiz?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">בדיקת הבנה</p>
              {mod.quiz.map((q, i) => <QuizCard key={i} q={q} index={i} />)}
            </div>
          )}

          {/* Complete button */}
          {!completed && (
            <button
              onClick={onComplete}
              className="w-full rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 py-2.5 text-sm font-semibold text-[#10B981] hover:bg-[#10B981]/25 transition-colors"
            >
              ✅ סיימתי מודול זה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoursePage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.strategyId as string;

  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ ready: boolean; reason: string; total_trades: number; win_rate: number } | null>(null);
  const [activeModule, setActiveModule] = useState<number | null>(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"modules" | "checklist" | "insights">("modules");

  // Load preview on mount
  useEffect(() => {
    fetch(`${API}/live-lab/course-preview/${strategyId}`)
      .then(r => r.json())
      .then(setPreview)
      .catch(() => {});
  }, [strategyId]);

  const generateCourse = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/live-lab/generate-course/${strategyId}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCourse(data);
      setActiveModule(0);
    } catch (e) {
      setError("שגיאה ביצירת הקורס. נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const completedCount = completed.size;
  const totalModules = course?.modules.length ?? 0;
  const progress = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#F8FAFC] p-6 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/live-lab")}
        className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#94A3B8] mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> חזור ל-Live Lab
      </button>

      {!course ? (
        /* ── Pre-generate screen ── */
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center py-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6366F1]/15 border border-[#6366F1]/30 mb-4">
              <Brain className="h-8 w-8 text-[#6366F1]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">בניית קורס מסחר AI</h1>
            <p className="text-[#64748B] text-sm">
              Claude יבנה קורס מקצועי מותאם אישית לאסטרטגיה שלך
            </p>
          </div>

          {/* Preview stats */}
          {preview && (
            <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4 text-[#6366F1]" />
                <p className="text-sm font-semibold text-[#94A3B8]">נתוני Live Lab לאסטרטגיה זו</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-[#131A26] p-3 text-center">
                  <p className="text-lg font-bold text-[#F8FAFC]">{preview.total_trades}</p>
                  <p className="text-[10px] text-[#64748B]">עסקאות</p>
                </div>
                <div className="rounded-lg bg-[#131A26] p-3 text-center">
                  <p className={cn("text-lg font-bold", preview.win_rate >= 55 ? "text-[#10B981]" : "text-[#F59E0B]")}>
                    {preview.win_rate}%
                  </p>
                  <p className="text-[10px] text-[#64748B]">אחוז הצלחה</p>
                </div>
                <div className="rounded-lg bg-[#131A26] p-3 text-center">
                  <div className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    preview.ready ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#F59E0B]/20 text-[#F59E0B]")}>
                    {preview.ready ? "✓" : "!"}
                  </div>
                  <p className="text-[10px] text-[#64748B] mt-1">{preview.ready ? "מוכן" : "בהתפתחות"}</p>
                </div>
              </div>
              <div className={cn(
                "rounded-lg px-3 py-2 text-xs",
                preview.ready ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#F59E0B]/10 text-[#F59E0B]"
              )}>
                {preview.ready
                  ? "✅ האסטרטגיה מוכנה — הקורס יכלול תובנות אישיות מהנתונים שלך"
                  : `⚡ ${preview.reason} — ניתן לייצר קורס תיאורטי עכשיו`}
              </div>
            </div>
          )}

          {/* What you'll get */}
          <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-5">
            <p className="text-sm font-semibold text-[#94A3B8] mb-3">מה הקורס כולל:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <BookOpen className="h-3.5 w-3.5" />, text: "6 מודולים מלאים" },
                { icon: <Brain className="h-3.5 w-3.5" />,    text: "פסיכולוגיה ומנטליות" },
                { icon: <Target className="h-3.5 w-3.5" />,   text: "קריטריוני כניסה מדויקים" },
                { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: "ניהול סיכונים" },
                { icon: <BarChart2 className="h-3.5 w-3.5" />, text: "תובנות מהנתונים שלך" },
                { icon: <CheckCircle className="h-3.5 w-3.5" />, text: "שאלות לבדיקת הבנה" },
                { icon: <Star className="h-3.5 w-3.5" />,     text: "צ'קליסט לפני עסקה" },
                { icon: <Play className="h-3.5 w-3.5" />,     text: "תוכנית פעולה יומית" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span className="text-[#6366F1]">{item.icon}</span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>

          {/* Generate button */}
          {error && (
            <div className="rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 px-4 py-3 text-sm text-[#EF4444]">
              {error}
            </div>
          )}
          <button
            onClick={generateCourse}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] py-4 text-base font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? (
              <><RefreshCw className="h-5 w-5 animate-spin" /> Claude בונה את הקורס שלך...</>
            ) : (
              <><Brain className="h-5 w-5" /> בנה קורס AI עכשיו</>
            )}
          </button>
          {loading && (
            <p className="text-center text-xs text-[#64748B]">
              Claude מנתח את הנתונים שלך ובונה תוכן מותאם אישית... (30-60 שניות)
            </p>
          )}
        </div>
      ) : (
        /* ── Course viewer ── */
        <div className="space-y-5">
          {/* Course header */}
          <div className="rounded-xl border border-[#6366F1]/30 bg-gradient-to-br from-[#6366F1]/10 to-[#8B5CF6]/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-[#F8FAFC] mb-1">{course.title}</h1>
                <p className="text-sm text-[#64748B]">{course.subtitle}</p>
                <div className="flex items-center gap-3 mt-3 text-xs text-[#64748B]">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {course.duration_hours} שעות</span>
                  <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" /> {course.difficulty}</span>
                  <span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5 text-[#6366F1]" />
                    {course.is_mock ? "גרסת דמו" : "נוצר ע\"י Claude Opus"}
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-[#10B981]">{completedCount}/{totalModules}</div>
                <div className="text-[10px] text-[#64748B]">מודולים</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="h-2 w-full rounded-full bg-[#1E293B]">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-[#6366F1] to-[#10B981] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-[#64748B] mt-1">{Math.round(progress)}% הושלם</p>
            </div>
          </div>

          {/* Personal stats bar */}
          {course.personal_stats?.total_trades > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "עסקאות", value: course.personal_stats.total_trades, color: "#6366F1" },
                { label: "הצלחה", value: `${course.personal_stats.win_rate}%`, color: course.personal_stats.win_rate >= 55 ? "#10B981" : "#F59E0B" },
                { label: "שעה טובה", value: course.personal_stats.best_hour, color: "#22C55E" },
                { label: "ממוצע ניצחון", value: `+${course.personal_stats.avg_win_pct}%`, color: "#10B981" },
              ].map((s, i) => (
                <div key={i} className="rounded-lg border border-[#1E293B] bg-[#0D1117] p-2.5 text-center">
                  <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] text-[#475569]">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex rounded-lg border border-[#1E293B] bg-[#0D1117] p-1 gap-1">
            {(["modules", "checklist", "insights"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-semibold transition-all",
                  tab === t
                    ? "bg-[#6366F1] text-white"
                    : "text-[#64748B] hover:text-[#94A3B8]"
                )}
              >
                {t === "modules" ? "מודולים" : t === "checklist" ? "צ'קליסט" : "תובנות AI"}
              </button>
            ))}
          </div>

          {/* Modules tab */}
          {tab === "modules" && (
            <div className="space-y-3">
              {course.modules.map((mod, i) => (
                <ModuleCard
                  key={i}
                  mod={mod}
                  moduleIndex={i}
                  isActive={activeModule === i}
                  onToggle={() => setActiveModule(activeModule === i ? null : i)}
                  onComplete={() => {
                    setCompleted(prev => new Set([...prev, i]));
                    setActiveModule(i + 1 < course.modules.length ? i + 1 : null);
                  }}
                  completed={completed.has(i)}
                />
              ))}

              {completedCount === totalModules && totalModules > 0 && (
                <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 p-6 text-center">
                  <div className="text-3xl mb-2">🏆</div>
                  <p className="text-lg font-bold text-[#10B981]">סיימת את הקורס!</p>
                  <p className="text-sm text-[#64748B] mt-1">
                    עכשיו יש לך את הכלים לסחור ב-{course.title} ברמה מקצועית.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Checklist tab */}
          {tab === "checklist" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#1E293B] bg-[#0D1117] p-5">
                <p className="text-sm font-semibold text-[#94A3B8] mb-4">✅ צ'קליסט לפני כל עסקה</p>
                <div className="space-y-2">
                  {course.checklist.map((item, i) => (
                    <ChecklistItem key={i} text={item} />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/5 p-5">
                <p className="text-sm font-semibold text-[#EF4444] mb-4">⚠️ טעויות נפוצות — הימנע מהן</p>
                <ul className="space-y-2">
                  {course.common_mistakes.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                      <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#EF4444]" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* AI Insights tab */}
          {tab === "insights" && (
            <div className="rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-[#6366F1]" />
                <p className="text-sm font-semibold text-[#6366F1]">תובנות AI מהנתונים שלך</p>
              </div>
              <p className="text-sm text-[#94A3B8] leading-relaxed">{course.ai_insights}</p>
            </div>
          )}

          {/* Regenerate */}
          <button
            onClick={generateCourse}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#1E293B] py-2.5 text-xs text-[#64748B] hover:text-[#94A3B8] hover:border-[#334155] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {loading ? "מעדכן קורס..." : "עדכן קורס עם נתונים חדשים"}
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      onClick={() => setChecked(!checked)}
      className="flex items-center gap-2.5 w-full text-right"
    >
      <div className={cn(
        "h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-all",
        checked ? "bg-[#10B981] border-[#10B981]" : "border-[#334155] bg-[#0B0E14]"
      )}>
        {checked && <CheckCircle className="h-3 w-3 text-white" />}
      </div>
      <span className={cn("text-sm", checked ? "text-[#475569] line-through" : "text-[#94A3B8]")}>
        {text}
      </span>
    </button>
  );
}
