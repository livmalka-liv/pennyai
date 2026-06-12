"use client";

import { useState } from "react";
import { Play, Lock, BookOpen, Clock, Star, ChevronRight, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

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

export default function AcademyPage() {
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);

  if (activeCourse && activeLesson) {
    return (
      <VideoPlayer
        course={activeCourse}
        lessonTitle={activeLesson}
        onBack={() => setActiveLesson(null)}
      />
    );
  }

  if (activeCourse) {
    return (
      <CourseDetail
        course={activeCourse}
        onBack={() => setActiveCourse(null)}
        onPlayLesson={(title) => setActiveLesson(title)}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      {/* Hero */}
      <div className="relative border-b border-[#1E293B] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/10 to-transparent" />
        <div className="relative mx-auto max-w-screen-xl px-6 py-12">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-[#8B5CF6]" />
            <Badge variant="violet">PennyAI Academy</Badge>
          </div>
          <h1 className="text-3xl font-bold text-[#F8FAFC] leading-tight max-w-xl">
            Master Penny Stock Trading{" "}
            <span className="gradient-text">From Zero to Consistent</span>
          </h1>
          <p className="mt-3 text-[#94A3B8] text-sm max-w-lg leading-relaxed">
            Video-based courses taught through real backtest data. Every lesson is paired with
            live trade replays and Level 2 order book breakdowns.
          </p>
          <div className="mt-6 flex items-center gap-6 text-sm">
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">3</strong> Courses</span>
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">36</strong> Lessons</span>
            <span className="text-[#94A3B8]"><strong className="text-[#F8FAFC]">14h+</strong> of Content</span>
          </div>
        </div>
      </div>

      {/* Courses grid */}
      <div className="mx-auto max-w-screen-xl px-6 py-10 space-y-6">
        {COURSES.map((course) => (
          <div key={course.id} className="glass-card overflow-hidden">
            <div className="flex gap-0">
              {/* Thumbnail */}
              <div
                className={cn(
                  "relative w-64 shrink-0 bg-gradient-to-br flex-col flex items-center justify-center",
                  course.thumbnailGradient
                )}
              >
                <div className="absolute inset-0 bg-black/25" />
                {course.locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Lock className="h-8 w-8 text-white/70" />
                  </div>
                )}
                {!course.locked && (
                  <button
                    onClick={() => setActiveCourse(course)}
                    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30">
                      <Play className="h-5 w-5 text-white" fill="white" />
                    </div>
                  </button>
                )}
              </div>

              {/* Info */}
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
                  <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed max-w-lg">
                    {course.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4 text-xs text-[#64748B]">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {course.lessons} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {course.duration}
                    </span>
                  </div>
                  <Button
                    variant={course.locked ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => !course.locked && setActiveCourse(course)}
                    disabled={course.locked}
                    className="gap-1.5"
                  >
                    {course.locked ? (
                      <><Lock className="h-3.5 w-3.5" />Unlock</>
                    ) : (
                      <><Play className="h-3.5 w-3.5" />Start Course</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Elite upgrade CTA */}
        <div className="rounded-2xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-[#6366F1]/5 p-8 text-center">
          <Crown className="mx-auto h-10 w-10 text-[#8B5CF6] mb-3" />
          <h2 className="text-xl font-bold text-[#F8FAFC]">Unlock All Courses & Strategy Vault</h2>
          <p className="mt-2 text-sm text-[#94A3B8] max-w-md mx-auto">
            Elite membership gives you full access to the academy, 6 verified vault strategies,
            and unlimited AI backtesting with 5-year intraday data.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="primary" size="lg">
              <Crown className="h-4 w-4" />
              Upgrade to Elite — $149/mo
            </Button>
            <span className="text-sm text-[#64748B]">or $1,200/yr (save 33%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseDetail({ course, onBack, onPlayLesson }: {
  course: Course;
  onBack: () => void;
  onPlayLesson: (title: string) => void;
}) {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      <div className="mx-auto max-w-screen-lg px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] mb-6 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to Academy
        </button>

        <div className="glass-card p-6 mb-6">
          <Badge variant={LEVEL_COLORS[course.level]}>{course.level}</Badge>
          <h1 className="mt-2 text-2xl font-bold text-[#F8FAFC]">{course.title}</h1>
          <p className="mt-2 text-[#94A3B8] text-sm">{course.description}</p>
        </div>

        <div className="space-y-2">
          {course.modules.map((module, i) => (
            <div
              key={i}
              className={cn(
                "glass-card flex items-center justify-between px-4 py-3 transition-all",
                !module.locked && "cursor-pointer hover:border-[#263147]"
              )}
              onClick={() => !module.locked && onPlayLesson(module.title)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  module.locked ? "bg-[#1E293B] text-[#64748B]" : "bg-[#6366F1]/20 text-[#6366F1]"
                )}>
                  {module.locked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={cn("text-sm font-medium", module.locked ? "text-[#64748B]" : "text-[#F8FAFC]")}>
                  {module.title}
                </span>
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

function VideoPlayer({ course, lessonTitle, onBack }: {
  course: Course;
  lessonTitle: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#0B0E14]">
      <div className="mx-auto max-w-screen-xl px-6 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to {course.title}
        </button>

        <div className="grid grid-cols-3 gap-6">
          {/* Video */}
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
              <p className="mt-2 text-sm text-[#94A3B8]">
                This lesson covers the key concepts from the {course.title} curriculum.
                Real trade examples are pulled directly from the 5-year backtest database.
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="glass-card p-4 self-start">
            <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Course Modules</h3>
            <div className="space-y-1">
              {course.modules.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
                    m.title === lessonTitle
                      ? "bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20"
                      : m.locked
                      ? "text-[#64748B] cursor-not-allowed"
                      : "text-[#94A3B8] hover:bg-[#131A26] cursor-pointer"
                  )}
                >
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
