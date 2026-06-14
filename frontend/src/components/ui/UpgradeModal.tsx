"use client";

import { useState } from "react";
import { Crown, X, Check, Loader2, Zap } from "lucide-react";
import { createCheckout } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string; // e.g. "מגבלת 3 אסטרטגיות הושגה"
}

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    icon: "⚡",
    monthlyIls: 59,
    yearlyIls: 474,
    features: [
      "עד 15 אסטרטגיות במקביל",
      "קורסי AI מותאמים אישית",
      "AI Optimizer שבועי",
      "Live Lab + Sandbox ללא הגבלה",
    ],
    color: "from-[#6366F1] to-[#8B5CF6]",
    border: "border-[#6366F1]/40",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    icon: "👑",
    monthlyIls: 149,
    yearlyIls: 1192,
    features: [
      "אסטרטגיות ללא הגבלה",
      "חיבור ברוקר חי (IBKR, Colmex)",
      "קורסי AI + Community Vault",
      "השוואת מהירות ביצוע ברוקרים",
      "AI Agent 24/7",
    ],
    color: "from-[#F59E0B] to-[#EF4444]",
    border: "border-[#F59E0B]/40",
    highlight: true,
  },
];

export default function UpgradeModal({ open, onClose, reason }: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleUpgrade(tier: string) {
    setLoading(tier);
    setError("");
    try {
      const { url } = await createCheckout(tier, billing);
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה בחיבור לתשלום");
      setLoading(null);
    }
  }

  const yearlyDiscount = Math.round((1 - 474 / (59 * 12)) * 100); // ~33%

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#1E293B] bg-[#0D1117] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative border-b border-[#1E293B] bg-gradient-to-r from-[#6366F1]/10 to-[#8B5CF6]/10 px-6 py-5">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-[#64748B] hover:bg-[#131A26] hover:text-[#F8FAFC] transition-all">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-5 w-5 text-[#6366F1]" />
            <h2 className="text-lg font-bold text-[#F8FAFC]">שדרג את החשבון</h2>
          </div>
          {reason && <p className="text-sm text-[#94A3B8]">{reason}</p>}

          {/* Billing toggle */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => setBilling("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${billing === "monthly" ? "bg-[#6366F1] text-white" : "text-[#64748B] hover:text-[#F8FAFC]"}`}
            >
              חודשי
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${billing === "yearly" ? "bg-[#6366F1] text-white" : "text-[#64748B] hover:text-[#F8FAFC]"}`}
            >
              שנתי
              <span className="rounded-full bg-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 text-[9px] font-bold">
                חיסכון {yearlyDiscount}%
              </span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-2 gap-4 p-6">
          {PLANS.map((plan) => {
            const price = billing === "monthly" ? plan.monthlyIls : Math.round(plan.yearlyIls / 12);
            const isLoading = loading === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border ${plan.border} bg-[#0F1520] p-5 flex flex-col ${plan.highlight ? "ring-1 ring-[#F59E0B]/30" : ""}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444] px-3 py-0.5 text-[10px] font-bold text-white">
                    הכי פופולרי
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{plan.icon}</span>
                  <div>
                    <div className="font-bold text-[#F8FAFC]">{plan.name}</div>
                    <div className="text-xs text-[#64748B]">
                      ₪{price}/חודש{billing === "yearly" && " (חיוב שנתי)"}
                    </div>
                  </div>
                </div>

                <ul className="space-y-2 mb-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                      <Check className="h-3.5 w-3.5 text-[#10B981] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!!loading}
                  className={`w-full rounded-lg bg-gradient-to-r ${plan.color} px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />מעביר לתשלום...</>
                  ) : (
                    <><Zap className="h-4 w-4" />שדרג ל-{plan.name}</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
            {error}
          </div>
        )}

        <p className="text-center text-[10px] text-[#475569] pb-4">
          מאובטח על ידי Stripe · ביטול בכל עת · ₪0 דמי ביטול
        </p>
      </div>
    </div>
  );
}
