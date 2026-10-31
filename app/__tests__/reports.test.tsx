import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type BlobDownload } from "../api/client";
import type {
  AnnualSummary,
  ReportFilters,
  SummaryRow,
  TaxYearCheckoutResponse,
  TaxYearExportRequest,
  TaxYearOverview,
  TaxYearOverviewItem,
  TaxYearPass,
  TradingAccount,
} from "../api/types";
import Reports, { EXPORT_DISCLOSURE, PENDING_CHECKOUT_YEAR_STORAGE_KEY } from "../routes/reports";

type AuthState = {
  user: { sub: string; email?: string } | null;
  token: string | null;
  initializing: boolean;
  loginButton: ReactNode;
  logout: () => void;
};

const authState: AuthState = {
  user: null,
  token: null,
  initializing: false,
  loginButton: <button>Sign in</button>,
  logout: () => {},
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

const mockFetchTaxYearOverview = vi.fn<() => Promise<TaxYearOverview>>();
const mockFetchAnnualSummary =
  vi.fn<(taxYear: number, filters: ReportFilters) => Promise<AnnualSummary>>();
const mockDownloadTaxYearExport =
  vi.fn<(taxYear: number, exportRequest: TaxYearExportRequest) => Promise<BlobDownload>>();
const mockFetchTaxYearPasses = vi.fn<() => Promise<TaxYearPass[]>>();
const mockStartTaxYearCheckout = vi.fn<(taxYear: number) => Promise<TaxYearCheckoutResponse>>();
const mockListUserAccounts = vi.fn<() => Promise<TradingAccount[]>>();

vi.mock("../api/reports", () => ({
  fetchTaxYearOverview: () => mockFetchTaxYearOverview(),
  fetchAnnualSummary: (taxYear: number, filters: ReportFilters) =>
    mockFetchAnnualSummary(taxYear, filters),
  downloadTaxYearExport: (taxYear: number, exportRequest: TaxYearExportRequest) =>
    mockDownloadTaxYearExport(taxYear, exportRequest),
}));

vi.mock("../api/billing", () => ({
  fetchTaxYearPasses: () => mockFetchTaxYearPasses(),
  startTaxYearCheckout: (taxYear: number) => mockStartTaxYearCheckout(taxYear),
}));

vi.mock("../api/users", () => ({
  listUserAccounts: () => mockListUserAccounts(),
}));

const DEFAULT_FILTERS: ReportFilters = {
  accountIds: [],
  includeUnassigned: true,
  symbols: [],
  assetTypes: [],
  currencies: [],
  directions: [],
};

function yearItem(taxYear: number, overrides: Partial<TaxYearOverviewItem> = {}): TaxYearOverviewItem {
  return {
    taxYear,
    closedTradeCount: 0,
    passStatus: null,
    unlocked: false,
    purchasable: true,
    ...overrides,
  };
}

function buildOverview(overrides: Partial<TaxYearOverview> = {}): TaxYearOverview {
  return {
    currentTaxYear: 2026,
    checkoutEnabled: true,
    price: { amountCents: 3900, currency: "CAD" },
    years: [
      yearItem(2026, { closedTradeCount: 120 }),
      yearItem(2025, { closedTradeCount: 412 }),
    ],
    ...overrides,
  };
}

function unlockedOverview() {
  return buildOverview({
    years: [
      yearItem(2026, { closedTradeCount: 120 }),
      yearItem(2025, {
        closedTradeCount: 412,
        passStatus: "PAID",
        unlocked: true,
        purchasable: false,
      }),
    ],
  });
}

function summaryRow(overrides: Partial<SummaryRow>): SummaryRow {
  return {
    key: "ALL",
    label: "All trades",
    currency: "USD",
    taxFree: null,
    tradeCount: 0,
    winningTrades: 0,
    losingTrades: 0,
    gains: 0,
    losses: 0,
    fees: 0,
    marginInterest: 0,
    netRealizedPnl: 0,
    ...overrides,
  };
}

function buildSummary(overrides: Partial<AnnualSummary> = {}): AnnualSummary {
  const usdTotals = summaryRow({
    currency: "USD",
    tradeCount: 31,
    winningTrades: 19,
    losingTrades: 11,
    gains: 4210.55,
    losses: -1980.1,
    fees: 61.25,
    marginInterest: 3.1,
    netRealizedPnl: 2230.45,
  });
  const cadTotals = summaryRow({
    currency: "CAD",
    tradeCount: 10,
    winningTrades: 4,
    losingTrades: 6,
    gains: 300,
    losses: -800,
    fees: 20,
    netRealizedPnl: -500,
  });
  return {
    taxYear: 2025,
    tradeCount: 41,
    firstClosedOn: "2025-01-03",
    lastClosedOn: "2025-12-30",
    repurchaseFlagCount: 7,
    totals: [cadTotals, usdTotals],
    months: [
      { ...usdTotals, key: "2025-01", label: "2025-01" },
      { ...cadTotals, key: "2025-02", label: "2025-02" },
    ],
    accounts: [
      { ...cadTotals, key: "acct-tfsa", label: "TFSA", taxFree: true },
      { ...usdTotals, key: "UNASSIGNED", label: "Unassigned", taxFree: false },
    ],
    symbols: Array.from({ length: 11 }, (_, index) =>
      summaryRow({
        key: `SYM${index + 1}`,
        label: `SYM${index + 1}`,
        tradeCount: 1,
        netRealizedPnl: 100 - index,
      })
    ),
    assetTypes: [{ ...usdTotals, key: "STOCK", label: "Stocks" }],
    taxTreatment: [
      { ...usdTotals, key: "TAXABLE", label: "Taxable accounts", taxFree: false },
      { ...cadTotals, key: "TAX_FREE", label: "Tax-free accounts", taxFree: true },
    ],
    ...overrides,
  };
}

function account(id: string, name: string, taxFree = false): TradingAccount {
  return {
    id,
    name,
    taxFree,
    defaultStockFees: 0,
    defaultOptionFees: 0,
    defaultMarginRateUsd: 0,
    defaultMarginRateCad: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
    value
  );
}

function renderReports(initialEntry = "/reports") {
  const router = createMemoryRouter(
    [
      { path: "/reports", element: <Reports /> },
      { path: "/", element: <div>Home page</div> },
    ],
    { initialEntries: [initialEntry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

function useFakeTimersWithUser() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("Reports route", () => {
  beforeEach(() => {
    authState.user = { sub: "user-1", email: "trader@example.com" };
    authState.token = "cookie-session";
    authState.initializing = false;
    authState.logout = vi.fn();
    mockFetchTaxYearOverview.mockReset().mockResolvedValue(buildOverview());
    mockFetchTaxYearPasses.mockReset().mockResolvedValue([]);
    mockListUserAccounts.mockReset().mockResolvedValue([]);
    mockFetchAnnualSummary.mockReset().mockResolvedValue(buildSummary());
    mockDownloadTaxYearExport.mockReset().mockResolvedValue({
      blob: new Blob(["trade_id\r\n"], { type: "text/csv" }),
      filename: "tradelog-2025-trade-ledger.csv",
    });
    mockStartTaxYearCheckout.mockReset();
    window.sessionStorage.clear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:tradelog-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("prompts sign-in without calling the API when signed out", () => {
    authState.user = null;
    authState.token = null;

    renderReports();

    expect(screen.getByRole("heading", { name: "Tax reports" })).toBeInTheDocument();
    expect(screen.getByText(/one-time payment per tax year, no subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to view your tax years/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(mockFetchTaxYearOverview).not.toHaveBeenCalled();
    expect(mockFetchTaxYearPasses).not.toHaveBeenCalled();
  });

  it("lists tax years newest first and defaults to the newest unlocked year", async () => {
    mockFetchTaxYearOverview.mockResolvedValue(unlockedOverview());

    renderReports();

    const tiles = await screen.findAllByRole("button", { name: /^20\d\d / });
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "2026120 closed tradesLocked",
      "2025412 closed tradesUnlocked",
    ]);
    expect(tiles[1]).toHaveAttribute("aria-pressed", "true");
    expect(window.getComputedStyle(tiles[1]).boxShadow).toMatch(/^inset 0 0 0 1px /);
    expect(window.getComputedStyle(tiles[0]).boxShadow).toBe("");
    expect(await screen.findByRole("heading", { name: "2025 summary" })).toBeInTheDocument();
  });

  it("defaults to the newest finished year with trades when nothing is unlocked", async () => {
    mockFetchTaxYearOverview.mockResolvedValue(
      buildOverview({
        currentTaxYear: 2027,
        years: [
          yearItem(2027),
          yearItem(2026, { closedTradeCount: 120 }),
          yearItem(2025, { closedTradeCount: 412 }),
        ],
      })
    );

    renderReports();

    expect(await screen.findByRole("button", { name: "Unlock 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^2026 / })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("120 closed trades recorded in 2026.")).toBeInTheDocument();
    expect(screen.queryByText(/still in progress/)).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("falls back to the current year and says it is still in progress", async () => {
    mockFetchTaxYearOverview.mockResolvedValue(
      buildOverview({ currentTaxYear: 2027, years: [yearItem(2027)] })
    );

    renderReports();

    expect(await screen.findByRole("button", { name: "Unlock 2027" })).toBeEnabled();
    expect(screen.getByText("0 closed trades recorded in 2027 so far.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The 2027 tax year is still in progress. The pass also covers trades you add later."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "No closed trades are recorded in 2027 yet. A 2027 pass does not unlock any other tax year."
    );
  });

  describe("locked year", () => {
    const originalLocation = Object.getOwnPropertyDescriptor(window, "location");
    const assign = vi.fn();

    beforeEach(() => {
      assign.mockReset();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { href: "http://localhost:3000/reports", origin: "http://localhost:3000", assign },
      });
    });

    afterEach(() => {
      if (originalLocation) {
        Object.defineProperty(window, "location", originalLocation);
      }
    });

    it("shows the price and what is included, then opens the https Payment Link", async () => {
      const checkoutUrl = "https://buy.stripe.com/test_abc?client_reference_id=pass-1";
      mockStartTaxYearCheckout.mockResolvedValue({ checkoutUrl });

      renderReports("/reports?year=2025");

      const unlockButton = await screen.findByRole("button", { name: "Unlock 2025" });
      const price = new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD" }).format(39);
      expect(screen.getByText(price)).toBeInTheDocument();
      expect(screen.getByText("412 closed trades recorded in 2025.")).toBeInTheDocument();
      expect(screen.getByText("Annual summary in the app")).toBeInTheDocument();
      expect(screen.getByText("Trade ledger CSV")).toBeInTheDocument();
      expect(screen.getByText("Dispositions CSV")).toBeInTheDocument();
      expect(screen.getByText("Annual summary CSV")).toBeInTheDocument();
      expect(screen.getByText("Repurchase review CSV")).toBeInTheDocument();
      expect(screen.getByText(EXPORT_DISCLOSURE)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
        "href",
        "/terms-of-service"
      );

      await userEvent.click(unlockButton);

      await waitFor(() => expect(assign).toHaveBeenCalledWith(checkoutUrl));
      expect(mockStartTaxYearCheckout).toHaveBeenCalledWith(2025);
      expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBe("2025");
      expect(mockFetchAnnualSummary).not.toHaveBeenCalled();
    });

    it("locks every year and unlock button while checkout is starting", async () => {
      let resolveCheckout: (response: TaxYearCheckoutResponse) => void = () => {};
      mockStartTaxYearCheckout.mockImplementation(
        () => new Promise<TaxYearCheckoutResponse>((resolve) => (resolveCheckout = resolve))
      );
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderReports("/reports?year=2025");
      await user.click(await screen.findByRole("button", { name: "Unlock 2025" }));

      const tile2026 = screen.getByRole("button", { name: /^2026 / });
      expect(tile2026).toBeDisabled();
      expect(screen.getByRole("button", { name: /^2025 / })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeDisabled();
      await user.click(tile2026);
      expect(screen.getByRole("region", { name: "Unlock 2025" })).toBeInTheDocument();
      expect(mockStartTaxYearCheckout).toHaveBeenCalledTimes(1);

      const checkoutUrl = "https://buy.stripe.com/test_abc?client_reference_id=pass-2025";
      await act(async () => resolveCheckout({ checkoutUrl }));

      expect(assign).toHaveBeenCalledWith(checkoutUrl);
      expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBe("2025");
    });

    it("stays on the app when the user leaves while checkout is starting", async () => {
      let resolveCheckout: (response: TaxYearCheckoutResponse) => void = () => {};
      mockStartTaxYearCheckout.mockImplementation(
        () => new Promise<TaxYearCheckoutResponse>((resolve) => (resolveCheckout = resolve))
      );
      const user = userEvent.setup();

      renderReports("/reports?year=2025");
      await user.click(await screen.findByRole("button", { name: "Unlock 2025" }));
      await user.click(screen.getByRole("link", { name: "Back to app" }));
      expect(await screen.findByText("Home page")).toBeInTheDocument();

      await act(async () => resolveCheckout({ checkoutUrl: "https://buy.stripe.com/test_abc" }));

      expect(assign).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBeNull();
    });

    it("lets the user start again when the Stripe page never loads", async () => {
      const user = useFakeTimersWithUser();
      mockStartTaxYearCheckout.mockResolvedValue({ checkoutUrl: "https://buy.stripe.com/test_abc" });

      renderReports("/reports?year=2025");
      await user.click(await screen.findByRole("button", { name: "Unlock 2025" }));
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeDisabled();

      await act(() => vi.advanceTimersByTimeAsync(10_000));

      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeEnabled();
      expect(screen.getByRole("button", { name: /^2026 / })).toBeEnabled();
    });

    it("omits the price when none is configured", async () => {
      mockFetchTaxYearOverview.mockResolvedValue(buildOverview({ price: null }));

      renderReports("/reports?year=2025");

      expect(await screen.findByRole("button", { name: "Unlock 2025" })).toBeEnabled();
      expect(screen.queryByText(/39/)).not.toBeInTheDocument();
      expect(screen.getByText(/one-time payment for the 2025 tax year pass/i)).toBeInTheDocument();
    });

    it.each(["javascript:alert(1)", "http://buy.stripe.com/test_abc"])(
      "refuses to open a non-https checkout URL (%s)",
      async (checkoutUrl) => {
        mockStartTaxYearCheckout.mockResolvedValue({ checkoutUrl });

        renderReports("/reports?year=2025");
        const unlockButton = await screen.findByRole("button", { name: "Unlock 2025" });
        await userEvent.click(unlockButton);

        expect(await screen.findByText("Checkout link is invalid. Try again later.")).toBeInTheDocument();
        expect(assign).not.toHaveBeenCalled();
        expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBeNull();
        expect(unlockButton).toBeEnabled();
      }
    );

    it("shows checkout conflicts next to the unlock button and refreshes the overview", async () => {
      mockStartTaxYearCheckout.mockRejectedValue(
        new ApiError("A payment for tax year 2025 is still processing", 409)
      );

      renderReports("/reports?year=2025");
      await userEvent.click(await screen.findByRole("button", { name: "Unlock 2025" }));

      const panel = screen.getByRole("region", { name: "Unlock 2025" });
      expect(
        await within(panel).findByText("A payment for tax year 2025 is still processing")
      ).toBeInTheDocument();
      await waitFor(() => expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(mockFetchTaxYearPasses).toHaveBeenCalledTimes(2));
      expect(assign).not.toHaveBeenCalled();
    });

    it("disables the unlock button when checkout is not configured", async () => {
      mockFetchTaxYearOverview.mockResolvedValue(
        buildOverview({
          checkoutEnabled: false,
          years: [
            yearItem(2026, { purchasable: false }),
            yearItem(2025, { closedTradeCount: 412, purchasable: false }),
          ],
        })
      );

      renderReports("/reports?year=2025");

      expect(await screen.findByRole("button", { name: "Unlock 2025" })).toBeDisabled();
      expect(screen.getByText("Checkout is not available yet.")).toBeInTheDocument();
    });

    it("disables the unlock button for a year that is not purchasable", async () => {
      mockFetchTaxYearOverview.mockResolvedValue(
        buildOverview({
          years: [yearItem(2027, { closedTradeCount: 1, purchasable: false }), yearItem(2026)],
        })
      );

      renderReports("/reports?year=2027");

      expect(await screen.findByRole("button", { name: "Unlock 2027" })).toBeDisabled();
      expect(screen.getByText("This tax year can't be unlocked.")).toBeInTheDocument();
      expect(screen.queryByText("Checkout is not available yet.")).not.toBeInTheDocument();
    });

    it("explains a payment that is still processing", async () => {
      mockFetchTaxYearOverview.mockResolvedValue(
        buildOverview({
          years: [
            yearItem(2026),
            yearItem(2025, { closedTradeCount: 412, passStatus: "PROCESSING", purchasable: false }),
          ],
        })
      );

      renderReports("/reports?year=2025");

      expect(
        await screen.findByText("Payment processing — reports unlock when your payment clears.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^2025 / })).toHaveTextContent("Processing");
    });
  });

  describe("unlocked year", () => {
    beforeEach(() => {
      mockFetchTaxYearOverview.mockResolvedValue(unlockedOverview());
    });

    it("renders per-currency totals, the breakdown tables and the repurchase callout", async () => {
      renderReports();

      const usdTotals = await screen.findByRole("region", { name: "USD totals" });
      expect(within(usdTotals).getByText(formatMoney(2230.45, "USD"))).toBeInTheDocument();
      expect(within(usdTotals).getByText("31")).toBeInTheDocument();
      expect(within(usdTotals).getByText(formatPercent(19 / 30))).toBeInTheDocument();
      expect(within(usdTotals).getByText(formatMoney(64.35, "USD"))).toBeInTheDocument();

      const cadTotals = screen.getByRole("region", { name: "CAD totals" });
      expect(within(cadTotals).getByText(formatMoney(-500, "CAD"))).toBeInTheDocument();
      expect(within(cadTotals).getByText(formatPercent(4 / 10))).toBeInTheDocument();

      expect(screen.getByRole("table", { name: "By month" })).toBeInTheDocument();
      const accountsTable = screen.getByRole("table", { name: "By account" });
      const tfsaRow = within(accountsTable).getByText("TFSA").closest("tr");
      expect(tfsaRow).not.toBeNull();
      expect(within(tfsaRow as HTMLElement).getByText("Tax-free")).toBeInTheDocument();
      const unassignedRow = within(accountsTable).getByText("Unassigned").closest("tr");
      expect(within(unassignedRow as HTMLElement).queryByText("Tax-free")).not.toBeInTheDocument();

      const symbolsTable = screen.getByRole("table", { name: "Top symbols" });
      expect(within(symbolsTable).getByText("SYM10")).toBeInTheDocument();
      expect(within(symbolsTable).queryByText("SYM11")).not.toBeInTheDocument();
      expect(screen.getByRole("table", { name: "By asset type" })).toBeInTheDocument();
      expect(screen.getByRole("table", { name: "Taxable vs tax-free" })).toBeInTheDocument();

      expect(screen.getByText(/7 losses have a same-symbol position/i)).toHaveTextContent(
        "Repurchase review"
      );
      expect(screen.getByText(EXPORT_DISCLOSURE)).toBeInTheDocument();
      // Static notes, so screen readers don't announce them as alerts on every year switch.
      expect(screen.getAllByRole("note").map((note) => note.textContent)).toEqual([
        expect.stringContaining("7 losses have a same-symbol position"),
        EXPORT_DISCLOSURE,
      ]);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(mockFetchAnnualSummary).toHaveBeenCalledWith(2025, DEFAULT_FILTERS);
    });

    it("says so when no closed trades match the filters", async () => {
      mockFetchAnnualSummary.mockResolvedValue(
        buildSummary({
          tradeCount: 0,
          firstClosedOn: null,
          lastClosedOn: null,
          repurchaseFlagCount: 0,
          totals: [],
          months: [],
          accounts: [],
          symbols: [],
          assetTypes: [],
          taxTreatment: [],
        })
      );

      renderReports();

      expect(await screen.findByText("No closed trades in 2025 match these filters.")).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "By month" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download CSV: Trade ledger" })).toHaveAttribute(
        "aria-disabled",
        "false"
      );
    });

    it("serializes filters into the documented request shape", async () => {
      const user = useFakeTimersWithUser();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      mockListUserAccounts.mockResolvedValue([account("acct-1", "Margin"), account("acct-2", "TFSA", true)]);

      renderReports();
      await screen.findByRole("region", { name: "USD totals" });

      await user.click(screen.getByRole("button", { name: "Download CSV: Dispositions" }));
      await waitFor(() =>
        expect(mockDownloadTaxYearExport).toHaveBeenLastCalledWith(2025, {
          reportType: "DISPOSITIONS",
          filters: DEFAULT_FILTERS,
          includeNotes: false,
        })
      );

      await user.type(screen.getByLabelText("Symbols"), " aapl ,msft,, aapl ");
      await user.click(screen.getByRole("combobox", { name: /accounts/i }));
      await user.click(await screen.findByRole("option", { name: "Margin" }));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
      await user.click(screen.getByLabelText("Include unassigned trades"));
      await user.click(screen.getByLabelText("Include trade notes"));

      const expectedFilters: ReportFilters = {
        ...DEFAULT_FILTERS,
        accountIds: ["acct-1"],
        includeUnassigned: false,
        symbols: ["AAPL", "MSFT"],
      };
      await user.click(screen.getByRole("button", { name: "Download CSV: Trade ledger" }));
      await waitFor(() =>
        expect(mockDownloadTaxYearExport).toHaveBeenLastCalledWith(2025, {
          reportType: "TRADE_LEDGER",
          filters: expectedFilters,
          includeNotes: true,
        })
      );
      await user.click(screen.getByRole("button", { name: "Download CSV: Annual summary" }));
      await waitFor(() =>
        expect(mockDownloadTaxYearExport).toHaveBeenLastCalledWith(2025, {
          reportType: "ANNUAL_SUMMARY",
          filters: expectedFilters,
          includeNotes: false,
        })
      );

      await act(() => vi.advanceTimersByTimeAsync(500));
      await waitFor(() =>
        expect(mockFetchAnnualSummary).toHaveBeenLastCalledWith(2025, expectedFilters)
      );
    });

    it("saves the export under the server filename and revokes the object URL", async () => {
      const user = useFakeTimersWithUser();
      const savedFiles: { href: string; download: string }[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        savedFiles.push({ href: this.href, download: this.download });
      });
      const pendingDownloads: ((download: BlobDownload) => void)[] = [];
      mockDownloadTaxYearExport.mockImplementation(
        () => new Promise<BlobDownload>((resolve) => pendingDownloads.push(resolve))
      );

      renderReports();
      const ledgerButton = await screen.findByRole("button", { name: "Download CSV: Trade ledger" });
      const dispositionsButton = screen.getByRole("button", { name: "Download CSV: Dispositions" });
      await user.click(ledgerButton);

      expect(ledgerButton).toHaveAttribute("aria-disabled", "true");
      expect(dispositionsButton).toHaveAttribute("aria-disabled", "false");
      await user.click(dispositionsButton);
      expect(dispositionsButton).toHaveAttribute("aria-disabled", "true");

      await act(async () => {
        pendingDownloads[0]({
          blob: new Blob(["trade_id\r\n"], { type: "text/csv" }),
          filename: "tradelog-2025-trade-ledger-server.csv",
        });
        pendingDownloads[1]({
          blob: new Blob(["trade_id\r\n"], { type: "text/csv" }),
          filename: "tradelog-2025-dispositions-server.csv",
        });
      });

      await waitFor(() =>
        expect(savedFiles).toEqual([
          { href: "blob:tradelog-export", download: "tradelog-2025-trade-ledger-server.csv" },
          { href: "blob:tradelog-export", download: "tradelog-2025-dispositions-server.csv" },
        ])
      );
      expect(ledgerButton).toHaveAttribute("aria-disabled", "false");
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:tradelog-export");
    });

    it("ignores repeat clicks on an export that is downloading without disabling it", async () => {
      const user = userEvent.setup();
      mockDownloadTaxYearExport.mockImplementation(() => new Promise<BlobDownload>(() => {}));

      renderReports();
      const downloadButton = await screen.findByRole("button", { name: "Download CSV: Trade ledger" });
      await user.click(downloadButton);
      expect(downloadButton).toHaveAttribute("aria-disabled", "true");
      expect(downloadButton).not.toBeDisabled();
      await user.click(downloadButton);
      await user.keyboard("{Enter}");

      expect(downloadButton).toHaveFocus();
      expect(mockDownloadTaxYearExport).toHaveBeenCalledTimes(1);
    });

    it("refetches the overview and passes and shows the unlock panel when an export returns 403", async () => {
      const paidPass: TaxYearPass = {
        id: "pass-2025",
        taxYear: 2025,
        status: "PAID",
        amountTotal: 3900,
        currency: "CAD",
        paidAt: "2026-02-03T18:22:11Z",
        refundedAt: null,
        createdAt: "2026-02-03T18:20:40Z",
      };
      let overview = unlockedOverview();
      let passes = [paidPass];
      mockFetchTaxYearOverview.mockImplementation(async () => overview);
      mockFetchTaxYearPasses.mockImplementation(async () => passes);
      mockDownloadTaxYearExport.mockImplementation(async () => {
        overview = buildOverview({
          years: [
            yearItem(2026, { closedTradeCount: 120 }),
            yearItem(2025, { closedTradeCount: 412, passStatus: "REFUNDED" }),
          ],
        });
        passes = [{ ...paidPass, status: "REFUNDED", refundedAt: "2026-03-01T12:00:00Z" }];
        throw new ApiError("Tax year pass required for 2025", 403);
      });

      renderReports();
      const history = await screen.findByRole("table", { name: "Purchase history" });
      const passRow = () => within(history).getAllByRole("row")[1];
      expect(passRow()).toHaveTextContent("Paid");
      await userEvent.click(await screen.findByRole("button", { name: "Download CSV: Trade ledger" }));

      expect(await screen.findByRole("button", { name: "Unlock 2025" })).toBeEnabled();
      expect(screen.getByText("Your 2025 tax year pass was refunded.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "USD totals" })).not.toBeInTheDocument();
      expect(screen.queryByText("Tax year pass required for 2025")).not.toBeInTheDocument();
      await waitFor(() => expect(passRow()).toHaveTextContent("Refunded"));
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(2);
      expect(mockFetchTaxYearPasses).toHaveBeenCalledTimes(2);
    });

    it("keeps a 403 message when the overview can't be refetched", async () => {
      mockFetchTaxYearOverview
        .mockResolvedValueOnce(unlockedOverview())
        .mockRejectedValue(new ApiError("Service unavailable", 503));
      mockFetchAnnualSummary.mockRejectedValue(new ApiError("Account access denied", 403));

      renderReports();

      const summarySection = await screen.findByRole("region", { name: "2025 summary" });
      expect(await within(summarySection).findByText("Account access denied")).toBeInTheDocument();
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(2);
    });

    it("keeps a failed summary with a retry while downloads succeed", async () => {
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      mockFetchAnnualSummary
        .mockRejectedValueOnce(new ApiError("Reports are unavailable", 500))
        .mockResolvedValue(buildSummary());
      const user = userEvent.setup();

      renderReports();
      const summarySection = await screen.findByRole("region", { name: "2025 summary" });
      expect(await within(summarySection).findByText("Reports are unavailable")).toBeInTheDocument();

      const downloadButton = screen.getByRole("button", { name: "Download CSV: Trade ledger" });
      await user.click(downloadButton);
      await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
      expect(within(summarySection).getByText("Reports are unavailable")).toBeInTheDocument();

      await user.click(within(summarySection).getByRole("button", { name: "Retry" }));

      expect(await screen.findByRole("region", { name: "USD totals" })).toBeInTheDocument();
      expect(screen.queryByText("Reports are unavailable")).not.toBeInTheDocument();
      expect(mockFetchAnnualSummary).toHaveBeenCalledTimes(2);
    });

    it("shows a failed download with its own year after a year switch", async () => {
      const unlocked = { passStatus: "PAID", unlocked: true, purchasable: false } as const;
      mockFetchTaxYearOverview.mockResolvedValue(
        buildOverview({
          years: [
            yearItem(2026, { closedTradeCount: 120, ...unlocked }),
            yearItem(2025, { closedTradeCount: 412, ...unlocked }),
          ],
        })
      );
      mockFetchAnnualSummary.mockImplementation(async (taxYear) => buildSummary({ taxYear }));
      let rejectDownload: (error: Error) => void = () => {};
      mockDownloadTaxYearExport.mockImplementation(
        () => new Promise<BlobDownload>((_, reject) => (rejectDownload = reject))
      );
      const user = userEvent.setup();

      renderReports("/reports?year=2025");
      await user.click(await screen.findByRole("button", { name: "Download CSV: Trade ledger" }));
      await user.click(screen.getByRole("button", { name: /^2026 / }));
      expect(await screen.findByRole("heading", { name: "2026 summary" })).toBeInTheDocument();
      await act(async () => rejectDownload(new ApiError("Export failed", 500)));

      expect(screen.queryByText("Export failed")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^2025 / }));
      const exportsPanel = await screen.findByRole("region", { name: "Exports" });
      expect(within(exportsPanel).getByText("Export failed")).toBeInTheDocument();
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(1);
    });

    it("keeps the report view and shows the message when a 403 is not about the pass", async () => {
      mockFetchAnnualSummary
        .mockResolvedValueOnce(buildSummary())
        .mockRejectedValue(new ApiError("Account access denied", 403));
      mockListUserAccounts.mockResolvedValue([account("acct-1", "Margin")]);
      const user = userEvent.setup();

      renderReports();
      await screen.findByRole("region", { name: "USD totals" });
      await user.click(screen.getByRole("combobox", { name: /accounts/i }));
      await user.click(await screen.findByRole("option", { name: "Margin" }));
      await user.keyboard("{Escape}");

      expect(await screen.findByText("Account access denied")).toBeInTheDocument();
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "Unlock 2025" })).not.toBeInTheDocument();
    });

    it("shows other report errors as an alert", async () => {
      mockFetchAnnualSummary.mockRejectedValue(new ApiError("Reports are unavailable", 500));

      renderReports();

      expect(await screen.findByText("Reports are unavailable")).toBeInTheDocument();
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(1);
    });
  });

  it("signs out with a session-expired prompt on 401", async () => {
    authState.logout = vi.fn(() => {
      authState.user = null;
      authState.token = null;
    });
    mockFetchTaxYearOverview.mockRejectedValue(new ApiError("Unauthorized", 401));

    renderReports();

    expect(
      await screen.findByText("Your session expired. Sign in again to view your tax reports.")
    ).toBeInTheDocument();
    expect(authState.logout).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  describe("purchase history", () => {
    const historyPass = (overrides: Partial<TaxYearPass> & Pick<TaxYearPass, "id">): TaxYearPass => ({
      taxYear: 2025,
      status: "PAID",
      amountTotal: 3900,
      currency: "CAD",
      paidAt: "2026-02-03T18:22:11Z",
      refundedAt: null,
      createdAt: "2026-02-03T18:20:40Z",
      ...overrides,
    });
    const abandonedCheckout = historyPass({
      id: "pass-pending",
      taxYear: 2026,
      status: "PENDING",
      amountTotal: null,
      currency: null,
      paidAt: null,
      createdAt: "2026-03-01T10:00:00Z",
    });

    it("lists every pass except abandoned checkouts", async () => {
      mockFetchTaxYearPasses.mockResolvedValue([
        abandonedCheckout,
        historyPass({ id: "pass-paid" }),
        historyPass({ id: "pass-processing", taxYear: 2024, status: "PROCESSING", paidAt: null }),
        historyPass({
          id: "pass-refunded",
          taxYear: 2023,
          status: "REFUNDED",
          refundedAt: "2026-02-10T09:00:00Z",
        }),
        historyPass({
          id: "pass-failed",
          taxYear: 2022,
          status: "FAILED",
          amountTotal: null,
          currency: null,
          paidAt: null,
        }),
      ]);

      renderReports();

      const history = await screen.findByRole("table", { name: "Purchase history" });
      const [, paidRow, processingRow, refundedRow, failedRow, ...otherRows] =
        within(history).getAllByRole("row");
      expect(otherRows).toHaveLength(0);
      expect(within(history).queryByText("Pending")).not.toBeInTheDocument();
      expect(within(history).queryByText("2026")).not.toBeInTheDocument();
      expect(paidRow).toHaveTextContent("2025");
      expect(paidRow).toHaveTextContent("Paid");
      expect(paidRow).toHaveTextContent(
        new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD" }).format(39)
      );
      expect(paidRow).toHaveTextContent(
        new Date("2026-02-03T18:22:11Z").toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      );
      expect(processingRow).toHaveTextContent("2024");
      expect(processingRow).toHaveTextContent("Processing");
      expect(within(processingRow).getAllByText("—")).toHaveLength(1);
      expect(refundedRow).toHaveTextContent("2023");
      expect(refundedRow).toHaveTextContent("Refunded");
      expect(failedRow).toHaveTextContent("2022");
      expect(failedRow).toHaveTextContent("Failed");
      expect(within(failedRow).getAllByText("—")).toHaveLength(2);
    });

    it.each<[string, TaxYearPass[]]>([
      ["only abandoned checkouts remain", [abandonedCheckout]],
      ["there are no passes", []],
    ])("is hidden when %s", async (_, loadedPasses) => {
      let resolvePasses: (passes: TaxYearPass[]) => void = () => {};
      mockFetchTaxYearPasses.mockImplementation(
        () => new Promise<TaxYearPass[]>((resolve) => (resolvePasses = resolve))
      );

      renderReports();
      await screen.findByRole("heading", { name: /^Unlock 20\d\d$/ });
      await act(async () => resolvePasses(loadedPasses));

      expect(screen.queryByRole("region", { name: "Purchase history" })).not.toBeInTheDocument();
    });
  });

  describe("checkout return", () => {
    const pendingOverview = () =>
      buildOverview({
        years: [
          yearItem(2026, { closedTradeCount: 120 }),
          yearItem(2025, { closedTradeCount: 412, passStatus: "PENDING" }),
        ],
      });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("polls until the pending year is PAID, then selects it and cleans up", async () => {
      window.sessionStorage.setItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY, "2025");
      let paid = false;
      mockFetchTaxYearOverview.mockImplementation(async () =>
        paid ? unlockedOverview() : pendingOverview()
      );

      const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByText(/payment received — confirming your tax year pass/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^2025 / })).toHaveAttribute("aria-pressed", "true");

      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(screen.getByText(/payment received — confirming/i)).toBeInTheDocument();
      expect(router.state.location.search).toBe("?checkout=success&session_id=cs_test_123");

      paid = true;
      await act(() => vi.advanceTimersByTimeAsync(2_000));

      expect(
        screen.getByText("Your 2025 tax year pass is active. Reports and exports are unlocked.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^2025 / })).toHaveAttribute("aria-pressed", "true");
      expect(router.state.location.search).toBe("?year=2025");
      expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBeNull();
      expect(mockFetchAnnualSummary).toHaveBeenCalledWith(2025, DEFAULT_FILTERS);

      const callsAfterPaid = mockFetchTaxYearOverview.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(callsAfterPaid);
    });

    describe("without the stored pending year", () => {
      const returnedAt = new Date("2026-02-01T18:00:00Z");
      const buildPass = (overrides: Partial<TaxYearPass>): TaxYearPass => ({
        id: "pass-2025",
        taxYear: 2025,
        status: "PENDING",
        amountTotal: null,
        currency: null,
        paidAt: null,
        refundedAt: null,
        createdAt: "2026-01-10T12:00:00Z",
        ...overrides,
      });
      // Checkout reused the older 2025 pass, so the abandoned 2026 attempt has the newer createdAt.
      const abandoned2026Pass = buildPass({
        id: "pass-2026",
        taxYear: 2026,
        createdAt: "2026-01-20T12:00:00Z",
      });
      const paid2025Pass = buildPass({
        status: "PAID",
        amountTotal: 3900,
        currency: "CAD",
        paidAt: "2026-02-01T17:59:58Z",
      });
      const bothPendingOverview = () =>
        buildOverview({
          years: [
            yearItem(2026, { closedTradeCount: 120, passStatus: "PENDING" }),
            yearItem(2025, { closedTradeCount: 412, passStatus: "PENDING" }),
          ],
        });
      const paid2025Overview = () =>
        buildOverview({
          years: [
            yearItem(2026, { closedTradeCount: 120, passStatus: "PENDING" }),
            yearItem(2025, {
              closedTradeCount: 412,
              passStatus: "PAID",
              unlocked: true,
              purchasable: false,
            }),
          ],
        });

      beforeEach(() => {
        vi.setSystemTime(returnedAt);
      });

      it("confirms the pass Stripe just marked PAID instead of the newest unsettled pass", async () => {
        mockFetchTaxYearPasses.mockResolvedValue([abandoned2026Pass, paid2025Pass]);
        mockFetchTaxYearOverview.mockResolvedValue(paid2025Overview());

        const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
        await act(() => vi.advanceTimersByTimeAsync(0));

        expect(
          screen.getByText("Your 2025 tax year pass is active. Reports and exports are unlocked.")
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^2025 / })).toHaveAttribute("aria-pressed", "true");
        expect(router.state.location.search).toBe("?year=2025");
      });

      it("waits for a pass to be paid instead of guessing between unsettled years", async () => {
        let paid = false;
        mockFetchTaxYearPasses.mockImplementation(async () => [
          abandoned2026Pass,
          paid ? { ...paid2025Pass, paidAt: new Date().toISOString() } : buildPass({}),
        ]);
        mockFetchTaxYearOverview.mockImplementation(async () =>
          paid ? paid2025Overview() : bothPendingOverview()
        );

        const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
        await act(() => vi.advanceTimersByTimeAsync(4_000));

        expect(screen.getByText(/payment received — confirming/i)).toBeInTheDocument();
        expect(screen.queryByText("Confirming your payment…")).not.toBeInTheDocument();
        expect(router.state.location.search).toBe("?checkout=success&session_id=cs_test_123");

        paid = true;
        await act(() => vi.advanceTimersByTimeAsync(2_000));

        expect(
          screen.getByText("Your 2025 tax year pass is active. Reports and exports are unlocked.")
        ).toBeInTheDocument();
        expect(router.state.location.search).toBe("?year=2025");
      });

      it("ignores a pass paid long ago and gives up without picking a year", async () => {
        mockFetchTaxYearPasses.mockResolvedValue([
          abandoned2026Pass,
          { ...paid2025Pass, paidAt: "2026-01-15T09:00:00Z" },
        ]);
        mockFetchTaxYearOverview.mockResolvedValue(paid2025Overview());

        const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText(/payment received — confirming/i)).toBeInTheDocument();
        expect(screen.queryByText("Confirming your payment…")).not.toBeInTheDocument();

        await act(() => vi.advanceTimersByTimeAsync(60_000));

        expect(screen.getByText("Still confirming — refresh in a minute.")).toBeInTheDocument();
        expect(screen.queryByText(/tax year pass is active/i)).not.toBeInTheDocument();
        expect(router.state.location.search).toBe("");
      });

      it("keeps confirming when the passes request fails", async () => {
        let passesAvailable = false;
        mockFetchTaxYearPasses.mockImplementation(async () => {
          if (!passesAvailable) {
            throw new ApiError("Service unavailable", 503);
          }
          return [paid2025Pass];
        });
        mockFetchTaxYearOverview.mockResolvedValue(paid2025Overview());

        const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
        await act(() => vi.advanceTimersByTimeAsync(0));

        expect(screen.getByText(/payment received — confirming/i)).toBeInTheDocument();
        expect(router.state.location.search).toBe("?checkout=success&session_id=cs_test_123");

        passesAvailable = true;
        await act(() => vi.advanceTimersByTimeAsync(2_000));

        expect(
          screen.getByText("Your 2025 tax year pass is active. Reports and exports are unlocked.")
        ).toBeInTheDocument();
        expect(router.state.location.search).toBe("?year=2025");
      });
    });

    it("stops polling on PROCESSING and shows the processing alert", async () => {
      window.sessionStorage.setItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY, "2025");
      mockFetchTaxYearOverview.mockResolvedValue(
        buildOverview({
          years: [
            yearItem(2026),
            yearItem(2025, { closedTradeCount: 412, passStatus: "PROCESSING", purchasable: false }),
          ],
        })
      );

      const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(
        screen.getByText("Payment processing — reports unlock when your payment clears.")
      ).toBeInTheDocument();
      expect(screen.queryByText(/confirming your tax year pass/i)).not.toBeInTheDocument();
      expect(router.state.location.search).toBe("?year=2025");
      const callsAfterProcessing = mockFetchTaxYearOverview.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(callsAfterProcessing);
    });

    it("gives up after about a minute with a refresh hint that reopens the year", async () => {
      window.sessionStorage.setItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY, "2025");
      mockFetchTaxYearOverview.mockImplementation(async () => pendingOverview());

      const router = renderReports("/reports?checkout=success&session_id=cs_test_123");
      await act(() => vi.advanceTimersByTimeAsync(60_000));

      expect(screen.getByText("Still confirming — refresh in a minute.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unlock 2025" })).toBeEnabled();
      expect(router.state.location.search).toBe("?year=2025");
      expect(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY)).toBeNull();
      expect(mockFetchTaxYearPasses).toHaveBeenCalledTimes(2);

      cleanup();
      renderReports(`/reports${router.state.location.search}`);
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByRole("button", { name: /^2025 / })).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByText("Already paid? Confirmation can take a minute, so refresh before paying again.")
      ).toBeInTheDocument();
    });

    it("ignores unknown checkout values", async () => {
      window.sessionStorage.setItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY, "2025");

      const router = renderReports("/reports?checkout=cancelled");
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.queryByText(/confirming your tax year pass/i)).not.toBeInTheDocument();
      expect(router.state.location.search).toBe("?checkout=cancelled");
      expect(mockFetchTaxYearOverview).toHaveBeenCalledTimes(1);
    });
  });
});
