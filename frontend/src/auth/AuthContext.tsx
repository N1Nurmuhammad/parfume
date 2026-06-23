import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "../api/client";
import type { Me, Health } from "../api/types";

interface AuthCtx {
  me: Me | null;
  ready: boolean;
  productCurrency: string;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [productCurrency, setProductCurrency] = useState("USD");

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const loadSession = useCallback(async () => {
    const [meRes, health] = await Promise.all([
      api<Me>("/auth/me"),
      api<Health>("/health").catch(() => null),
    ]);
    setMe(meRes);
    if (health?.product_currency) setProductCurrency(health.product_currency);
  }, []);

  const login = useCallback(
    async (login: string, password: string) => {
      const data = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: { login, password },
      });
      setToken(data.access_token);
      await loadSession();
    },
    [loadSession],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setMe(null);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (getToken()) {
        try {
          await loadSession();
        } catch {
          setToken(null);
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [loadSession]);

  return (
    <Ctx.Provider value={{ me, ready, productCurrency, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
