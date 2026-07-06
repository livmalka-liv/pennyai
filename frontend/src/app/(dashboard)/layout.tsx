"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import { getToken, parseToken, clearToken } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token || !parseToken(token)) {
      clearToken();
      router.replace("/login");
    }
  }, [router]);

  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}
