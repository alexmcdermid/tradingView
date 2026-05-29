import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  const { loginButton } = useAuth();
  return (
    <div>
      <span>Auth ready</span>
      {loginButton}
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.mocked(fetchUserProfile).mockRejectedValue(new Error("No active session"));
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
});
