import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trading Test — Penny Stock Strategy Backtester",
  description:
    "AI-powered backtesting platform for penny stocks. Define strategies in plain English and get verified historical performance analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-[#0B0E14] text-[#F8FAFC] antialiased">
        {children}
      </body>
    </html>
  );
}
