import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, AuthWrapper, useAuth } from "../auth/AuthProvider";
import { logoutSession } from "../api/auth";
import { acceptUserLegalAgreement, fetchUserProfile } from "../api/users";

const googleMocks = vi.hoisted(() => ({
  useGoogleOneTapLogin: vi.fn(),
  GoogleLogin: vi.fn(() => <button>Google Login</button>),
}));

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: googleMocks.GoogleLogin,
  useGoogleOneTapLogin: googleMocks.useGoogleOneTapLogin,
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

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.mocked(fetchUserProfile).mockRejectedValue(new Error("No active session"));
    vi.mocked(acceptUserLegalAgreement).mockReset();
    vi.mocked(logoutSession).mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "google");
    cleanup();
  });

  it("disables Google login prompts on public share routes", async () => {
    render(
      <AuthProvider disableLoginPrompts>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByText("Auth ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /google login/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(googleMocks.useGoogleOneTapLogin).toHaveBeenCalled();
    });
    expect(googleMocks.useGoogleOneTapLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true })
    );
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
    expect(googleMocks.GoogleLogin).not.toHaveBeenCalled();
    expect(googleMocks.useGoogleOneTapLogin).not.toHaveBeenCalled();
  });

  it("keeps FedCM enabled for low-click Google sign-in", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleMocks.GoogleLogin).toHaveBeenCalled();
    });

    expect(googleMocks.GoogleLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({ use_fedcm_for_button: true }),
      undefined
    );
    expect(googleMocks.useGoogleOneTapLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auto_select: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true,
      })
    );
  });

  it("remounts the Google button after a cached page is restored", async () => {
    const cancel = vi.fn();
    Object.defineProperty(window, "google", {
      configurable: true,
      value: { accounts: { id: { cancel } } },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleMocks.GoogleLogin).toHaveBeenCalled();
    });
    const initialRenderCount = googleMocks.GoogleLogin.mock.calls.length;
    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });

    window.dispatchEvent(pageShow);

    await waitFor(() => {
      expect(googleMocks.GoogleLogin.mock.calls.length).toBeGreaterThan(initialRenderCount);
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("does not cancel FedCM when the explicit Google button is clicked", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(googleMocks.GoogleLogin).toHaveBeenCalled();
    });

    const props = (googleMocks.GoogleLogin.mock.calls.at(-1) as
      | [{ click_listener?: () => void }]
      | undefined)?.[0];
    expect(props?.click_listener).toBeUndefined();
  });

  it("applies display currency preference updates without waiting for a profile reload", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue({
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
      dashboardWidgets: ["TOTAL_REALIZED"],
      displayCurrency: "USD",
      taxCapitalGainsRate: 50,
      taxPersonalRate: 40,
      termsAcceptedAt: "2024-01-01T00:00:00Z",
      privacyPolicyAcceptedAt: "2024-01-01T00:00:00Z",
    });

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
