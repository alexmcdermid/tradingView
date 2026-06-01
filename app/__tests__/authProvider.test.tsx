import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { fetchUserProfile } from "../api/users";

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
}));

function AuthProbe() {
  const { loginButton, preferences, profile, setPreferences } = useAuth();
  return (
    <div>
      <span>Auth ready</span>
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
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it("applies display currency preference updates without waiting for a profile reload", async () => {
    vi.mocked(fetchUserProfile).mockResolvedValue({
      id: "user-id",
      authId: "auth-id",
      email: "trader@example.com",
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
});
