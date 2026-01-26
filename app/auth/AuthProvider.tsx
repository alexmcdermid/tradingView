import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { Button } from "@mui/material";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";
import { fetchUserProfile } from "../api/users";
import type { UserPreferences, UserProfile } from "../api/types";
import { getNeonJwtToken, isNeonAuthConfigured, neonAuth, neonSignOut, signInWithGoogle, useNeonSession } from "./neonAuth";

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

type NeonUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
};

function toUserInfo(user?: NeonUser | null): UserInfo | null {
  if (!user) {
    return null;
  }
  const authId = user.id || user.email || user.name;
  if (!authId) {
    return null;
  }
  return {
    sub: authId,
    email: user.email ?? undefined,
    name: user.name ?? user.email ?? undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useNeonSession();
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [mounted, setMounted] = useState(false);
  const profileRequestId = useRef(0);

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

  const logout = useCallback(() => {
    void neonSignOut();
    clearAuthToken();
    setToken(null);
    setUser(null);
    setProfile(null);
    setPreferencesState(null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (session.isPending) {
      return;
    }
    if (!session.data?.user) {
      clearAuthToken();
      setToken(null);
      setUser(null);
      setProfile(null);
      setPreferencesState(null);
      return;
    }
    const nextUser = toUserInfo(session.data.user);
    setUser(nextUser);
    let cancelled = false;
    getNeonJwtToken().then((jwt) => {
      if (cancelled) {
        return;
      }
      if (jwt) {
        setAuthToken(jwt);
        setToken(jwt);
        return;
      }
      clearAuthToken();
      setToken(null);
    });
    return () => {
      cancelled = true;
    };
  }, [session.data?.user, session.isPending]);

  useEffect(() => {
    if (!token) {
      profileRequestId.current += 1;
      setProfile(null);
      setPreferencesState(null);
      return;
    }
    const authId = user?.sub || user?.email;
    if (authId) {
      const cached = loadPreferencesCache(authId);
      if (cached) {
        setPreferencesState(cached);
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
  }, [loadPreferencesCache, savePreferencesCache, token, user?.email, user?.sub]);

  const handleGoogleSignIn = useCallback(() => {
    const redirectTo = typeof window === "undefined" ? undefined : window.location.href;
    void signInWithGoogle(redirectTo);
  }, []);

  const loginButton = mounted && isNeonAuthConfigured ? (
    <Button variant="contained" size="small" onClick={handleGoogleSignIn}>
      Sign in with Google
    </Button>
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
      initializing: session.isPending,
      loginButton,
      logout,
    }),
    [loginButton, logout, preferences, profile, setPreferences, session.isPending, token, user]
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
  if (!isNeonAuthConfigured || !neonAuth) {
    return (
      <div style={{ maxWidth: 520, margin: "2rem auto", padding: "1rem" }}>
        <p style={{ fontWeight: 600 }}>Neon Auth not configured</p>
        <p>
          Set <code>VITE_NEON_AUTH_URL</code> (e.g. in <code>.env.local</code>) to enable
          sign-in.
        </p>
      </div>
    );
  }
  const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
  return (
    <NeonAuthUIProvider authClient={neonAuth} redirectTo={redirectTo}>
      <AuthProvider>{children}</AuthProvider>
    </NeonAuthUIProvider>
  );
}
