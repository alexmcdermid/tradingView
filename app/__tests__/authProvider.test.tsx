import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, AuthWrapper, useAuth } from "../auth/AuthProvider";
import { loginWithGoogleCredential, logoutSession } from "../api/auth";
import { acceptUserLegalAgreement, fetchUserProfile } from "../api/users";
import type { UserProfile } from "../api/types";
import { THEME_CHANGE_EVENT } from "../theme/colorMode";

const originalMatchMedia = window.matchMedia;

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGoogleOAuth: () => ({ clientId: "test-client-id", scriptLoadedSuccessfully: true }),
}));

vi.mock("../api/auth", () => ({
  loginWithGoogleCredential: vi.fn(),
  logoutSession: vi.fn(),
}));

vi.mock("../api/users", () => ({
  fetchUserProfile: vi.fn(),
  acceptUserLegalAgreement: vi.fn(),
}));

function AuthProbe() {
  const {
    legalAgreementError,
    legalAgreementRequired,
    loginButton,
    preferences,
    profile,
    setPreferences,
    user,
  } = useAuth();
  return (
    <div>
      <span>Auth ready</span>
      <span data-testid="auth-user">{user?.sub ?? "none"}</span>
      <span data-testid="legal-required">{legalAgreementRequired ? "yes" : "no"}</span>
      <span data-testid="legal-error">{legalAgreementError ?? "none"}</span>
      <span data-testid="preferences-currency">{preferences?.displayCurrency ?? "none"}</span>
      <span data-testid="profile-currency">{profile?.displayCurrency ?? "none"}</span>
      <button type="button" onClick={() => setPreferences({ displayCurrency: "CAD" })}>
        Set CAD
      </button>
      {loginButton}
    </div>
  );
}

function acceptedProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-id",
    authId: "auth-id",
    email: "trader@example.com",
    admin: false,
    premium: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    themeMode: "LIGHT",
    pnlDisplayMode: "PNL",
    defaultTradeSortBy: "CLOSED_AT",
    defaultTradeSortDirection: "DESC",
    showTradeHistory: true,
    showDetailedTradeTimes: false,
    dashboardWidgets: ["TOTAL_REALIZED"],
    displayCurrency: "USD",
    taxCapitalGainsRate: 50,
    taxPersonalRate: 40,
    termsAcceptedAt: "2024-01-01T00:00:00Z",
    privacyPolicyAcceptedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

type GoogleIdConfig = {
  callback?: (response: { credential?: string }) => void;
  [option: string]: unknown;
};

type GoogleButtonOptions = {
  click_listener?: () => void;
  theme?: "filled_black" | "outline";
  [option: string]: unknown;
};

function installGoogleIdentity() {
  const googleId = {
    initialize: vi.fn<(config: GoogleIdConfig) => void>(),
    renderButton: vi.fn<(parent: HTMLElement, options: GoogleButtonOptions) => void>(
      (parent) => {
        parent.innerHTML = "<button>Google Login</button>";
      }
    ),
    prompt: vi.fn(),
    cancel: vi.fn(),
  };
  Object.defineProperty(window, "google", {
    configurable: true,
    value: { accounts: { id: googleId } },
  });
  return googleId;
}

let googleId: ReturnType<typeof installGoogleIdentity>;

function sendGoogleCredential(response: { credential?: string }) {
  googleId.initialize.mock.calls.at(-1)?.[0].callback?.(response);
}

function latestButtonOptions() {
  return googleId.renderButton.mock.calls.at(-1)?.[1];
}

