import { GoogleOAuthProvider, GoogleLogin, useGoogleOneTapLogin } from "@react-oauth/google";
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loginWithGoogleCredential, logoutSession } from "../api/auth";
import { ApiError } from "../api/client";
import { acceptUserLegalAgreement, fetchUserProfile } from "../api/users";
import type { UserPreferences, UserProfile } from "../api/types";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from "../theme/colorMode";

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
  loginButton: ReactNode;
  logout: () => void;
  legalAgreementRequired: boolean;
  legalAgreementError: string | null;
  acceptLegalAgreement: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PREFERENCES_KEY_PREFIX = "user-preferences";
const SESSION_TOKEN = "cookie-session";
const GOOGLE_INTERACTION_TIMEOUT_MS = 90_000;
type GoogleInteractionSource = "button" | "one-tap";

const PUBLIC_AUTH_CONTEXT_VALUE: AuthContextValue = {
  user: null,
  profile: null,
  preferences: null,
  setPreferences: () => {},
  token: null,
  authError: null,
  initializing: false,
  loginButton: null,
  logout: () => {},
  legalAgreementRequired: false,
  legalAgreementError: null,
  acceptLegalAgreement: async () => {},
};

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
    // Fall back to the app's default mode below.
  }
  return "light";
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
  showDetailedTradeTimes: profile.showDetailedTradeTimes,
  dashboardWidgets: profile.dashboardWidgets,
  displayCurrency: profile.displayCurrency,
  taxCapitalGainsRate: profile.taxCapitalGainsRate,
  taxPersonalRate: profile.taxPersonalRate,
});

const hasAcceptedLegalAgreement = (profile: UserProfile) =>
  Boolean(profile.termsAcceptedAt && profile.privacyPolicyAcceptedAt);

type GoogleIdentityWindow = Window & {
  google?: {
    accounts?: {
      id?: {
        cancel?: () => void;
      };
    };
  };
};

function cancelGoogleIdentityPrompt() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    (window as GoogleIdentityWindow).google?.accounts?.id?.cancel?.();
  } catch {
    // Ignore Google Identity cleanup failures; the next render will reinitialize it.
  }
}

