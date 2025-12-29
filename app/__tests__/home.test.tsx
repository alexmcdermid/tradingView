// @ts-nocheck
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import React from "react";
import Home from "../routes/home";
import type { Trade } from "../api/types";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

type AuthState = {
  user: { sub: string } | null;
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

const mockFetchTrades = vi.fn<() => Promise<{ items: Trade[]; page: number; size: number; totalPages: number; totalElements: number; hasNext: boolean; hasPrevious: boolean }>>();
const mockFetchSummary = vi.fn();
const mockCreateTrade = vi.fn();
const mockUpdateTrade = vi.fn();
const mockDeleteTrade = vi.fn();

vi.mock("../api/trades", () => ({
  fetchTrades: (...args: Parameters<typeof mockFetchTrades>) => mockFetchTrades(...args),
  fetchSummary: (...args: Parameters<typeof mockFetchSummary>) => mockFetchSummary(...args),
  createTrade: (...args: Parameters<typeof mockCreateTrade>) => mockCreateTrade(...args),
  updateTrade: (...args: Parameters<typeof mockUpdateTrade>) => mockUpdateTrade(...args),
  deleteTrade: (...args: Parameters<typeof mockDeleteTrade>) => mockDeleteTrade(...args),
}));

describe("Home (guest mode)", () => {
  beforeEach(() => {
    authState.user = null;
    authState.token = null;
    mockFetchTrades.mockResolvedValue({
      items: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    });
    mockFetchSummary.mockResolvedValue({
      totalPnl: 0,
      tradeCount: 0,
      daily: [],
      monthly: [],
      cadToUsdRate: 0.732,
      fxDate: "2024-01-01",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("lets a guest log a trade locally", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole("button", { name: /log trade/i }));

    await userEvent.type(screen.getByLabelText(/symbol/i), "MSFT");
    await userEvent.type(screen.getByLabelText(/quantity/i), "10");
    await userEvent.type(screen.getByLabelText(/entry price/i), "100");
    await userEvent.type(screen.getByLabelText(/exit price/i), "110");
    await userEvent.type(screen.getByLabelText(/opened/i), "2024-01-01");
    await userEvent.type(screen.getByLabelText(/closed/i), "2024-01-02");

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("MSFT")).toBeInTheDocument();
    });

    expect(mockCreateTrade).not.toHaveBeenCalled();
    expect(mockUpdateTrade).not.toHaveBeenCalled();
  });
});

describe("Home (authenticated)", () => {
  beforeEach(() => {
    authState.user = { sub: "user-1" };
    authState.token = "token";
    mockFetchTrades.mockResolvedValue({
      items: [
        {
          id: "1",
          symbol: "TSLA",
          currency: "USD",
          assetType: "STOCK",
          direction: "LONG",
          quantity: 1,
          entryPrice: 10,
          exitPrice: 12,
          fees: 0,
          realizedPnl: 2,
          openedAt: "2024-01-01",
          closedAt: "2024-01-02",
          createdAt: "2024-01-02",
          updatedAt: "2024-01-02",
          optionType: null,
          strikePrice: null,
          expiryDate: null,
          notes: null,
        },
      ],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
    mockFetchSummary.mockResolvedValue({
      totalPnl: 2,
      tradeCount: 1,
      daily: [{ period: "2024-01-02", pnl: 2, trades: 1 }],
      monthly: [{ period: "2024-01", pnl: 2, trades: 1 }],
      cadToUsdRate: 0.732,
      fxDate: "2024-01-01",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("loads trades when authenticated", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("TSLA")).toBeInTheDocument();
  });
});
