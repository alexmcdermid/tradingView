// @ts-nocheck
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import React from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import Admin from "../routes/admin";
import type { AdminUser } from "../api/types";
import { ColorModeContext } from "../theme/colorMode";

type AuthState = {
  user: { sub: string; email?: string } | null;
  profile: { id: string } | null;
  preferences: {
    themeMode?: string | null;
    pnlDisplayMode?: string | null;
    defaultTradeSortBy?: string | null;
    defaultTradeSortDirection?: string | null;
  } | null;
  setPreferences: (preferences: {
    themeMode?: string | null;
    pnlDisplayMode?: string | null;
    defaultTradeSortBy?: string | null;
    defaultTradeSortDirection?: string | null;
  }) => void;
  token: string | null;
  initializing: boolean;
  loginButton: React.ReactNode;
  logout: () => void;
};

const authState: AuthState = {
  user: null,
  profile: null,
  preferences: null,
  setPreferences: vi.fn(),
  token: null,
  initializing: false,
  loginButton: <button>Sign in</button>,
  logout: vi.fn(),
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

const mockFetchUsers = vi.fn<() => Promise<AdminUser[]>>();
const mockFetchUserTradeHistory = vi.fn();

vi.mock("../api/users", () => ({
  fetchUsers: (...args: Parameters<typeof mockFetchUsers>) => mockFetchUsers(...args),
  fetchUserTradeHistory: (...args: Parameters<typeof mockFetchUserTradeHistory>) =>
    mockFetchUserTradeHistory(...args),
}));

describe("Admin", () => {
  beforeEach(() => {
    authState.user = null;
    authState.preferences = null;
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
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

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
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
    expect(mockFetchUsers).toHaveBeenCalledTimes(1);
    });
    expect(screen.getAllByText("admin@example.com")).toHaveLength(2);
  });

  it("loads trade history for a selected user", async () => {
    authState.user = { sub: "admin-1", email: "admin@example.com" };
    authState.token = "token";
    mockFetchUsers.mockResolvedValue([
      {
        id: "user-1",
        authId: "target-user",
        email: "target@example.com",
        premium: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    ]);
    mockFetchUserTradeHistory.mockResolvedValue([
      {
        id: "history-1",
        tradeId: "trade-1",
        action: "EDIT",
        userId: "target-user",
        symbol: "AAPL",
        currency: "USD",
        assetType: "STOCK",
        direction: "LONG",
        quantity: 10,
        entryPrice: 100,
        exitPrice: 110,
        fees: 0,
        marginRate: 0,
        realizedPnl: 100,
        openedAt: "2024-01-01",
        closedAt: "2024-01-02",
        notes: null,
        tradeCreatedAt: "2024-01-01T00:00:00Z",
        tradeUpdatedAt: "2024-01-02T00:00:00Z",
        actionAt: "2024-01-02T00:00:00Z",
      },
    ]);

    const router = createMemoryRouter([{ path: "/admin", element: <Admin /> }], {
      initialEntries: ["/admin"],
    });
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await userEvent.click(await screen.findByRole("button", { name: /view/i }));

    expect(mockFetchUserTradeHistory).toHaveBeenCalledWith("user-1");
    expect(await screen.findByText("trade-1")).toBeInTheDocument();
    expect(screen.getByText("EDIT")).toBeInTheDocument();
  });
});
