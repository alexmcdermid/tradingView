// @ts-nocheck
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import React from "react";
import Home from "../routes/home";
import type { Trade } from "../api/types";
import { ApiError } from "../api/client";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ColorModeContext } from "../theme/colorMode";

type AuthState = {
  user: { sub: string } | null;
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
  authError: string | null;
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
  authError: null,
  initializing: false,
  loginButton: <button>Sign in</button>,
  logout: vi.fn(),
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

const mockFetchTrades = vi.fn<() => Promise<{ items: Trade[]; page: number; size: number; totalPages: number; totalElements: number; hasNext: boolean; hasPrevious: boolean }>>();
const mockFetchSummary = vi.fn();
const mockFetchAggregateStats = vi.fn();
const mockCreateTrade = vi.fn();
const mockUpdateTrade = vi.fn();
const mockDeleteTrade = vi.fn();
const mockFetchTradeHistory = vi.fn();
const mockUpdateUserPreferences = vi.fn();
const mockListUserAccounts = vi.fn();
const mockCreateShareLink = vi.fn();
const mockDeleteShareLink = vi.fn();
const mockListUserShareLinks = vi.fn();

const createDataTransfer = () => {
  const store = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    clearData: vi.fn((format?: string) => {
      if (format) {
        store.delete(format);
        return;
      }
      store.clear();
    }),
    getData: vi.fn((format: string) => store.get(format) ?? ""),
    setData: vi.fn((format: string, value: string) => {
      store.set(format, value);
    }),
  };
};

vi.mock("../api/trades", () => ({
  fetchTrades: (...args: Parameters<typeof mockFetchTrades>) => mockFetchTrades(...args),
  fetchSummary: (...args: Parameters<typeof mockFetchSummary>) => mockFetchSummary(...args),
  fetchAggregateStats: (...args: Parameters<typeof mockFetchAggregateStats>) => mockFetchAggregateStats(...args),
  createTrade: (...args: Parameters<typeof mockCreateTrade>) => mockCreateTrade(...args),
  updateTrade: (...args: Parameters<typeof mockUpdateTrade>) => mockUpdateTrade(...args),
  deleteTrade: (...args: Parameters<typeof mockDeleteTrade>) => mockDeleteTrade(...args),
  fetchTradeHistory: (...args: Parameters<typeof mockFetchTradeHistory>) => mockFetchTradeHistory(...args),
}));

vi.mock("../api/users", () => ({
  updateUserPreferences: (...args: Parameters<typeof mockUpdateUserPreferences>) =>
    mockUpdateUserPreferences(...args),
  listUserAccounts: (...args: Parameters<typeof mockListUserAccounts>) =>
    mockListUserAccounts(...args),
  createUserAccount: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

vi.mock("../api/shares", () => ({
  createShareLink: (...args: Parameters<typeof mockCreateShareLink>) =>
    mockCreateShareLink(...args),
  deleteShareLink: (...args: Parameters<typeof mockDeleteShareLink>) =>
    mockDeleteShareLink(...args),
  listUserShareLinks: (...args: Parameters<typeof mockListUserShareLinks>) =>
    mockListUserShareLinks(...args),
}));

describe("Home (guest mode)", () => {
  beforeEach(() => {
    authState.user = null;
    authState.preferences = null;
    authState.token = null;
    authState.authError = null;
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
    mockFetchAggregateStats.mockResolvedValue({
      totalPnl: 0,
      tradeCount: 0,
      bestDay: null,
      bestMonth: null,
      cadToUsdRate: 0.732,
      fxDate: "2024-01-01",
    });
    mockListUserAccounts.mockResolvedValue([]);
    mockCreateShareLink.mockResolvedValue({
      code: "share123",
      shareType: "SUMMARY",
      data: "{}",
      requiresAuth: false,
      expiresAt: "2024-02-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
      accessCount: 0,
    });
    mockListUserShareLinks.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("shows a useful message when sign-in is blocked by the allowlist", () => {
    authState.authError =
      "You're in dev mode, but this Google account is not on the dev allowlist. Contact the repo owner to request access.";
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);

    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    expect(screen.getByText(/not on the dev allowlist/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("lets a guest log a trade locally", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /log trade/i }));

    fireEvent.change(await screen.findByLabelText(/symbol/i), { target: { value: "MSFT" } });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/entry price/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/exit price/i), { target: { value: "110" } });
    fireEvent.change(screen.getByLabelText(/opened/i), { target: { value: "2024-01-01" } });
    fireEvent.change(screen.getByLabelText(/closed/i), { target: { value: "2024-01-02" } });

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("MSFT")).toBeInTheDocument();
    });

    expect(mockCreateTrade).not.toHaveBeenCalled();
    expect(mockUpdateTrade).not.toHaveBeenCalled();
  }, 10000);
});