function dispatchVisibilityChange(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function mockMatchMedia(matchesByQuery: Record<string, boolean>) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.mocked(fetchUserProfile).mockResolvedValue(null);
    vi.mocked(loginWithGoogleCredential).mockReset();
    vi.mocked(acceptUserLegalAgreement).mockReset();
    vi.mocked(logoutSession).mockResolvedValue(undefined);
    window.localStorage.clear();
    googleId = installGoogleIdentity();
  });

  afterEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "google");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    cleanup();
  });

  it("disables Google login prompts on public share routes", async () => {
    render(
      <AuthProvider disableLoginPrompts>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByText("Auth ready")).toBeInTheDocument();
    await act(async () => {});

    expect(fetchUserProfile).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /google login/i })).not.toBeInTheDocument();
    expect(googleId.renderButton).not.toHaveBeenCalled();
    expect(googleId.prompt).not.toHaveBeenCalled();
  });

  it("does not initialize Google auth on legal review pages", () => {
    render(
      <AuthWrapper disableAuthentication>
        <AuthProbe />
      </AuthWrapper>
    );

    expect(screen.getByText("Auth ready")).toBeInTheDocument();
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
    expect(screen.queryByRole("button", { name: /google login/i })).not.toBeInTheDocument();
    expect(fetchUserProfile).not.toHaveBeenCalled();
    expect(googleId.initialize).not.toHaveBeenCalled();
    expect(googleId.prompt).not.toHaveBeenCalled();
  });

  it("keeps FedCM enabled for low-click Google sign-in", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });

    expect(googleId.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        client_id: "test-client-id",
        auto_select: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true,
      })
    );
    expect(googleId.prompt).toHaveBeenCalled();
  });

  it("initializes Google Identity once for the button and One Tap", async () => {
    render(
      <React.StrictMode>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
      expect(googleId.prompt).toHaveBeenCalled();
    });

    expect(googleId.initialize).toHaveBeenCalledTimes(1);
    // A prompt status listener makes GSI log a FedCM migration warning.
    expect(googleId.prompt.mock.calls.every((args) => args.length === 0)).toBe(true);
  });

  it("keeps the Google button aligned with same-page theme changes", async () => {
    mockMatchMedia({ "(prefers-color-scheme: dark)": true });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestButtonOptions()?.theme).toBe("outline");
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: "dark" }));
    });

    await waitFor(() => {
      expect(latestButtonOptions()?.theme).toBe("filled_black");
    });
    expect(googleId.initialize).toHaveBeenCalledTimes(1);
  });

  it("keeps mobile one-tap prompts enabled with the explicit Google button available", async () => {
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(max-width: 640px)": true,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: /google login/i })).toBeInTheDocument();
    expect(googleId.prompt).toHaveBeenCalled();
    expect(googleId.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auto_select: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true,
      })
    );
  });

  it("suppresses repeated one-tap prompts after an empty one-tap credential", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.prompt).toHaveBeenCalledTimes(1);
    });

    act(() => {
      sendGoogleCredential({});
    });

    expect(await screen.findByText("Sign-in failed. Try again.")).toBeInTheDocument();
    expect(googleId.cancel).toHaveBeenCalled();
    expect(googleId.prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /google login/i })).toBeInTheDocument();
  });

  it("remounts the Google button after a cached page is restored", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });
    const initialRenderCount = googleId.renderButton.mock.calls.length;
    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });

    act(() => {
      window.dispatchEvent(pageShow);
    });

    await waitFor(() => {
      expect(googleId.renderButton.mock.calls.length).toBeGreaterThan(initialRenderCount);
    });
    expect(googleId.cancel).toHaveBeenCalled();
    expect(googleId.initialize).toHaveBeenCalledTimes(1);
  });

  it("does not cancel or remount FedCM while an explicit Google button flow is active", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });

    const initialRenderCount = googleId.renderButton.mock.calls.length;

    act(() => {
      latestButtonOptions()?.click_listener?.();
      dispatchVisibilityChange("hidden");
      dispatchVisibilityChange("visible");
    });

    expect(googleId.cancel).not.toHaveBeenCalled();
    expect(googleId.renderButton.mock.calls.length).toBe(initialRenderCount);

    act(() => {
      sendGoogleCredential({});
      dispatchVisibilityChange("hidden");
    });

    expect(googleId.cancel).toHaveBeenCalled();
  });

  it("does not render or initialize Google sign-in while restoring an existing session", async () => {
    let resolveProfile!: (profile: UserProfile) => void;
    vi.mocked(fetchUserProfile).mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveProfile = resolve;
      })
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.queryByRole("button", { name: /google login/i })).not.toBeInTheDocument();
    expect(googleId.initialize).not.toHaveBeenCalled();
    expect(googleId.prompt).not.toHaveBeenCalled();

    await act(async () => {
      resolveProfile(acceptedProfile());
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-user")).toHaveTextContent("auth-id");
    });
    expect(googleId.initialize).not.toHaveBeenCalled();
    expect(googleId.renderButton).not.toHaveBeenCalled();
    expect(googleId.prompt).not.toHaveBeenCalled();
  });

  it("shows a pending state while the backend verifies Google sign-in", async () => {
    let resolveLogin!: (profile: UserProfile) => void;
    vi.mocked(loginWithGoogleCredential).mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveLogin = resolve;
      })
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });

    act(() => {
      latestButtonOptions()?.click_listener?.();
      sendGoogleCredential({ credential: "google-token" });
    });

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /google login/i })).not.toBeInTheDocument();
    expect(loginWithGoogleCredential).toHaveBeenCalledWith("google-token");

    await act(async () => {
      resolveLogin(acceptedProfile());
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-user")).toHaveTextContent("auth-id");
    });
    expect(screen.queryByRole("button", { name: /signing in/i })).not.toBeInTheDocument();
  });

  it("returns to the Google button and shows a compact failure state when sign-in fails", async () => {
    vi.mocked(loginWithGoogleCredential).mockRejectedValue(new Error("backend unavailable"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleId.renderButton).toHaveBeenCalled();
    });

    act(() => {
      latestButtonOptions()?.click_listener?.();
      sendGoogleCredential({ credential: "google-token" });
    });

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();

    expect(await screen.findByText("Sign-in failed. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /google login/i })).toBeInTheDocument();
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
  });

  it("falls back to signed out when the profile check fails", async () => {
    vi.mocked(fetchUserProfile).mockRejectedValue(new Error("Request failed with status 401"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(await screen.findByRole("button", { name: /google login/i })).toBeInTheDocument();
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
  });

  it("applies display currency preference updates without waiting for a profile reload", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue(acceptedProfile());

    render(
      <AuthProvider disableLoginPrompts>
        <AuthProbe />
      </AuthProvider>
    );

    expect(await screen.findByTestId("preferences-currency")).toHaveTextContent("USD");
    expect(screen.getByTestId("profile-currency")).toHaveTextContent("USD");

    fireEvent.click(screen.getByRole("button", { name: /set cad/i }));

    expect(screen.getByTestId("preferences-currency")).toHaveTextContent("CAD");
    expect(screen.getByTestId("profile-currency")).toHaveTextContent("CAD");
    expect(window.localStorage.getItem("user-preferences:auth-id")).toContain('"displayCurrency":"CAD"');
  });

  it("requires legal agreement before exposing an authenticated profile", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue({
      id: "user-id",
      authId: "auth-id",
      email: "trader@example.com",
      admin: false,
      premium: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      displayCurrency: "USD",
    });
    vi.mocked(acceptUserLegalAgreement).mockResolvedValue({
      id: "user-id",
      authId: "auth-id",
      email: "trader@example.com",
      admin: false,
      premium: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      displayCurrency: "USD",
      termsAcceptedAt: "2024-01-02T00:00:00Z",
      privacyPolicyAcceptedAt: "2024-01-02T00:00:00Z",
    });

    render(
      <AuthProvider disableLoginPrompts>
        <AuthProbe />
      </AuthProvider>
    );

    expect(await screen.findByText("Terms and Privacy Agreement")).toBeInTheDocument();
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
    expect(screen.getByTestId("legal-required")).toHaveTextContent("yes");
    expect(screen.getByRole("button", { name: /agree and continue/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /i agree/i }));
    fireEvent.click(screen.getByRole("button", { name: /agree and continue/i }));

    await waitFor(() => {
      expect(acceptUserLegalAgreement).toHaveBeenCalled();
      expect(screen.getByTestId("auth-user")).toHaveTextContent("auth-id");
    });
    expect(screen.getByTestId("legal-required")).toHaveTextContent("no");
  });

  it("keeps legal review pages readable while agreement is pending", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue({
      id: "user-id",
      authId: "auth-id",
      email: "trader@example.com",
      admin: false,
      premium: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      displayCurrency: "USD",
    });

    render(
      <AuthProvider disableLoginPrompts suppressLegalAgreementDialog>
        <AuthProbe />
        <main>Legal document content</main>
      </AuthProvider>
    );

    expect(await screen.findByText("Legal document content")).toBeInTheDocument();
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
    await waitFor(() => {
      expect(screen.getByTestId("legal-required")).toHaveTextContent("yes");
    });
    expect(screen.queryByText("Terms and Privacy Agreement")).not.toBeInTheDocument();
  });

  it("logs out when a pending legal agreement is declined", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue({
      id: "user-id",
      authId: "auth-id",
      email: "trader@example.com",
      admin: false,
      premium: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      displayCurrency: "USD",
    });

    render(
      <AuthProvider disableLoginPrompts>
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(logoutSession).toHaveBeenCalled();
      expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("legal-required")).toHaveTextContent("no");
  });
});
