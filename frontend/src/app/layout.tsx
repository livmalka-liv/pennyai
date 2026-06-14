import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PennyAI — Penny Stock Strategy Platform",
  description:
    "AI-powered backtesting, real-time scanning, and personalized trading courses for penny stocks.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" className={inter.className}>
      <body className="min-h-screen bg-[#0B0E14] text-[#F8FAFC] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
