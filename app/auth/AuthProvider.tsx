import { GoogleOAuthProvider, GoogleLogin, useGoogleOneTapLogin } from "@react-oauth/google";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginWithGoogleCredential, logoutSession } from "../api/auth";
import { ApiError } from "../api/client";
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
  authError: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PREFERENCES_KEY_PREFIX = "user-preferences";
const THEME_STORAGE_KEY = "tv-theme-mode";
const SESSION_TOKEN = "cookie-session";

function getEnvironmentName() {
  const explicit = import.meta.env.VITE_APP_ENV?.toLowerCase();
  if (explicit) {
    return explicit;
  }
  if (typeof window !== "undefined" && window.location.hostname.startsWith("dev.")) {
    return "dev";
  }
  return "this";
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();
    if ((error.status === 401 || error.status === 403) && message.includes("not allowed")) {
      const environmentName = getEnvironmentName();
      return environmentName === "dev"
        ? "You're in dev mode, but this Google account is not on the dev allowlist. Contact the repo owner to request access."
        : "This environment is restricted, and this Google account is not on the allowlist. Contact the repo owner to request access.";
    }
    if (error.status === 401) {
      return "Google sign-in could not be verified. Try again, or contact the repo owner if this keeps happening.";
    }
  }
  return "Sign-in failed. Try again, or contact the repo owner if this keeps happening.";
}

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

const userFromProfile = (profile: UserProfile): UserInfo => ({
  sub: profile.authId,
  email: profile.email || undefined,
  name: profile.email || profile.authId,
});

const preferencesFromProfile = (profile: UserProfile): UserPreferences => ({
  themeMode: profile.themeMode,
  pnlDisplayMode: profile.pnlDisplayMode,
  defaultTradeSortBy: profile.defaultTradeSortBy,
  defaultTradeSortDirection: profile.defaultTradeSortDirection,
  showTradeHistory: profile.showTradeHistory,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loginWidth, setLoginWidth] = useState("220");
  const [loginThemeMode, setLoginThemeMode] = useState<"light" | "dark">(() => readAuthThemeMode());

  const preferenceStorageKey = useCallback((authId: string) => `${PREFERENCES_KEY_PREFIX}:${authId}`, []);

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

  const clearSessionState = useCallback(() => {
    setToken(null);
    setUser(null);
    setProfile(null);
    setPreferencesState(null);
  }, []);

  const applyProfile = useCallback(
    (data: UserProfile) => {
      const nextPreferences = preferencesFromProfile(data);
      setProfile(data);
      setUser(userFromProfile(data));
      setToken(SESSION_TOKEN);
      setPreferencesState(nextPreferences);
      setAuthError(null);
      savePreferencesCache(data.authId, nextPreferences);
    },
    [savePreferencesCache]
  );

  const logout = useCallback(() => {
    void logoutSession().catch(() => {
      // The local auth state still clears even if the server session is already gone.
    });
    setAuthError(null);
    clearSessionState();
  }, [clearSessionState]);

  useEffect(() => {
    let cancelled = false;

    fetchUserProfile()
      .then((data) => {
        if (!cancelled) {
          applyProfile(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSessionState();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

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
        cancelled = true;
        window.removeEventListener("resize", handler);
        window.removeEventListener("storage", storageHandler);
        mediaQuery?.removeEventListener?.("change", mediaHandler);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [applyProfile, clearSessionState]);

  const handleSuccess = async (credential?: string | undefined) => {
    if (!credential) return;
    try {
      const data = await loginWithGoogleCredential(credential);
      applyProfile(data);
    } catch (error) {
      clearSessionState();
      setAuthError(getLoginErrorMessage(error));
    }
  };

  useGoogleOneTapLogin({
    onSuccess: (response) => void handleSuccess(response.credential),
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
        onSuccess={(response) => void handleSuccess(response.credential)}
        onError={() => {
          clearSessionState();
          setAuthError("Google sign-in failed before a credential was returned. Try again.");
        }}
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
        showTradeHistory: next.showTradeHistory ?? prev.showTradeHistory,
      };
    });
    setPreferencesState((prev) => ({
      themeMode: next.themeMode ?? prev?.themeMode ?? null,
      pnlDisplayMode: next.pnlDisplayMode ?? prev?.pnlDisplayMode ?? null,
      defaultTradeSortBy: next.defaultTradeSortBy ?? prev?.defaultTradeSortBy ?? null,
      defaultTradeSortDirection:
        next.defaultTradeSortDirection ?? prev?.defaultTradeSortDirection ?? null,
      showTradeHistory: next.showTradeHistory ?? prev?.showTradeHistory ?? null,
    }));
    const authId = user?.sub || user?.email;
    if (authId) {
      savePreferencesCache(authId, {
        themeMode: next.themeMode ?? preferences?.themeMode ?? null,
        pnlDisplayMode: next.pnlDisplayMode ?? preferences?.pnlDisplayMode ?? null,
        defaultTradeSortBy: next.defaultTradeSortBy ?? preferences?.defaultTradeSortBy ?? null,
        defaultTradeSortDirection:
          next.defaultTradeSortDirection ?? preferences?.defaultTradeSortDirection ?? null,
        showTradeHistory: next.showTradeHistory ?? preferences?.showTradeHistory ?? null,
      });
    }
  }, [
    preferences?.defaultTradeSortBy,
    preferences?.defaultTradeSortDirection,
    preferences?.pnlDisplayMode,
    preferences?.showTradeHistory,
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
      authError,
      initializing,
      loginButton,
      logout,
    }),
    [authError, initializing, loginButton, logout, preferences, profile, setPreferences, token, user]
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
