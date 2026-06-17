"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TrendingUp, Crown, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useState, useRef, useEffect } from "react";
import UpgradeModal from "@/components/ui/UpgradeModal";

const navLinks = [
  { href: "/dashboard", label: "🏠 בית" },
  { href: "/sandbox",  label: "Sandbox" },
  { href: "/library",  label: "Library" },
  { href: "/live-lab", label: "Live Lab 🔴" },
  { href: "/brokers",  label: "Brokers 🔌" },
  { href: "/vault",    label: "Vault" },
  { href: "/academy",  label: "Academy" },
  { href: "/chat",     label: "💬 Chat AI" },
  { href: "/tracker",     label: "📊 Tracker" },
  { href: "/performance", label: "📈 Performance" },
  { href: "/strategy-lab", label: "🧪 Strategy Lab" },
];

const TIER_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  free:    { label: "Free",    color: "text-[#64748B]", bg: "bg-[#1E293B]/60 border-[#1E293B]" },
  starter: { label: "Starter", color: "text-[#6366F1]", bg: "bg-[#6366F1]/10 border-[#6366F1]/30" },
  pro:     { label: "Pro",     color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10 border-[#F59E0B]/30" },
};

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">
          כניסה
        </Link>
        <Link href="/register" className="rounded-lg bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-3.5 py-1.5 text-sm font-semibold text-white transition-all hover:opacity-90">
          הרשמה חינם
        </Link>
      </div>
    );
  }

  const tier = TIER_LABEL[user.tier] ?? TIER_LABEL.free;
  const initials = user.email[0].toUpperCase();

  return (
    <>
    <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D1117] px-2.5 py-1.5 transition-all hover:border-[#263147]"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white">
          {initials}
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[11px] text-[#F8FAFC] font-medium max-w-[120px] truncate">{user.email}</span>
          <span className={cn("text-[9px] font-semibold", tier.color)}>{tier.label}</span>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#64748B] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-[#1E293B] bg-[#0D1117] shadow-2xl z-50 overflow-hidden">
          {/* Tier badge */}
          <div className={cn("flex items-center gap-2 px-3 py-2.5 border-b border-[#1E293B]", tier.bg)}>
            <Crown className={cn("h-3.5 w-3.5", tier.color)} />
            <span className={cn("text-xs font-semibold", tier.color)}>{tier.label} Plan</span>
          </div>

          {user.tier === "free" && (
            <button
              onClick={() => { setOpen(false); setUpgradeOpen(true); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[#6366F1] hover:bg-[#6366F1]/10 transition-colors border-b border-[#1E293B]"
            >
              <Crown className="h-3.5 w-3.5" />
              שדרג ל-Starter — ₪59/חודש
            </button>
          )}

          <button
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[#94A3B8] hover:bg-[#131A26] hover:text-[#F8FAFC] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            התנתק
          </button>
        </div>
      )}
    </div>
    </>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E293B] bg-[#0B0E14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold tracking-tight text-[#F8FAFC]">
            Penny<span className="text-[#6366F1]">AI</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                pathname === link.href
                  ? "bg-[#131A26] text-[#F8FAFC]"
                  : "text-[#94A3B8] hover:bg-[#131A26] hover:text-[#F8FAFC]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
