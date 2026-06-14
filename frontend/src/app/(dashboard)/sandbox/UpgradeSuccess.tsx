"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, X, Crown } from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
};

export default function UpgradeSuccess() {
  const params = useSearchParams();
  const upgraded = params.get("upgraded");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (upgraded && TIER_LABELS[upgraded]) {
      setVisible(true);
      // Clean URL without reload
      window.history.replaceState({}, "", "/sandbox");
      const t = setTimeout(() => setVisible(false), 7000);
      return () => clearTimeout(t);
    }
  }, [upgraded]);

  if (!visible || !upgraded) return null;

  const tierName = TIER_LABELS[upgraded] ?? upgraded;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-start gap-3 rounded-2xl border border-[#10B981]/40 bg-[#0D1117] p-4 shadow-2xl w-80 animate-in slide-in-from-bottom-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10B981]/15">
        <CheckCircle className="h-5 w-5 text-[#10B981]" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Crown className="h-3.5 w-3.5 text-[#F59E0B]" />
          <span className="text-sm font-bold text-[#F8FAFC]">ברוך הבא ל-{tierName}!</span>
        </div>
        <p className="text-xs text-[#94A3B8]">השדרוג הופעל. כל התכונות זמינות עכשיו.</p>
      </div>
      <button onClick={() => setVisible(false)} className="text-[#475569] hover:text-[#94A3B8]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
