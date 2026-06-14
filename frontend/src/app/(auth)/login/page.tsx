"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/sandbox";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-[#1E293B] bg-[#0D1117] p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-[#F8FAFC] mb-1 text-center">ברוך השב</h1>
        <p className="text-[#64748B] text-sm text-center mb-6">היכנס לחשבון PennyAI שלך</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">אימייל</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-[#1E293B] bg-[#131A26] px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">סיסמה</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#1E293B] bg-[#131A26] px-3.5 py-2.5 pr-10 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94A3B8]"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "נכנס..." : "כניסה"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#64748B]">
          אין לך חשבון?{" "}
          <Link href="/register" className="text-[#6366F1] hover:underline font-medium">
            הירשם חינם
          </Link>
        </p>
      </div>
    </div>
  );
}
