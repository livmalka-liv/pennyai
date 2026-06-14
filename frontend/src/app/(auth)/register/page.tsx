"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strong = password.length >= 8;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("סיסמה חייבת להיות לפחות 6 תווים"); return; }
    setLoading(true);
    try {
      await register(email, password);
      router.push("/sandbox");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-[#1E293B] bg-[#0D1117] p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-[#F8FAFC] mb-1 text-center">הצטרף ל-PennyAI</h1>
        <p className="text-[#64748B] text-sm text-center mb-1">3 אסטרטגיות ראשונות — חינם לגמרי</p>

        {/* Free tier highlights */}
        <div className="flex justify-center gap-3 mb-5">
          {["Sandbox", "Live Lab", "AI Optimizer"].map((f) => (
            <div key={f} className="flex items-center gap-1 text-[10px] text-[#10B981]">
              <Check className="h-3 w-3" />{f}
            </div>
          ))}
        </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
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
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className={`h-1 flex-1 rounded ${password.length >= 6 ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
                <div className={`h-1 flex-1 rounded ${strong ? "bg-[#10B981]" : "bg-[#1E293B]"}`} />
                <span className={`text-[10px] ${password.length >= 6 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                  {password.length >= 6 ? (strong ? "חזקה" : "תקינה") : "קצרה מדי"}
                </span>
              </div>
            )}
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
            {loading ? "נרשם..." : "צור חשבון חינמי"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#64748B]">
          יש לך חשבון?{" "}
          <Link href="/login" className="text-[#6366F1] hover:underline font-medium">
            כניסה
          </Link>
        </p>
      </div>
    </div>
  );
}
