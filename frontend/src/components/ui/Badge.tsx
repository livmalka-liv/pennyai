import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "red" | "brand" | "violet" | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  green: "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20",
  red: "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20",
  brand: "bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20",
  violet: "bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20",
  muted: "bg-[#1E293B] text-[#94A3B8] border border-[#263147]",
};

export default function Badge({ children, variant = "muted", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
