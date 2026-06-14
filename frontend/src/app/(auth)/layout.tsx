import { TrendingUp } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <a href="/sandbox" className="flex items-center gap-2 mb-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
          <TrendingUp className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-[#F8FAFC]">
          Penny<span className="text-[#6366F1]">AI</span>
        </span>
      </a>
      {children}
    </div>
  );
}
