import { GoogleOAuthProvider, GoogleLogin, useGoogleOneTapLogin } from "@react-oauth/google";
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

const PREFERENCES_KEY_PREFIX = "user-preferences";
const THEME_STORAGE_KEY = "tv-theme-mode";

function readAuthThemeMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // Fall back to media query below.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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
  const [token, setToken] = useState<string | null>(() => {
    const stored = getAuthToken();
    if (!stored) return null;
    const info = decodeToken(stored);
    if (!info || (info.exp && Date.now() >= info.exp * 1000)) {
      clearAuthToken();
      return null;
    }
    return stored;
  });
  const [user, setUser] = useState<UserInfo | null>(() => {
    const stored = getAuthToken();
    if (!stored) return null;
    const info = decodeToken(stored);
    if (!info || (info.exp && Date.now() >= info.exp * 1000)) return null;
    return info;
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(() => {
    const stored = getAuthToken();
    if (!stored) return null;
    const info = decodeToken(stored);
    if (!info) return null;
    const authId = info.sub || info.email;
    if (!authId) return null;
    try {
      const raw = window.localStorage.getItem(`${PREFERENCES_KEY_PREFIX}:${authId}`);
      if (!raw) return null;
      return JSON.parse(raw) as UserPreferences;
    } catch {
      return null;
    }
  });
  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loginWidth, setLoginWidth] = useState("220");
  const [loginThemeMode, setLoginThemeMode] = useState<"light" | "dark">(() => readAuthThemeMode());
  const logoutTimerRef = useRef<number | null>(null);
  const profileRequestId = useRef(0);
  const tokenSourceRef = useRef<"login" | "storage" | null>(null);

  const preferenceStorageKey = useCallback((authId: string) => `${PREFERENCES_KEY_PREFIX}:${authId}`, []);

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
        // Only set token/user if not already initialized synchronously
        if (!token) {
          setToken(stored);
          setUser(info);
        }
        scheduleLogout(info.exp);
      } else {
        clearAuthToken();
        if (token) {
          setToken(null);
          setUser(null);
        }
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
      const syncLoginTheme = () => setLoginThemeMode(readAuthThemeMode());
      setLoginWidth(computeWidth());
      syncLoginTheme();
      const handler = () => setLoginWidth(computeWidth());
      const storageHandler = (event: StorageEvent) => {
        if (event.key === THEME_STORAGE_KEY) {
          syncLoginTheme();
        }
      };
      const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
      const mediaHandler = () => syncLoginTheme();
      window.addEventListener("resize", handler);
      window.addEventListener("storage", storageHandler);
      mediaQuery?.addEventListener?.("change", mediaHandler);
      return () => {
        window.removeEventListener("resize", handler);
        window.removeEventListener("storage", storageHandler);
        mediaQuery?.removeEventListener?.("change", mediaHandler);
      };
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
          defaultTradeSortBy: data.defaultTradeSortBy,
          defaultTradeSortDirection: data.defaultTradeSortDirection,
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

  useGoogleOneTapLogin({
    onSuccess: (response) => handleSuccess(response.credential),
    onError: () => {
      // Ignore prompt dismissals/errors; the explicit button remains available.
    },
    auto_select: true,
    use_fedcm_for_prompt: true,
    use_fedcm_for_button: true,
    cancel_on_tap_outside: false,
    disabled: !mounted || !!token,
  });

  const loginButton = mounted ? (
    <div
      style={{
        width: `${loginWidth}px`,
        height: "44px",
        borderRadius: "22px",
        overflow: "hidden",
      }}
    >
      <GoogleLogin
        onSuccess={(response) => handleSuccess(response.credential)}
        onError={() => logout()}
        text="signin_with"
        theme={loginThemeMode === "dark" ? "filled_black" : "outline"}
        shape="pill"
        width={loginWidth}
        itp_support
        use_fedcm_for_button
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
        defaultTradeSortBy: next.defaultTradeSortBy ?? prev.defaultTradeSortBy,
        defaultTradeSortDirection:
          next.defaultTradeSortDirection ?? prev.defaultTradeSortDirection,
      };
    });
    setPreferencesState((prev) => ({
      themeMode: next.themeMode ?? prev?.themeMode ?? null,
      pnlDisplayMode: next.pnlDisplayMode ?? prev?.pnlDisplayMode ?? null,
      defaultTradeSortBy: next.defaultTradeSortBy ?? prev?.defaultTradeSortBy ?? null,
      defaultTradeSortDirection:
        next.defaultTradeSortDirection ?? prev?.defaultTradeSortDirection ?? null,
    }));
    const authId = user?.sub || user?.email;
    if (authId) {
      savePreferencesCache(authId, {
        themeMode: next.themeMode ?? preferences?.themeMode ?? null,
        pnlDisplayMode: next.pnlDisplayMode ?? preferences?.pnlDisplayMode ?? null,
        defaultTradeSortBy: next.defaultTradeSortBy ?? preferences?.defaultTradeSortBy ?? null,
        defaultTradeSortDirection:
          next.defaultTradeSortDirection ?? preferences?.defaultTradeSortDirection ?? null,
      });
    }
  }, [
    preferences?.defaultTradeSortBy,
    preferences?.defaultTradeSortDirection,
    preferences?.pnlDisplayMode,
    preferences?.themeMode,
    savePreferencesCache,
    user?.email,
    user?.sub,
  ]);

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
