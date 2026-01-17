import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";

type UserInfo = {
  sub: string;
  email?: string;
  name?: string;
  exp?: number;
};

type AuthContextValue = {
  user: UserInfo | null;
  token: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeToken(token: string): UserInfo | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.email,
      exp: typeof decoded.exp === "number" ? decoded.exp : undefined,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loginWidth, setLoginWidth] = useState("220");
  const logoutTimerRef = useRef<number | null>(null);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setToken(null);
    setUser(null);
    clearLogoutTimer();
  }, [clearLogoutTimer]);

  const scheduleLogout = useCallback(
    (exp?: number) => {
      clearLogoutTimer();
      if (!exp) return;
      const expiresAt = exp * 1000;
      const timeoutMs = expiresAt - Date.now();
      if (timeoutMs <= 0) {
        logout();
        return;
      }
      logoutTimerRef.current = window.setTimeout(() => logout(), timeoutMs);
    },
    [clearLogoutTimer, logout]
  );

  useEffect(() => {
    const stored = getAuthToken();
    if (stored) {
      const info = decodeToken(stored);
      if (info && (!info.exp || Date.now() < info.exp * 1000)) {
        setToken(stored);
        setUser(info);
        scheduleLogout(info.exp);
      } else {
        clearAuthToken();
      }
    }
    setInitializing(false);
    setMounted(true);

    if (typeof window !== "undefined") {
      const computeWidth = () => {
        const w = window.innerWidth;
        if (w < 400) return "180";
        if (w < 640) return "200";
        return "220";
      };
      setLoginWidth(computeWidth());
      const handler = () => setLoginWidth(computeWidth());
      window.addEventListener("resize", handler);
      return () => window.removeEventListener("resize", handler);
    }
  }, []);

  const handleSuccess = (credential?: string | undefined) => {
    if (!credential) return;
    const info = decodeToken(credential);
    if (info) {
      setAuthToken(credential);
      setToken(credential);
      setUser(info);
      scheduleLogout(info.exp);
    }
  };

  useEffect(() => {
    if (!token) {
      clearLogoutTimer();
      return;
    }
    const info = decodeToken(token);
    if (info?.exp && Date.now() >= info.exp * 1000) {
      logout();
      return;
    }
    scheduleLogout(info?.exp);
  }, [clearLogoutTimer, logout, scheduleLogout, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkExpiry = () => {
      const stored = getAuthToken();
      if (!stored) return;
      const info = decodeToken(stored);
      if (info?.exp && Date.now() >= info.exp * 1000) {
        logout();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkExpiry();
      }
    };
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [logout]);

  const loginButton = mounted ? (
    <div style={{ 
      width: `${loginWidth}px`,
      height: '44px',
      borderRadius: '22px',
      overflow: 'hidden',
    }}>
      <GoogleLogin
        onSuccess={(response) => handleSuccess(response.credential)}
        onError={() => logout()}
        text="signin_with"
        shape="pill"
        width={loginWidth}
        useOneTap
        auto_select
        cancel_on_tap_outside={false}
      />
    </div>
  ) : null;

  const value = useMemo(
    () => ({
      user,
      token,
      initializing,
      loginButton,
      logout,
    }),
    [initializing, loginButton, logout, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return (
      <div style={{ maxWidth: 520, margin: "2rem auto", padding: "1rem" }}>
        <p style={{ fontWeight: 600 }}>Google OAuth not configured</p>
        <p>
          Set <code>VITE_GOOGLE_CLIENT_ID</code> (e.g. in <code>.env.local</code>) to enable
          sign-in. For local dev, register http://localhost:5173 as an authorized origin in
          your Google OAuth client.
        </p>
      </div>
    );
  }
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>{children}</AuthProvider>
    </GoogleOAuthProvider>
  );
}
