import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "../api/client";
import type { Me, User } from "../api/types";

interface AuthValue {
  me: Me | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; first_name: string; last_name: string; role: "Trainee" | "Trainer" }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);
const ME_CACHE = "fv:me";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(() => {
    try {
      const raw = localStorage.getItem(ME_CACHE);
      return raw && getToken() ? (JSON.parse(raw) as Me) : null; // instant first paint, refreshed below
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(!!getToken() && !me);

  const store = (m: Me | null) => {
    setMe(m);
    try {
      if (m) localStorage.setItem(ME_CACHE, JSON.stringify(m));
      else localStorage.removeItem(ME_CACHE);
    } catch {
      /* ignore */
    }
  };

  const refresh = useCallback(async () => {
    if (!getToken()) {
      store(null);
      setLoading(false);
      return;
    }
    try {
      store(await api<Me>("/me"));
    } catch (e: any) {
      if (e?.status === 401) store(null); // offline keeps the cached profile
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    store(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void refresh();
  }, [logout, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const out = await api<{ access_token: string; user: User }>("/auth/login", { method: "POST", json: { email, password } });
      setToken(out.access_token);
      await refresh();
      return out.user;
    },
    [refresh],
  );

  const register = useCallback(
    async (data: { email: string; password: string; first_name: string; last_name: string; role: "Trainee" | "Trainer" }) => {
      const out = await api<{ access_token: string; user: User }>("/auth/register", { method: "POST", json: data });
      setToken(out.access_token);
      await refresh();
      return out.user;
    },
    [refresh],
  );

  const value = useMemo(() => ({ me, user: me?.user ?? null, loading, login, register, logout, refresh }), [me, loading, login, register, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
