// @ts-nocheck
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import React from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import Admin from "../routes/admin";
import type { AdminUser } from "../api/types";

type AuthState = {
  user: { sub: string; email?: string } | null;
  token: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
  logout: () => void;
};

const authState: AuthState = {
  user: null,
  token: null,
  initializing: false,
  loginButton: <button>Sign in</button>,
  logout: vi.fn(),
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

const mockFetchUsers = vi.fn<() => Promise<AdminUser[]>>();

vi.mock("../api/users", () => ({
  fetchUsers: (...args: Parameters<typeof mockFetchUsers>) => mockFetchUsers(...args),
}));

describe("Admin", () => {
  beforeEach(() => {
    authState.user = null;
    authState.token = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("prompts login when not authenticated", () => {
    const router = createMemoryRouter([{ path: "/admin", element: <Admin /> }], {
      initialEntries: ["/admin"],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByText(/sign in to view admin users/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(mockFetchUsers).not.toHaveBeenCalled();
  });

  it("lists users when authenticated", async () => {
    authState.user = { sub: "admin-1", email: "admin@example.com" };
    authState.token = "token";
    mockFetchUsers.mockResolvedValue([
      {
        id: "user-1",
        authId: "admin@example.com",
        email: "admin@example.com",
        premium: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    ]);

    const router = createMemoryRouter([{ path: "/admin", element: <Admin /> }], {
      initialEntries: ["/admin"],
    });
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalledTimes(1);
    });
    expect(screen.getAllByText("admin@example.com")).toHaveLength(2);
  });
});
