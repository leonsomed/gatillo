import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

type AuthUser = {
  id: string;
  email: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: string | null;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchAuthStatus(): Promise<{
  isAuthenticated: boolean;
  user: AuthUser | null;
}> {
  const response = await fetch("/auth/status", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Unable to check auth status.");
  }

  const data = (await response.json()) as {
    isAuthenticated?: boolean;
    user?: AuthUser | null;
  };

  return {
    isAuthenticated: Boolean(data.isAuthenticated),
    user: data.user ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAuthStatus();
      setIsAuthenticated(result.isAuthenticated);
      setUser(result.user);
    } catch (err) {
      setIsAuthenticated(false);
      setUser(null);
      setError(err instanceof Error ? err.message : "Unable to check auth.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFocus = () => {
      void refreshAuth();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    await refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      error,
      refreshAuth,
      logout,
    }),
    [isAuthenticated, isLoading, user, error, refreshAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