describe("Home (authenticated)", () => {
  beforeEach(() => {
    authState.user = { sub: "user-1" };
    authState.preferences = { themeMode: "LIGHT", pnlDisplayMode: "PNL" };
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
    mockFetchAggregateStats.mockResolvedValue({
      totalPnl: 1234.56,
      tradeCount: 1,
      bestDay: { period: "2024-01-02", pnl: 100.5, trades: 1 },
      bestMonth: { period: "2024-01", pnl: 1234.56, trades: 1 },
      cadToUsdRate: 0.732,
      fxDate: "2024-01-01",
    });
    mockListUserAccounts.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("loads trades when authenticated", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("TSLA")).toBeInTheDocument();
  });

  it("shows an expired session as a warning instead of an error", async () => {
    mockFetchTrades.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);

    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    const alertText = await screen.findByText("Session expired. Please sign in again.");
    const alert = alertText.closest(".MuiAlert-root");

    expect(authState.logout).toHaveBeenCalled();
    expect(alert?.className).toContain("MuiAlert-colorWarning");
    expect(alert?.className).not.toContain("MuiAlert-colorError");
  });

  it("logs out when creating a share link after the session expires", async () => {
    mockCreateShareLink.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);

    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    const shareButton = await screen.findByRole("button", { name: /share month/i });
    await waitFor(() => {
      expect(shareButton).toBeEnabled();
    });

    await userEvent.click(shareButton);

    expect(await screen.findByText("Session expired. Please sign in again.")).toBeInTheDocument();
    expect(authState.logout).toHaveBeenCalled();
    expect(screen.queryByText("Could not build the share link. Try again.")).not.toBeInTheDocument();
  });

  it("loads aggregate stats when authenticated", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchAggregateStats).toHaveBeenCalledTimes(1);
    });
  });

  it("renders selected dashboard widgets including the tax estimate", async () => {
    authState.preferences = {
      themeMode: "LIGHT",
      pnlDisplayMode: "PNL",
      dashboardWidgets: ["DAILY_AVG_YTD", "TAX_OWED", "TOTAL_REALIZED"],
      taxCapitalGainsRate: 50,
      taxPersonalRate: 40,
    };
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    expect(await screen.findByText(/Daily P\/L Avg YTD/i)).toBeInTheDocument();
    const taxWidget = await screen.findByText(/Tax Owing/i);
    const totalWidget = screen.getByText(/Total Realized P\/L/i);
    expect(taxWidget.compareDocumentPosition(totalWidget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("246.91 USD")).toBeInTheDocument();
    expect(screen.queryByText(/Best Month/i)).not.toBeInTheDocument();
  });

  it("lets users drag dashboard widgets into a custom order from preferences", async () => {
    authState.preferences = {
      themeMode: "LIGHT",
      pnlDisplayMode: "PNL",
      dashboardWidgets: ["TOTAL_REALIZED", "BEST_MONTH", "BEST_DAY"],
      taxCapitalGainsRate: 50,
      taxPersonalRate: 40,
    };
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /user menu/i }));
    await user.click(await screen.findByRole("menuitem", { name: /preferences/i }));

    const dragHandle = await screen.findByLabelText("Drag Total Realized P/L");
    const dropTarget = screen.getByLabelText("Dashboard widget preference Best Day");
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(dropTarget, { dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardWidgets: ["BEST_MONTH", "BEST_DAY", "TOTAL_REALIZED"],
      })
    );
  });

  it("fetches trades for a selected day", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    const user = userEvent.setup();
    const dayButtons = screen.getAllByRole("button", {
      name: /select \d{4}-\d{2}-\d{2}/i,
    });
    const targetButton = dayButtons[0];
    const label = targetButton.getAttribute("aria-label") || "";
    const selectedDate = label.replace(/select\s+/i, "");

    await user.click(targetButton);

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenLastCalledWith(
        0,
        expect.any(Number),
        undefined,
        selectedDate,
        "CLOSED_AT",
        "DESC"
      );
    });
  });

  it("updates trade closed date when dragging a table row onto a calendar day", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    const editButton = await screen.findByRole("button", { name: /edit/i });
    const tradeRow = editButton.closest("tr");
    expect(tradeRow).not.toBeNull();

    const targetDay = screen.getAllByRole("button", {
      name: /select \d{4}-\d{2}-\d{2}/i,
    })[0];
    const label = targetDay.getAttribute("aria-label") || "";
    const targetDate = label.replace(/select\s+/i, "");

    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => {
        store.set(type, value);
      },
      getData: (type: string) => store.get(type) ?? "",
    };

    fireEvent.dragStart(tradeRow as HTMLElement, { dataTransfer });
    fireEvent.dragOver(targetDay, { dataTransfer });
    fireEvent.drop(targetDay, { dataTransfer });

    await waitFor(() => {
      expect(mockUpdateTrade).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({ closedAt: targetDate })
      );
    });
  });

  it("reloads aggregate stats when changing calendar month", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchAggregateStats).toHaveBeenCalledTimes(1);
    });

    const prevButton = screen.getAllByRole("button", { name: /previous month/i })[0];
    await userEvent.click(prevButton);

    await waitFor(() => {
      expect(mockFetchSummary).toHaveBeenCalledTimes(2);
    });

    expect(mockFetchAggregateStats).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard day navigation active after crossing into a new month", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    const user = userEvent.setup();
    const dateButtons = screen.getAllByRole("button", {
      name: /select \d{4}-\d{2}-\d{2}/i,
    });
    const visibleDates = dateButtons
      .map((button) => button.getAttribute("aria-label")?.replace(/select\s+/i, ""))
      .filter((value): value is string => Boolean(value))
      .sort();
    const startDate = visibleDates[visibleDates.length - 1];
    const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
    const start = new Date(`${startDate}T00:00:00Z`);
    const nextDate1 = toIsoDate(new Date(start.getTime() + 24 * 60 * 60 * 1000));
    const nextDate2 = toIsoDate(new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000));

    const startButton = screen.getByRole("button", { name: new RegExp(`select ${startDate}`, "i") });
    await user.click(startButton);
    expect(startButton).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const day1 = await screen.findByRole("button", {
      name: new RegExp(`select ${nextDate1}`, "i"),
    });
    await waitFor(() => {
      expect(day1).toHaveAttribute("aria-pressed", "true");
    });

    await user.keyboard("{ArrowRight}");
    const day2 = await screen.findByRole("button", {
      name: new RegExp(`select ${nextDate2}`, "i"),
    });
    await waitFor(() => {
      expect(day2).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("prefills option expiry from the selected calendar day when logging a trade", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Home /> },
    ]);
    render(
      <ColorModeContext.Provider value={{ mode: "light", setMode: vi.fn(), toggleMode: vi.fn() }}>
        <RouterProvider router={router} />
      </ColorModeContext.Provider>
    );

    await waitFor(() => {
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });

    const user = userEvent.setup();
    const dayButtons = screen.getAllByRole("button", {
      name: /select \d{4}-\d{2}-\d{2}/i,
    });
    const targetButton = dayButtons[0];
    const label = targetButton.getAttribute("aria-label") || "";
    const selectedDate = label.replace(/select\s+/i, "");

    await user.click(targetButton);
    await user.click(screen.getByRole("button", { name: /log trade/i }));

    const closedInput = screen.getByLabelText(/closed/i) as HTMLInputElement;
    expect(closedInput.value).toBe(selectedDate);

    await user.click(screen.getByRole("button", { name: /option/i }));

    const expiryInput = screen.getByLabelText(/expiry/i) as HTMLInputElement;
    expect(expiryInput.value).toBe(selectedDate);
  });
});
