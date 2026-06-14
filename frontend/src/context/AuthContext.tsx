"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getToken, setToken, clearToken, parseToken, type TokenPayload } from "@/lib/auth";

interface AuthCtx {
  user: TokenPayload | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);
const API = process.env.NEXT_PUBLIC_API_URL ?? "https://pennyai-backend-production.up.railway.app/api/v1";

async function authPost(path: string, body: object): Promise<{ access_token: string; tier: string; email: string }> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`שגיאת רשת: ${API}${path} — ${networkErr instanceof Error ? networkErr.message : networkErr}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try { detail = JSON.parse(text).detail ?? ""; } catch { detail = text; }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const parsed = parseToken(token);
      if (parsed) setUser(parsed);
      else clearToken();
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authPost("/auth/login", { email, password });
    setToken(access_token);
    const parsed = parseToken(access_token);
    if (parsed) setUser(parsed);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { access_token } = await authPost("/auth/register", { email, password });
    setToken(access_token);
    const parsed = parseToken(access_token);
    if (parsed) setUser(parsed);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
