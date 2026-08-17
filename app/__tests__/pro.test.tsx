// @ts-nocheck
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import Pro from "../routes/pro";

type AuthState = {
  user: { sub: string; email?: string | null; name?: string | null } | null;
  profile: { id: string; premium?: boolean | null } | null;
  token: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
};

const authState: AuthState = {
  user: null,
  profile: null,
  token: null,
  initializing: false,
  loginButton: <button>Sign in</button>,
};

const mockCreateBillingCheckoutSession = vi.fn();
const mockCreateBillingPortalSession = vi.fn();

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../api/billing", () => ({
  createBillingCheckoutSession: (...args: Parameters<typeof mockCreateBillingCheckoutSession>) =>
    mockCreateBillingCheckoutSession(...args),
  createBillingPortalSession: (...args: Parameters<typeof mockCreateBillingPortalSession>) =>
    mockCreateBillingPortalSession(...args),
}));

function renderPro(initialEntry = "/pro") {
  const router = createMemoryRouter(
    [
      { path: "/pro", element: <Pro /> },
      { path: "/", element: <div>Home</div> },
    ],
    { initialEntries: [initialEntry] }
  );
  render(<RouterProvider router={router} />);
}

describe("Pro route", () => {
  beforeEach(() => {
    authState.user = null;
    authState.profile = null;
    authState.token = null;
    authState.initializing = false;
    authState.loginButton = <button>Sign in</button>;
    mockCreateBillingCheckoutSession.mockReset();
    mockCreateBillingPortalSession.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("markets the trade cap and disables checkout until the user signs in", () => {
    renderPro();

    expect(
      screen.getByRole("heading", { name: /unlock the trade cap when your journal gets serious/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/free-plan ceiling/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to connect pro to your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start pro/i })).toBeDisabled();
  });

  it("shows checkout return state after Stripe redirects back", () => {
    renderPro("/pro?checkout=success");
    expect(screen.getByText(/checkout completed/i)).toBeInTheDocument();

    cleanup();

    renderPro("/pro?checkout=cancelled");
    expect(screen.getByText(/checkout was cancelled/i)).toBeInTheDocument();
  });

  it("starts checkout for signed-in non-premium users and maps setup errors", async () => {
    authState.user = { sub: "user-1", email: "trader@example.com" };
    authState.profile = { id: "profile-1", premium: false };
    authState.token = "cookie-session";
    mockCreateBillingCheckoutSession.mockRejectedValueOnce(
      new ApiError("Stripe checkout is not configured", 503)
    );

    renderPro();

    await userEvent.click(screen.getByRole("button", { name: /start pro/i }));

    await waitFor(() => {
      expect(mockCreateBillingCheckoutSession).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/subscription setup is still pending/i)).toBeInTheDocument();
    expect(mockCreateBillingPortalSession).not.toHaveBeenCalled();
  });

  it("opens billing management for premium users and maps missing customer errors", async () => {
    authState.user = { sub: "user-1", email: "trader@example.com" };
    authState.profile = { id: "profile-1", premium: true };
    authState.token = "cookie-session";
    mockCreateBillingPortalSession.mockRejectedValueOnce(
      new ApiError("No Stripe customer is linked to this account", 409)
    );

    renderPro();

    expect(screen.getByText(/pro active/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /manage billing/i }));

    await waitFor(() => {
      expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/billing portal is not linked/i)).toBeInTheDocument();
    expect(mockCreateBillingCheckoutSession).not.toHaveBeenCalled();
  });

  it("keeps users in the app from the secondary action", async () => {
    renderPro();

    await userEvent.click(screen.getByRole("link", { name: /keep journaling/i }));

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });
});
