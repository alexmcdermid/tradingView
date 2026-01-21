import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";
import { fetchUserProfile } from "../api/users";
import type { UserPreferences, UserProfile } from "../api/types";

type UserInfo = {
  sub: string;
  email?: string;
  name?: string;
  exp?: number;
};

type AuthContextValue = {
  user: UserInfo | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  setPreferences: (preferences: UserPreferences) => void;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loginWidth, setLoginWidth] = useState("220");
  const logoutTimerRef = useRef<number | null>(null);
  const profileRequestId = useRef(0);
  const tokenSourceRef = useRef<"login" | "storage" | null>(null);

  const preferenceStorageKey = useCallback((authId: string) => `user-preferences:${authId}`, []);

  const loadPreferencesCache = useCallback(
    (authId: string) => {
      if (typeof window === "undefined") {
        return null;
      }
      try {
        const raw = window.localStorage.getItem(preferenceStorageKey(authId));
        if (!raw) {
          return null;
        }
        return JSON.parse(raw) as UserPreferences;
      } catch {
        return null;
      }
    },
    [preferenceStorageKey]
  );

  const savePreferencesCache = useCallback(
    (authId: string, next: UserPreferences) => {
      if (typeof window === "undefined") {
        return;
      }
      try {
        window.localStorage.setItem(preferenceStorageKey(authId), JSON.stringify(next));
      } catch {
        // Ignore cache writes.
      }
    },
    [preferenceStorageKey]
  );

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
    setProfile(null);
    setPreferencesState(null);
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
        tokenSourceRef.current = "storage";
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
      tokenSourceRef.current = "login";
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
    if (!token) {
      profileRequestId.current += 1;
      setProfile(null);
      setPreferencesState(null);
      return;
    }
    const authId = user?.sub || user?.email;
    if (tokenSourceRef.current === "storage" && authId) {
      const cached = loadPreferencesCache(authId);
      if (cached) {
        setPreferencesState(cached);
        tokenSourceRef.current = null;
        return;
      }
    }
    const requestId = ++profileRequestId.current;
    fetchUserProfile()
      .then((data) => {
        if (profileRequestId.current !== requestId) {
          return;
        }
        setProfile(data);
        const nextPreferences: UserPreferences = {
          themeMode: data.themeMode,
          pnlDisplayMode: data.pnlDisplayMode,
        };
        setPreferencesState(nextPreferences);
        if (authId) {
          savePreferencesCache(authId, nextPreferences);
        }
      })
      .catch(() => {
        if (profileRequestId.current !== requestId) {
          return;
        }
        setProfile(null);
      });
    tokenSourceRef.current = null;
  }, [loadPreferencesCache, savePreferencesCache, token, user?.email, user?.sub]);

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
    <div
      style={{
        width: `${loginWidth}px`,
        minHeight: "44px",
        display: "flex",
        alignItems: "center",
        overflow: "visible",
      }}
    >
      <GoogleLogin
        onSuccess={(response) => handleSuccess(response.credential)}
        onError={() => logout()}
        text="signin_with"
        shape="pill"
        width={loginWidth}
        useOneTap
        auto_select
        itp_support
        use_fedcm_for_prompt
        cancel_on_tap_outside={false}
      />
    </div>
  ) : null;

  const setPreferences = useCallback((next: UserPreferences) => {
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        themeMode: next.themeMode ?? prev.themeMode,
        pnlDisplayMode: next.pnlDisplayMode ?? prev.pnlDisplayMode,
      };
    });
    setPreferencesState((prev) => ({
      themeMode: next.themeMode ?? prev?.themeMode ?? null,
      pnlDisplayMode: next.pnlDisplayMode ?? prev?.pnlDisplayMode ?? null,
    }));
    const authId = user?.sub || user?.email;
    if (authId) {
      savePreferencesCache(authId, {
        themeMode: next.themeMode ?? preferences?.themeMode ?? null,
        pnlDisplayMode: next.pnlDisplayMode ?? preferences?.pnlDisplayMode ?? null,
      });
    }
  }, [preferences?.pnlDisplayMode, preferences?.themeMode, savePreferencesCache, user?.email, user?.sub]);

  const value = useMemo(
    () => ({
      user,
      profile,
      preferences,
      setPreferences,
      token,
      initializing,
      loginButton,
      logout,
    }),
    [initializing, loginButton, logout, preferences, profile, setPreferences, token, user]
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