export function AuthProvider({
  children,
  disableLoginPrompts = false,
  suppressLegalAgreementDialog = false,
}: {
  children: ReactNode;
  disableLoginPrompts?: boolean;
  suppressLegalAgreementDialog?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [legalAgreementProfile, setLegalAgreementProfile] = useState<UserProfile | null>(null);
  const [legalAgreementError, setLegalAgreementError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loginWidth, setLoginWidth] = useState("220");
  const [loginThemeMode, setLoginThemeMode] = useState<"light" | "dark">(() => readAuthThemeMode());
  const [oneTapSuppressed, setOneTapSuppressed] = useState(false);
  const [loginRenderNonce, setLoginRenderNonce] = useState(0);
  const googleInteractionInProgressRef = useRef(false);
  const googleInteractionSourceRef = useRef<GoogleInteractionSource | null>(null);
  const googleInteractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearGoogleInteraction = useCallback(() => {
    googleInteractionInProgressRef.current = false;
    googleInteractionSourceRef.current = null;
    if (googleInteractionTimeoutRef.current) {
      clearTimeout(googleInteractionTimeoutRef.current);
      googleInteractionTimeoutRef.current = null;
    }
  }, []);

  const startGoogleInteraction = useCallback((source: GoogleInteractionSource) => {
    googleInteractionInProgressRef.current = true;
    googleInteractionSourceRef.current = source;
    if (googleInteractionTimeoutRef.current) {
      clearTimeout(googleInteractionTimeoutRef.current);
    }
    googleInteractionTimeoutRef.current = setTimeout(() => {
      googleInteractionInProgressRef.current = false;
      googleInteractionSourceRef.current = null;
      googleInteractionTimeoutRef.current = null;
    }, GOOGLE_INTERACTION_TIMEOUT_MS);
  }, []);

  const applyProfile = useCallback(
    (data: UserProfile) => {
      const nextPreferences = preferencesFromProfile(data);
      setLegalAgreementProfile(null);
      setLegalAgreementError(null);
      setProfile(data);
      setUser(userFromProfile(data));
      setToken(SESSION_TOKEN);
      setPreferencesState(nextPreferences);
      setAuthError(null);
      savePreferencesCache(data.authId, nextPreferences);
    },
    [savePreferencesCache]
  );

  const applyProfileOrRequireAgreement = useCallback(
    (data: UserProfile) => {
      if (!hasAcceptedLegalAgreement(data)) {
        clearSessionState();
        setLegalAgreementProfile(data);
        setLegalAgreementError(null);
        setAuthError(null);
        return;
      }
      applyProfile(data);
    },
    [applyProfile, clearSessionState]
  );

  const logout = useCallback(() => {
    void logoutSession().catch(() => {
      // The local auth state still clears even if the server session is already gone.
    });
    setAuthError(null);
    setSigningIn(false);
    clearGoogleInteraction();
    setOneTapSuppressed(false);
    setLegalAgreementProfile(null);
    setLegalAgreementError(null);
    clearSessionState();
  }, [clearGoogleInteraction, clearSessionState]);

  useEffect(() => () => clearGoogleInteraction(), [clearGoogleInteraction]);

  const acceptLegalAgreement = useCallback(async () => {
    if (!legalAgreementProfile) {
      return;
    }
    try {
      const data = await acceptUserLegalAgreement();
      applyProfile(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record legal agreement.";
      setLegalAgreementError(message);
      throw error;
    }
  }, [applyProfile, legalAgreementProfile]);

  useEffect(() => {
    let cancelled = false;

    fetchUserProfile()
      .then((data) => {
        if (!cancelled) {
          applyProfileOrRequireAgreement(data);
          setInitializing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSessionState();
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
      const themeChangeHandler = (event: Event) => {
        const nextMode = (event as CustomEvent<"light" | "dark">).detail;
        if (nextMode === "light" || nextMode === "dark") {
          setLoginThemeMode(nextMode);
        }
      };
      window.addEventListener("resize", handler);
      window.addEventListener("storage", storageHandler);
      window.addEventListener(THEME_CHANGE_EVENT, themeChangeHandler);
      return () => {
        cancelled = true;
        window.removeEventListener("resize", handler);
        window.removeEventListener("storage", storageHandler);
        window.removeEventListener(THEME_CHANGE_EVENT, themeChangeHandler);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [applyProfileOrRequireAgreement, clearSessionState]);

  const legalAgreementRequired = Boolean(legalAgreementProfile);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      disableLoginPrompts ||
      initializing ||
      token ||
      legalAgreementRequired ||
      signingIn
    ) {
      return;
    }

    const refreshLoginButton = () => {
      if (googleInteractionInProgressRef.current) {
        return;
      }
      cancelGoogleIdentityPrompt();
      setLoginRenderNonce((current) => current + 1);
    };

    const handlePageHide = () => {
      if (googleInteractionInProgressRef.current) {
        return;
      }
      cancelGoogleIdentityPrompt();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        refreshLoginButton();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (googleInteractionInProgressRef.current) {
          return;
        }
        cancelGoogleIdentityPrompt();
      } else if (document.visibilityState === "visible") {
        refreshLoginButton();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [disableLoginPrompts, initializing, legalAgreementRequired, signingIn, token]);

  const handleSuccess = async (
    credential?: string | undefined,
    source: "button" | "one-tap" = "button"
  ) => {
    startGoogleInteraction(source);
    if (source === "one-tap") {
      setOneTapSuppressed(true);
    }
    if (!credential) {
      clearGoogleInteraction();
      setSigningIn(false);
      setAuthError("Google sign-in failed before a credential was returned. Try again.");
      return;
    }
    try {
      setSigningIn(true);
      setAuthError(null);
      const data = await loginWithGoogleCredential(credential);
      applyProfileOrRequireAgreement(data);
    } catch (error) {
      clearSessionState();
      setLegalAgreementProfile(null);
      setLegalAgreementError(null);
      setAuthError(getLoginErrorMessage(error));
    } finally {
      clearGoogleInteraction();
      setSigningIn(false);
    }
  };

  const loginDisabled =
    disableLoginPrompts || initializing || !mounted || !!token || legalAgreementRequired || signingIn;
  const oneTapLoginDisabled = loginDisabled || oneTapSuppressed;
  const shouldShowLoginButton =
    mounted && !initializing && !disableLoginPrompts && !legalAgreementRequired && !token && !user;

  useGoogleOneTapLogin({
    onSuccess: (response) => void handleSuccess(response.credential, "one-tap"),
    onError: () => {
      if (googleInteractionSourceRef.current === "button") {
        return;
      }
      clearGoogleInteraction();
      setOneTapSuppressed(true);
      cancelGoogleIdentityPrompt();
    },
    promptMomentNotification: (notification) => {
      if (
        notification.isDisplayMoment() &&
        notification.isDisplayed() &&
        !googleInteractionInProgressRef.current
      ) {
        startGoogleInteraction("one-tap");
      }
      if (
        (notification.isSkippedMoment() || notification.isDismissedMoment()) &&
        googleInteractionSourceRef.current !== "button"
      ) {
        clearGoogleInteraction();
      }
    },
    auto_select: true,
    use_fedcm_for_prompt: true,
    use_fedcm_for_button: true,
    cancel_on_tap_outside: false,
    disabled: oneTapLoginDisabled,
  });

  const loginButton = shouldShowLoginButton ? (
    <Stack
      spacing={0.5}
      alignItems="flex-end"
      sx={{ width: `${loginWidth}px` }}
      aria-live="polite"
    >
      {signingIn ? (
        <Button
          disabled
          variant={loginThemeMode === "dark" ? "contained" : "outlined"}
          startIcon={<CircularProgress size={16} color="inherit" />}
          sx={{
            width: "100%",
            height: 44,
            borderRadius: 22,
            textTransform: "none",
          }}
        >
          Signing in...
        </Button>
      ) : (
        <div
          style={{
            width: `${loginWidth}px`,
            height: "44px",
            borderRadius: "22px",
            overflow: "hidden",
          }}
        >
          <GoogleLogin
            key={`${loginWidth}:${loginThemeMode}:${loginRenderNonce}`}
            onSuccess={(response) => void handleSuccess(response.credential, "button")}
            onError={() => {
              clearGoogleInteraction();
              clearSessionState();
              setSigningIn(false);
              setAuthError("Google sign-in failed before a credential was returned. Try again.");
            }}
            text="signin_with"
            theme={loginThemeMode === "dark" ? "filled_black" : "outline"}
            shape="pill"
            width={loginWidth}
            itp_support
            use_fedcm_for_button
            cancel_on_tap_outside={false}
            click_listener={() => startGoogleInteraction("button")}
          />
        </div>
      )}
      {!signingIn && authError && (
        <Typography
          variant="caption"
          color="error"
          sx={{
            lineHeight: 1.2,
            maxWidth: "100%",
            textAlign: "right",
            wordBreak: "normal",
          }}
        >
          Sign-in failed. Try again.
        </Typography>
      )}
    </Stack>
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
        showDetailedTradeTimes: next.showDetailedTradeTimes ?? prev.showDetailedTradeTimes,
        dashboardWidgets: next.dashboardWidgets ?? prev.dashboardWidgets,
        displayCurrency: next.displayCurrency ?? prev.displayCurrency,
        taxCapitalGainsRate: next.taxCapitalGainsRate ?? prev.taxCapitalGainsRate,
        taxPersonalRate: next.taxPersonalRate ?? prev.taxPersonalRate,
      };
    });
    setPreferencesState((prev) => ({
      themeMode: next.themeMode ?? prev?.themeMode ?? null,
      pnlDisplayMode: next.pnlDisplayMode ?? prev?.pnlDisplayMode ?? null,
      defaultTradeSortBy: next.defaultTradeSortBy ?? prev?.defaultTradeSortBy ?? null,
      defaultTradeSortDirection:
        next.defaultTradeSortDirection ?? prev?.defaultTradeSortDirection ?? null,
      showTradeHistory: next.showTradeHistory ?? prev?.showTradeHistory ?? null,
      showDetailedTradeTimes: next.showDetailedTradeTimes ?? prev?.showDetailedTradeTimes ?? null,
      dashboardWidgets: next.dashboardWidgets ?? prev?.dashboardWidgets ?? null,
      displayCurrency: next.displayCurrency ?? prev?.displayCurrency ?? null,
      taxCapitalGainsRate: next.taxCapitalGainsRate ?? prev?.taxCapitalGainsRate ?? null,
      taxPersonalRate: next.taxPersonalRate ?? prev?.taxPersonalRate ?? null,
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
        showDetailedTradeTimes:
          next.showDetailedTradeTimes ?? preferences?.showDetailedTradeTimes ?? null,
        dashboardWidgets: next.dashboardWidgets ?? preferences?.dashboardWidgets ?? null,
        displayCurrency: next.displayCurrency ?? preferences?.displayCurrency ?? null,
        taxCapitalGainsRate: next.taxCapitalGainsRate ?? preferences?.taxCapitalGainsRate ?? null,
        taxPersonalRate: next.taxPersonalRate ?? preferences?.taxPersonalRate ?? null,
      });
    }
  }, [
    preferences?.dashboardWidgets,
    preferences?.defaultTradeSortBy,
    preferences?.defaultTradeSortDirection,
    preferences?.displayCurrency,
    preferences?.pnlDisplayMode,
    preferences?.showDetailedTradeTimes,
    preferences?.showTradeHistory,
    preferences?.taxCapitalGainsRate,
    preferences?.taxPersonalRate,
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
      legalAgreementRequired,
      legalAgreementError,
      acceptLegalAgreement,
    }),
    [
      acceptLegalAgreement,
      authError,
      initializing,
      legalAgreementError,
      legalAgreementRequired,
      loginButton,
      logout,
      preferences,
      profile,
      setPreferences,
      token,
      user,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LegalAgreementDialog
        open={legalAgreementRequired && !suppressLegalAgreementDialog}
        error={legalAgreementError}
        onAccept={acceptLegalAgreement}
        onSignOut={logout}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

function PublicAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={PUBLIC_AUTH_CONTEXT_VALUE}>
      {children}
    </AuthContext.Provider>
  );
}

function LegalAgreementDialog({
  open,
  error,
  onAccept,
  onSignOut,
}: {
  open: boolean;
  error: string | null;
  onAccept: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (open) {
      setChecked(false);
      setAccepting(false);
    }
  }, [open]);

  const handleAccept = async () => {
    if (!checked || accepting) {
      return;
    }
    try {
      setAccepting(true);
      await onAccept();
    } catch {
      // The parent sets the visible error state.
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog
      open={open}
      disableEscapeKeyDown
      aria-labelledby="legal-agreement-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="legal-agreement-title">Terms and Privacy Agreement</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            You must agree to the Terms of Service and Privacy Policy before using tradelog.
          </DialogContentText>
          <FormControlLabel
            control={
              <Checkbox
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
            }
            label={
              <span>
                I agree to the{" "}
                <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </span>
            }
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSignOut} disabled={accepting}>
          Sign out
        </Button>
        <Button variant="contained" onClick={handleAccept} disabled={!checked || accepting}>
          {accepting ? "Saving..." : "Agree and continue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AuthWrapper({
  children,
  disableLoginPrompts = false,
  suppressLegalAgreementDialog = false,
  disableAuthentication = false,
}: {
  children: ReactNode;
  disableLoginPrompts?: boolean;
  suppressLegalAgreementDialog?: boolean;
  disableAuthentication?: boolean;
}) {
  if (disableAuthentication) {
    return <PublicAuthProvider>{children}</PublicAuthProvider>;
  }

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
      <AuthProvider
        disableLoginPrompts={disableLoginPrompts}
        suppressLegalAgreementDialog={suppressLegalAgreementDialog}
      >
        {children}
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
