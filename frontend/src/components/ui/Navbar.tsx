"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TrendingUp, Crown } from "lucide-react";

const navLinks = [
  { href: "/sandbox", label: "Sandbox" },
  { href: "/library", label: "Strategy Library" },
  { href: "/vault", label: "Strategy Vault" },
  { href: "/academy", label: "Academy" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E293B] bg-[#0B0E14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/sandbox" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold tracking-tight text-[#F8FAFC]">
            Trading<span className="text-[#6366F1]">Test</span>
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

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-1">
            <Crown className="h-3 w-3 text-[#6366F1]" />
            <span className="text-xs font-semibold text-[#6366F1]">Pro</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-xs font-bold">
            U
          </div>
        </div>
      </div>
    </header>
  );
}
