import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckIcon from "@mui/icons-material/Check";
import DownloadIcon from "@mui/icons-material/Download";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  Toolbar,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { fetchTaxYearPasses, startTaxYearCheckout } from "../api/billing";
import { ApiError } from "../api/client";
import { downloadTaxYearExport, fetchAnnualSummary, fetchTaxYearOverview } from "../api/reports";
import type {
  AnnualSummary,
  AssetType,
  Currency,
  ReportFilters,
  SummaryRow,
  TaxYearOverview,
  TaxYearOverviewItem,
  TaxYearPass,
  TaxYearPassStatus,
  TaxYearReportType,
  TradeDirection,
  TradingAccount,
} from "../api/types";
import { listUserAccounts } from "../api/users";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "./+types/reports";

export const PENDING_CHECKOUT_YEAR_STORAGE_KEY = "tradelog:pending-tax-year-checkout";

export const EXPORT_DISCLOSURE =
  "Exports summarize trades recorded in tradelog. They are not official tax slips, tax filings, or tax advice. Amounts are in each trade's recorded currency, with no exchange-rate conversion.";

const CHECKOUT_POLL_INTERVAL_MS = 2_000;
const CHECKOUT_POLL_MAX_ATTEMPTS = 30;
// A navigation to Stripe that the user stops (Esc) never unloads the page, so let them start again.
const CHECKOUT_REDIRECT_RECOVERY_MS = 10_000;
// paidAt is server time, so the window also absorbs a skewed device clock in either direction.
const RECENT_PAYMENT_WINDOW_MS = 5 * 60_000;
const SYMBOLS_INPUT_DEBOUNCE_MS = 400;
// Safari can cancel a download whose object URL is revoked in the same task as the click.
const OBJECT_URL_REVOKE_DELAY_MS = 10_000;
const TOP_SYMBOL_ROW_COUNT = 10;
const COMPACT_TABLE_SX = { "& .MuiTableCell-root": { px: { xs: 1, sm: 2 } } };

type SelectOption<T extends string> = { value: T; label: string };

const ASSET_TYPE_OPTIONS: SelectOption<AssetType>[] = [
  { value: "STOCK", label: "Stocks" },
  { value: "OPTION", label: "Options" },
];

const CURRENCY_OPTIONS: SelectOption<Currency>[] = [
  { value: "USD", label: "USD" },
  { value: "CAD", label: "CAD" },
];

const DIRECTION_OPTIONS: SelectOption<TradeDirection>[] = [
  { value: "LONG", label: "Long" },
  { value: "SHORT", label: "Short" },
];

const TAX_YEAR_EXPORTS: { reportType: TaxYearReportType; name: string; description: string }[] = [
  {
    reportType: "TRADE_LEDGER",
    name: "Trade ledger",
    description: "Every closed trade as recorded, with fees, margin interest and recorded realized P/L.",
  },
  {
    reportType: "DISPOSITIONS",
    name: "Dispositions",
    description: "Proceeds and cost for each closed trade in taxable accounts, for your accountant.",
  },
  {
    reportType: "ANNUAL_SUMMARY",
    name: "Annual summary",
    description: "Totals by month, account, symbol, asset type and tax treatment in one file.",
  },
  {
    reportType: "REPURCHASE_REVIEW",
    name: "Repurchase review",
    description:
      "A review list of losses with a same-symbol position opened within 30 days. No adjustments are applied.",
  },
];

// A checkout the user abandoned stays PENDING, so it is not a purchase.
type PurchaseHistoryStatus = Exclude<TaxYearPassStatus, "PENDING">;
type PurchaseHistoryPass = TaxYearPass & { status: PurchaseHistoryStatus };

const PASS_STATUS_LABELS: Record<PurchaseHistoryStatus, string> = {
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

const PASS_STATUS_COLORS: Record<PurchaseHistoryStatus, "info" | "success" | "error" | "warning"> = {
  PROCESSING: "info",
  PAID: "success",
  FAILED: "error",
  REFUNDED: "warning",
};

type CheckoutReturn =
  | { phase: "confirming"; taxYear: number | null }
  | { phase: "paid"; taxYear: number }
  | { phase: "timeout" };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Tax reports | tradelog" },
    {
      name: "description",
      content: "Annual summaries and accountant exports, unlocked with a one-time tax year pass.",
    },
  ];
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debouncedValue;
}

function parseTaxYear(value: string | null) {
  return value && /^\d{4}$/.test(value) ? Number(value) : null;
}

function parseSymbolsInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function readPendingCheckoutYear() {
  try {
    return parseTaxYear(window.sessionStorage.getItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writePendingCheckoutYear(taxYear: number) {
  try {
    window.sessionStorage.setItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY, String(taxYear));
  } catch {
    // Without storage the return flow waits for a recently paid pass instead.
  }
}

function clearPendingCheckoutYear() {
  try {
    window.sessionStorage.removeItem(PENDING_CHECKOUT_YEAR_STORAGE_KEY);
  } catch {
    // Nothing was stored when storage is unavailable.
  }
}

// Checkout reuses an older PENDING or FAILED pass for the year, so createdAt can't tell which pass
// was just bought. A pass Stripe marked PAID moments ago can.
function recentlyPaidPassYear(passes: TaxYearPass[], now: number) {
  const recentlyPaid = passes
    .filter(
      (pass): pass is TaxYearPass & { paidAt: string } =>
        pass.status === "PAID" &&
        pass.paidAt !== null &&
        Math.abs(now - Date.parse(pass.paidAt)) <= RECENT_PAYMENT_WINDOW_MS
    )
    .sort((left, right) => Date.parse(right.paidAt) - Date.parse(left.paidAt));
  return recentlyPaid[0]?.taxYear ?? null;
}

function isPurchaseHistoryPass(pass: TaxYearPass): pass is PurchaseHistoryPass {
  return pass.status !== "PENDING";
}

function resolveSelectedTaxYear(
  overview: TaxYearOverview,
  selectedYear: number | null,
  requestedYear: number | null
) {
  const isListed = (year: number | null): year is number =>
    year !== null && overview.years.some((item) => item.taxYear === year);
  if (isListed(selectedYear)) {
    return selectedYear;
  }
  if (isListed(requestedYear)) {
    return requestedYear;
  }
  // The current year is still in progress, so a user who hasn't bought a year most likely wants
  // the newest finished one. A pass for one year never unlocks another.
  const newestFinishedYearWithTrades = overview.years.find(
    (item) => item.taxYear < overview.currentTaxYear && item.closedTradeCount > 0
  )?.taxYear;
  return (
    overview.years.find((item) => item.unlocked)?.taxYear ??
    newestFinishedYearWithTrades ??
    overview.currentTaxYear
  );
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatMinorUnits(amount: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** fractionDigits);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatWinRate(row: SummaryRow) {
  const decidedTrades = row.winningTrades + row.losingTrades;
  if (decidedTrades === 0) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
    row.winningTrades / decidedTrades
  );
}

function formatIsoDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

function formatMonthLabel(row: SummaryRow) {
  if (!/^\d{4}-\d{2}$/.test(row.key)) {
    return row.label;
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${row.key}-01T00:00:00Z`)
  );
}

function formatInstantDate(instant: string) {
  return new Date(instant).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatClosedTradeCount(count: number) {
  return `${count.toLocaleString()} closed trade${count === 1 ? "" : "s"}`;
}

function pnlColor(value: number) {
  if (value > 0) return "success.main";
  if (value < 0) return "error.main";
  return "text.primary";
}

export default function Reports() {
  const { user, token, initializing, loginButton, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSignedIn = Boolean(user && token);
  const requestedYear = parseTaxYear(searchParams.get("year"));
  const checkoutParam = searchParams.get("checkout");

  const [overview, setOverview] = useState<TaxYearOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [passes, setPasses] = useState<TaxYearPass[]>([]);
  const [passesError, setPassesError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | null>(null);
  const [checkoutStartingYear, setCheckoutStartingYear] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnnualSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryReloadCount, setSummaryReloadCount] = useState(0);
  // Tagged with its year, so a download that fails after a year switch stays with its own year.
  const [downloadError, setDownloadError] = useState<{ taxYear: number; message: string } | null>(
    null
  );
  const [downloadingReportTypes, setDownloadingReportTypes] = useState<TaxYearReportType[]>([]);
  const downloadsInFlightRef = useRef(new Set<TaxYearReportType>());
  const overviewRequestIdRef = useRef(0);
  const passesRequestIdRef = useRef(0);
  const unmountedRef = useRef(false);
  const checkoutRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [includeUnassigned, setIncludeUnassigned] = useState(true);
  const [symbolsInput, setSymbolsInput] = useState("");
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [directions, setDirections] = useState<TradeDirection[]>([]);
  const [includeNotes, setIncludeNotes] = useState(false);
  const debouncedSymbolsInput = useDebouncedValue(symbolsInput, SYMBOLS_INPUT_DEBOUNCE_MS);

  const buildReportFilters = (symbols: string): ReportFilters => ({
    accountIds,
    includeUnassigned,
    symbols: parseSymbolsInput(symbols),
    assetTypes,
    currencies,
    directions,
  });
  // A value key, so edits that parse to the same filters (like a trailing comma) don't refetch.
  const summaryFiltersKey = JSON.stringify(buildReportFilters(debouncedSymbolsInput));

  const selectedTaxYear = overview
    ? resolveSelectedTaxYear(overview, selectedYear, requestedYear)
    : null;
  const selectedItem = overview?.years.find((item) => item.taxYear === selectedTaxYear) ?? null;
  const selectedYearUnlocked = selectedItem?.unlocked ?? false;
  const confirmingTaxYear =
    checkoutReturn?.phase === "confirming" ? checkoutReturn.taxYear : null;
  // A retried FAILED pass stays FAILED until its webhook lands, so don't call that payment failed yet.
  const awaitingCheckoutConfirmation =
    checkoutReturn?.phase === "confirming" || checkoutReturn?.phase === "timeout";

  const handleUnauthorized = useCallback(() => {
    setSessionExpired(true);
    logout();
  }, [logout]);

  const handleLoadError = useCallback(
    (error: unknown, setError: (message: string) => void, fallback: string) => {
      if (isUnauthorized(error)) {
        handleUnauthorized();
        return;
      }
      setError(errorMessage(error, fallback));
    },
    [handleUnauthorized]
  );

  // Only the newest request may write, so a slow initial load can't undo a fresher poll result.
  const loadOverview = useCallback(async () => {
    const requestId = ++overviewRequestIdRef.current;
    try {
      const latest = await fetchTaxYearOverview();
      if (requestId !== overviewRequestIdRef.current) {
        return null;
      }
      setOverview(latest);
      setOverviewError(null);
      return latest;
    } catch (error) {
      if (requestId === overviewRequestIdRef.current) {
        handleLoadError(error, setOverviewError, "Tax years could not be loaded.");
      }
      return null;
    }
  }, [handleLoadError]);

  const loadPasses = useCallback(async () => {
    const requestId = ++passesRequestIdRef.current;
    try {
      const latest = await fetchTaxYearPasses();
      if (requestId === passesRequestIdRef.current) {
        setPasses(latest);
        setPassesError(null);
      }
    } catch (error) {
      if (requestId === passesRequestIdRef.current) {
        handleLoadError(error, setPassesError, "Purchase history could not be loaded.");
      }
    }
  }, [handleLoadError]);

  useEffect(() => {
    if (!isSignedIn) {
      overviewRequestIdRef.current += 1;
      passesRequestIdRef.current += 1;
      setOverview(null);
      setOverviewError(null);
      setPasses([]);
      setPassesError(null);
      setAccounts([]);
      setAccountsError(null);
      setAccountIds([]);
      setSelectedYear(null);
      setCheckoutReturn(null);
      return;
    }

    setSessionExpired(false);
    void loadOverview();
    void loadPasses();
    let active = true;
    listUserAccounts()
      .then((loadedAccounts) => {
        if (active) {
          setAccounts(loadedAccounts);
          setAccountsError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          handleLoadError(error, setAccountsError, "Accounts could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [handleLoadError, isSignedIn, loadOverview, loadPasses]);

  // Stripe returns here after payment, usually before or just after its webhook marks the pass PAID.
  useEffect(() => {
    if (!isSignedIn || checkoutParam !== "success") {
      return;
    }
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const waitForNextPoll = () =>
      new Promise<void>((resolve) => {
        pollTimer = setTimeout(resolve, CHECKOUT_POLL_INTERVAL_MS);
      });
    const finishCheckoutReturn = (taxYear: number | null) => {
      clearPendingCheckoutYear();
      const remainingParams = new URLSearchParams(searchParams);
      remainingParams.delete("checkout");
      remainingParams.delete("session_id");
      if (taxYear !== null) {
        // A reload, which the timeout alert asks for, must reopen this year, not the default one.
        remainingParams.set("year", String(taxYear));
      }
      const search = remainingParams.toString();
      navigate({ search: search ? `?${search}` : "" }, { replace: true });
    };

    const confirmCheckout = async () => {
      let taxYear = readPendingCheckoutYear();
      setCheckoutReturn({ phase: "confirming", taxYear });
      if (taxYear !== null) {
        setSelectedYear(taxYear);
      }
      for (let attempt = 1; attempt <= CHECKOUT_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
          await waitForNextPoll();
        }
        if (cancelled) return;
        if (taxYear === null) {
          // Checkout started in another tab or origin, so wait until a pass shows up as just paid.
          try {
            taxYear = recentlyPaidPassYear(await fetchTaxYearPasses(), Date.now());
          } catch (error) {
            if (cancelled) return;
            if (isUnauthorized(error)) {
              handleUnauthorized();
              return;
            }
          }
          if (cancelled) return;
          if (taxYear === null) continue;
        }
        const latest = await loadOverview();
        if (cancelled) return;
        const passStatus = latest?.years.find((item) => item.taxYear === taxYear)?.passStatus;
        if (passStatus === "PAID" || passStatus === "PROCESSING") {
          // PROCESSING can take days to clear, so stop polling; the unlock panel explains it.
          setSelectedYear(taxYear);
          setCheckoutReturn(passStatus === "PAID" ? { phase: "paid", taxYear } : null);
          finishCheckoutReturn(taxYear);
          void loadPasses();
          return;
        }
      }
      setCheckoutReturn({ phase: "timeout" });
      finishCheckoutReturn(taxYear);
      void loadPasses();
    };

    void confirmCheckout();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [checkoutParam, handleUnauthorized, isSignedIn, loadOverview, loadPasses, navigate, searchParams]);

  // Pin the default so a later refetch (say, after a refund) can't move the selection elsewhere.
  useEffect(() => {
    if (overview && selectedYear === null) {
      setSelectedYear(resolveSelectedTaxYear(overview, null, requestedYear));
    }
  }, [overview, requestedYear, selectedYear]);

  // A back navigation from Stripe can restore this page from the bfcache mid-redirect.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        clearTimeout(checkoutRecoveryTimerRef.current);
        setCheckoutStartingYear(null);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimeout(checkoutRecoveryTimerRef.current);
    };
  }, []);

  // Resolves to the message to show for a failed report request, or null when there is none.
  const resolveReportError = useCallback(
    async (error: unknown, taxYear: number) => {
      if (isUnauthorized(error)) {
        handleUnauthorized();
        return null;
      }
      if (error instanceof ApiError && error.status === 403) {
        // Either the pass is gone (refund) or a filtered account is not the caller's.
        void loadPasses();
        const latest = await loadOverview();
        const stillUnlocked = latest?.years.some(
          (item) => item.taxYear === taxYear && item.unlocked
        );
        // The unlock panel replaces the report and explains a lost pass. A failed or superseded
        // refetch proves nothing, so the message stays.
        if (latest && !stillUnlocked) {
          return null;
        }
      }
      return errorMessage(error, "The report could not be loaded.");
    },
    [handleUnauthorized, loadOverview, loadPasses]
  );

  useEffect(() => {
    setSummaryError(null);
    if (!isSignedIn || selectedTaxYear === null || !selectedYearUnlocked) {
      setSummary(null);
      return;
    }
    let active = true;
    const taxYear = selectedTaxYear;
    setSummaryLoading(true);
    fetchAnnualSummary(taxYear, JSON.parse(summaryFiltersKey) as ReportFilters)
      .then((loadedSummary) => {
        if (active) {
          setSummary(loadedSummary);
        }
      })
      .catch(async (error: unknown) => {
        if (!active) {
          return;
        }
        setSummary(null);
        const message = await resolveReportError(error, taxYear);
        if (active) {
          setSummaryError(message);
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    isSignedIn,
    resolveReportError,
    selectedTaxYear,
    selectedYearUnlocked,
    summaryFiltersKey,
    summaryReloadCount,
  ]);

  const handleSelectYear = (taxYear: number) => {
    setSelectedYear(taxYear);
    setCheckoutError(null);
  };

  const handleUnlock = async (taxYear: number) => {
    if (checkoutStartingYear !== null) {
      return;
    }
    setCheckoutError(null);
    setCheckoutStartingYear(taxYear);
    try {
      const { checkoutUrl } = await startTaxYearCheckout(taxYear);
      if (unmountedRef.current) {
        // The user left this page while checkout was starting, so don't send them to Stripe.
        return;
      }
      if (!isHttpsUrl(checkoutUrl)) {
        throw new Error("Checkout link is invalid. Try again later.");
      }
      writePendingCheckoutYear(taxYear);
      window.location.assign(checkoutUrl);
      checkoutRecoveryTimerRef.current = setTimeout(
        () => setCheckoutStartingYear(null),
        CHECKOUT_REDIRECT_RECOVERY_MS
      );
    } catch (error) {
      setCheckoutStartingYear(null);
      if (isUnauthorized(error)) {
        handleUnauthorized();
        return;
      }
      setCheckoutError(errorMessage(error, "Checkout could not be started."));
      if (error instanceof ApiError && error.status === 409) {
        void loadOverview();
        void loadPasses();
      }
    }
  };

  const handleDownload = async (reportType: TaxYearReportType) => {
    if (selectedTaxYear === null || downloadsInFlightRef.current.has(reportType)) {
      return;
    }
    const taxYear = selectedTaxYear;
    downloadsInFlightRef.current.add(reportType);
    setDownloadingReportTypes(Array.from(downloadsInFlightRef.current));
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadTaxYearExport(taxYear, {
        reportType,
        filters: buildReportFilters(symbolsInput),
        includeNotes: reportType === "TRADE_LEDGER" && includeNotes,
      });
      saveBlob(blob, filename);
    } catch (error) {
      const message = await resolveReportError(error, taxYear);
      if (message !== null) {
        setDownloadError({ taxYear, message });
      }
    } finally {
      downloadsInFlightRef.current.delete(reportType);
      setDownloadingReportTypes(Array.from(downloadsInFlightRef.current));
    }
  };

  const visibleSummary = summary && summary.taxYear === selectedTaxYear ? summary : null;
  const visibleDownloadError =
    downloadError && downloadError.taxYear === selectedTaxYear ? downloadError.message : null;
  const purchaseHistory = passes.filter(isPurchaseHistoryPass);

  return (
    <>
      <Toolbar sx={{ px: { xs: 2, sm: 3 } }}>
        <Button
          component={RouterLink}
          to="/"
          variant="outlined"
          size="small"
          startIcon={<ArrowBackIcon />}
        >
          Back to app
        </Button>
      </Toolbar>

      <Container maxWidth="lg" sx={{ pb: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight={800}>
              Tax reports
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Annual summaries and accountant exports for one tax year at a time. One-time payment
              per tax year, no subscription.
            </Typography>
          </Box>

          {checkoutReturn?.phase === "confirming" && (
            <Alert severity="info" icon={<CircularProgress size={20} />}>
              Payment received — confirming your tax year pass…
            </Alert>
          )}
          {checkoutReturn?.phase === "paid" && (
            <Alert severity="success" onClose={() => setCheckoutReturn(null)}>
              Your {checkoutReturn.taxYear} tax year pass is active. Reports and exports are
              unlocked.
            </Alert>
          )}
          {checkoutReturn?.phase === "timeout" && (
            <Alert severity="warning" onClose={() => setCheckoutReturn(null)}>
              Still confirming — refresh in a minute.
            </Alert>
          )}

          {initializing && !user && <Alert severity="info">Checking session…</Alert>}
          {!initializing && !isSignedIn && (
            <Stack spacing={2} alignItems="flex-start">
              {sessionExpired ? (
                <Alert severity="warning" sx={{ alignSelf: "stretch" }}>
                  Your session expired. Sign in again to view your tax reports.
                </Alert>
              ) : (
                <Alert severity="info" sx={{ alignSelf: "stretch" }}>
                  {checkoutParam === "success"
                    ? "Payment received. Sign in to confirm your tax year pass."
                    : "Sign in to view your tax years, unlock reports, and download exports."}
                </Alert>
              )}
              <Box>{loginButton}</Box>
            </Stack>
          )}

          {isSignedIn && overviewError && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => void loadOverview()}>
                  Retry
                </Button>
              }
            >
              {overviewError}
            </Alert>
          )}
          {isSignedIn && !overview && !overviewError && <LinearProgress aria-label="Loading tax years" />}

          {isSignedIn && overview && (
            <>
              <Box component="section" aria-labelledby="tax-year-heading">
                <Typography id="tax-year-heading" variant="h6" component="h2" sx={{ mb: 1.5 }}>
                  Tax year
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 1.5,
                  }}
                >
                  {overview.years.map((item) => (
                    <TaxYearTile
                      key={item.taxYear}
                      item={item}
                      selected={item.taxYear === selectedTaxYear}
                      // Stripe's page doesn't name the year, so keep the started year on screen.
                      disabled={checkoutStartingYear !== null}
                      onSelect={handleSelectYear}
                    />
                  ))}
                </Box>
              </Box>

              {selectedItem &&
                (selectedItem.unlocked ? (
                  <Stack spacing={3}>
                    <ReportFiltersPanel
                      accounts={accounts}
                      accountsError={accountsError}
                      accountIds={accountIds}
                      onAccountIdsChange={setAccountIds}
                      includeUnassigned={includeUnassigned}
                      onIncludeUnassignedChange={setIncludeUnassigned}
                      symbolsInput={symbolsInput}
                      onSymbolsInputChange={setSymbolsInput}
                      assetTypes={assetTypes}
                      onAssetTypesChange={setAssetTypes}
                      currencies={currencies}
                      onCurrenciesChange={setCurrencies}
                      directions={directions}
                      onDirectionsChange={setDirections}
                    />
                    <SummaryOverview
                      taxYear={selectedItem.taxYear}
                      summary={visibleSummary}
                      loading={summaryLoading}
                      error={summaryError}
                      onRetry={() => setSummaryReloadCount((count) => count + 1)}
                    />
                    <ExportsPanel
                      taxYear={selectedItem.taxYear}
                      downloadingReportTypes={downloadingReportTypes}
                      includeNotes={includeNotes}
                      onIncludeNotesChange={setIncludeNotes}
                      onDownload={(reportType) => void handleDownload(reportType)}
                      error={visibleDownloadError}
                      onDismissError={() => setDownloadError(null)}
                    />
                    {visibleSummary && visibleSummary.tradeCount > 0 && (
                      <SummaryBreakdowns summary={visibleSummary} />
                    )}
                  </Stack>
                ) : (
                  <UnlockPanel
                    item={selectedItem}
                    overview={overview}
                    checkoutStartingYear={checkoutStartingYear}
                    confirming={confirmingTaxYear === selectedItem.taxYear}
                    awaitingCheckoutConfirmation={awaitingCheckoutConfirmation}
                    error={checkoutError}
                    onUnlock={(taxYear) => void handleUnlock(taxYear)}
                  />
                ))}
            </>
          )}

          {isSignedIn && passesError && <Alert severity="warning">{passesError}</Alert>}
          {isSignedIn && purchaseHistory.length > 0 && <PurchaseHistory passes={purchaseHistory} />}
        </Stack>
      </Container>
    </>
  );
}

function TaxYearTile({
  item,
  selected,
  disabled,
  onSelect,
}: {
  item: TaxYearOverviewItem;
  selected: boolean;
  disabled: boolean;
  onSelect: (taxYear: number) => void;
}) {
  const processing = !item.unlocked && item.passStatus === "PROCESSING";
  const statusLabel = item.unlocked ? "Unlocked" : processing ? "Processing" : "Locked";
  const statusIcon = item.unlocked ? (
    <LockOpenIcon fontSize="small" color="success" />
  ) : processing ? (
    <HourglassTopIcon fontSize="small" color="info" />
  ) : (
    <LockOutlinedIcon fontSize="small" color="action" />
  );

  return (
    <ToggleButton
      value={item.taxYear}
      selected={selected}
      disabled={disabled}
      onChange={() => onSelect(item.taxYear)}
      color="primary"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 0.25,
        p: 1.5,
        textAlign: "left",
        textTransform: "none",
        // The selected tint alone is about 1.4:1 against the dark background, so outline it too.
        "&.Mui-selected": {
          borderColor: "primary.main",
          boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}`,
        },
      }}
    >
      <Stack component="span" direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
        <Typography variant="h6" component="span" fontWeight={700} sx={{ flexGrow: 1 }}>
          {item.taxYear}
        </Typography>
        {statusIcon}
      </Stack>
      <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }}>
        {formatClosedTradeCount(item.closedTradeCount)}
      </Typography>
      <Typography variant="caption" component="span" fontWeight={600} sx={{ display: "block" }}>
        {statusLabel}
      </Typography>
    </ToggleButton>
  );
}

function UnlockPanel({
  item,
  overview,
  checkoutStartingYear,
  confirming,
  awaitingCheckoutConfirmation,
  error,
  onUnlock,
}: {
  item: TaxYearOverviewItem;
  overview: TaxYearOverview;
  checkoutStartingYear: number | null;
  confirming: boolean;
  awaitingCheckoutConfirmation: boolean;
  error: string | null;
  onUnlock: (taxYear: number) => void;
}) {
  const starting = checkoutStartingYear === item.taxYear;
  const inProgress = item.taxYear === overview.currentTaxYear;
  const price = overview.price
    ? formatMinorUnits(overview.price.amountCents, overview.price.currency)
    : null;
  const included = [
    {
      name: "Annual summary in the app",
      description: "Totals, months, accounts, symbols and asset types, per currency.",
    },
    ...TAX_YEAR_EXPORTS.map((report) => ({
      name: `${report.name} CSV`,
      description: report.description,
    })),
  ];

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="unlock-heading"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockOutlinedIcon color="action" />
          <Typography id="unlock-heading" variant="h5" component="h2" fontWeight={700}>
            Unlock {item.taxYear}
          </Typography>
        </Stack>
        <Box>
          {price && (
            <Typography variant="h4" component="p" fontWeight={800}>
              {price}
            </Typography>
          )}
          <Typography color="text.secondary">
            One-time payment for the {item.taxYear} tax year pass. No subscription and no renewal.
          </Typography>
        </Box>
        <Box>
          <Typography>
            {formatClosedTradeCount(item.closedTradeCount)} recorded in {item.taxYear}
            {inProgress ? " so far" : ""}.
          </Typography>
          {inProgress && (
            <Typography variant="body2" color="text.secondary">
              The {item.taxYear} tax year is still in progress. The pass also covers trades you add
              later.
            </Typography>
          )}
        </Box>
        {item.closedTradeCount === 0 && (
          <Alert severity="warning" role="note">
            No closed trades are recorded in {item.taxYear} yet. A {item.taxYear} pass does not
            unlock any other tax year.
          </Alert>
        )}

        <Box>
          <Typography variant="subtitle2" component="h3">
            What&apos;s included
          </Typography>
          <List dense disablePadding>
            {included.map((feature) => (
              <ListItem key={feature.name} disableGutters alignItems="flex-start">
                <ListItemIcon sx={{ minWidth: 32, mt: 0.75 }}>
                  <CheckIcon fontSize="small" color="success" />
                </ListItemIcon>
                <ListItemText primary={feature.name} secondary={feature.description} />
              </ListItem>
            ))}
          </List>
        </Box>

        {item.passStatus === "PROCESSING" && (
          <Alert severity="info">
            Payment processing — reports unlock when your payment clears.
          </Alert>
        )}
        {item.passStatus === "FAILED" && !awaitingCheckoutConfirmation && (
          <Alert severity="warning">
            Your last payment for {item.taxYear} did not go through. You can try again.
          </Alert>
        )}
        {item.passStatus === "REFUNDED" && (
          <Alert severity="info">Your {item.taxYear} tax year pass was refunded.</Alert>
        )}

        <Stack spacing={1} alignItems="flex-start">
          <Button
            variant="contained"
            onClick={() => onUnlock(item.taxYear)}
            disabled={!item.purchasable || checkoutStartingYear !== null || confirming}
            startIcon={starting ? <CircularProgress size={18} color="inherit" /> : <LockOpenIcon />}
          >
            Unlock {item.taxYear}
          </Button>
          {!overview.checkoutEnabled && (
            <Typography variant="body2" color="text.secondary">
              Checkout is not available yet.
            </Typography>
          )}
          {overview.checkoutEnabled && !item.purchasable && item.passStatus !== "PROCESSING" && (
            <Typography variant="body2" color="text.secondary">
              This tax year can&apos;t be unlocked.
            </Typography>
          )}
          {confirming && (
            <Typography variant="body2" color="text.secondary">
              Confirming your payment…
            </Typography>
          )}
          {(item.passStatus === "PENDING" || item.passStatus === "FAILED") && !confirming && (
            <Typography variant="body2" color="text.secondary">
              Already paid? Confirmation can take a minute, so refresh before paying again.
            </Typography>
          )}
          {error && (
            <Alert severity="error" sx={{ alignSelf: "stretch" }}>
              {error}
            </Alert>
          )}
          <Typography variant="caption" color="text.secondary">
            Payments are processed by Stripe. Refunds and other tax year pass terms are in the{" "}
            <Link component={RouterLink} to="/terms-of-service">
              Terms of Service
            </Link>
            .
          </Typography>
        </Stack>

        <Divider />
        <Typography variant="body2" color="text.secondary">
          {EXPORT_DISCLOSURE}
        </Typography>
      </Stack>
    </Paper>
  );
}

function MultiSelectField<T extends string>({
  label,
  emptyLabel,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  emptyLabel: string;
  options: SelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
}) {
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const nextValue = event.target.value as unknown as T[] | string;
        onChange(typeof nextValue === "string" ? (nextValue.split(",") as T[]) : nextValue);
      }}
      slotProps={{
        inputLabel: { shrink: true },
        select: {
          multiple: true,
          displayEmpty: true,
          renderValue: (selected) => {
            const selectedValues = selected as T[];
            return selectedValues.length === 0
              ? emptyLabel
              : selectedValues.map((item) => labelsByValue.get(item) ?? item).join(", ");
          },
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          <Checkbox size="small" checked={value.includes(option.value)} sx={{ py: 0 }} />
          <ListItemText primary={option.label} />
        </MenuItem>
      ))}
    </TextField>
  );
}

function ReportFiltersPanel({
  accounts,
  accountsError,
  accountIds,
  onAccountIdsChange,
  includeUnassigned,
  onIncludeUnassignedChange,
  symbolsInput,
  onSymbolsInputChange,
  assetTypes,
  onAssetTypesChange,
  currencies,
  onCurrenciesChange,
  directions,
  onDirectionsChange,
}: {
  accounts: TradingAccount[];
  accountsError: string | null;
  accountIds: string[];
  onAccountIdsChange: (value: string[]) => void;
  includeUnassigned: boolean;
  onIncludeUnassignedChange: (value: boolean) => void;
  symbolsInput: string;
  onSymbolsInputChange: (value: string) => void;
  assetTypes: AssetType[];
  onAssetTypesChange: (value: AssetType[]) => void;
  currencies: Currency[];
  onCurrenciesChange: (value: Currency[]) => void;
  directions: TradeDirection[];
  onDirectionsChange: (value: TradeDirection[]) => void;
}) {
  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }));
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="report-filters-heading"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography id="report-filters-heading" variant="h6" component="h2">
            Filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Filters apply to the summary and to every export.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
            },
            gap: 2,
          }}
        >
          <MultiSelectField
            label="Accounts"
            emptyLabel={accounts.length === 0 ? "No accounts" : "All accounts"}
            options={accountOptions}
            value={accountIds}
            onChange={onAccountIdsChange}
            disabled={accounts.length === 0}
          />
          <TextField
            fullWidth
            size="small"
            label="Symbols"
            placeholder="AAPL, MSFT"
            value={symbolsInput}
            onChange={(event) => onSymbolsInputChange(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <MultiSelectField
            label="Asset type"
            emptyLabel="All asset types"
            options={ASSET_TYPE_OPTIONS}
            value={assetTypes}
            onChange={onAssetTypesChange}
          />
          <MultiSelectField
            label="Currency"
            emptyLabel="All currencies"
            options={CURRENCY_OPTIONS}
            value={currencies}
            onChange={onCurrenciesChange}
          />
          <MultiSelectField
            label="Direction"
            emptyLabel="Long and short"
            options={DIRECTION_OPTIONS}
            value={directions}
            onChange={onDirectionsChange}
          />
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeUnassigned}
              onChange={(event) => onIncludeUnassignedChange(event.target.checked)}
            />
          }
          label="Include unassigned trades"
        />
        {accountsError && <Alert severity="warning">{accountsError}</Alert>}
      </Stack>
    </Paper>
  );
}

function Kpi({
  label,
  value,
  detail,
  valueColor = "text.primary",
}: {
  label: string;
  value: string;
  detail?: string;
  valueColor?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h6"
        component="p"
        fontWeight={700}
        color={valueColor}
        sx={{ overflowWrap: "anywhere" }}
      >
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      )}
    </Box>
  );
}

function SummaryOverview({
  taxYear,
  summary,
  loading,
  error,
  onRetry,
}: {
  taxYear: number;
  summary: AnnualSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const repurchaseFlagCount = summary?.repurchaseFlagCount ?? 0;
  return (
    <Box component="section" aria-labelledby="summary-heading">
      <Typography id="summary-heading" variant="h5" component="h2" fontWeight={700}>
        {taxYear} summary
      </Typography>
      {summary && summary.tradeCount > 0 && (
        <Typography variant="body2" color="text.secondary">
          {formatClosedTradeCount(summary.tradeCount)}
          {summary.firstClosedOn && summary.lastClosedOn
            ? ` · ${formatIsoDate(summary.firstClosedOn)} – ${formatIsoDate(summary.lastClosedOn)}`
            : ""}
        </Typography>
      )}
      {loading && <LinearProgress aria-label="Loading summary" sx={{ mt: 1.5 }} />}
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {summary && summary.tradeCount === 0 && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          No closed trades in {taxYear} match these filters.
        </Alert>
      )}
      {summary && summary.tradeCount > 0 && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {summary.totals.map((row) => (
            <Paper
              key={row.currency}
              variant="outlined"
              component="section"
              aria-label={`${row.currency} totals`}
              sx={{ p: 2 }}
            >
              <Typography variant="overline" color="text.secondary" fontWeight={700}>
                {row.currency}
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(4, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                <Kpi
                  label="Net realized P/L"
                  value={formatMoney(row.netRealizedPnl, row.currency)}
                  valueColor={pnlColor(row.netRealizedPnl)}
                />
                <Kpi
                  label="Trades"
                  value={row.tradeCount.toLocaleString()}
                  detail={`${row.winningTrades.toLocaleString()} winning · ${row.losingTrades.toLocaleString()} losing`}
                />
                <Kpi label="Win rate" value={formatWinRate(row)} />
                <Kpi
                  label="Fees + margin interest"
                  value={formatMoney(row.fees + row.marginInterest, row.currency)}
                />
              </Box>
            </Paper>
          ))}
          {repurchaseFlagCount > 0 && (
            <Alert severity="warning" variant="outlined" role="note">
              {repurchaseFlagCount === 1
                ? "1 loss has"
                : `${repurchaseFlagCount.toLocaleString()} losses have`}{" "}
              a same-symbol position opened within 30 days. Check them in the Repurchase review
              export below. No adjustments are applied.
            </Alert>
          )}
        </Stack>
      )}
    </Box>
  );
}

function ExportsPanel({
  taxYear,
  downloadingReportTypes,
  includeNotes,
  onIncludeNotesChange,
  onDownload,
  error,
  onDismissError,
}: {
  taxYear: number;
  downloadingReportTypes: TaxYearReportType[];
  includeNotes: boolean;
  onIncludeNotesChange: (value: boolean) => void;
  onDownload: (reportType: TaxYearReportType) => void;
  error: string | null;
  onDismissError: () => void;
}) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="exports-heading"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Typography id="exports-heading" variant="h6" component="h2">
        Exports
      </Typography>
      <Typography variant="body2" color="text.secondary">
        CSV files for {taxYear}, using the filters above.
      </Typography>
      <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
        {TAX_YEAR_EXPORTS.map((report) => {
          const downloading = downloadingReportTypes.includes(report.reportType);
          return (
            <Stack
              key={report.reportType}
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 1, sm: 2 }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{ py: 1.5 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={600}>{report.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {report.description}
                </Typography>
                {report.reportType === "TRADE_LEDGER" && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={includeNotes}
                        onChange={(event) => onIncludeNotesChange(event.target.checked)}
                      />
                    }
                    label="Include trade notes"
                    slotProps={{ typography: { variant: "body2" } }}
                  />
                )}
              </Box>
              <Button
                variant="outlined"
                size="small"
                aria-label={`Download CSV: ${report.name}`}
                startIcon={
                  downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />
                }
                // Not disabled, which would drop keyboard focus; the download handler ignores repeats.
                aria-disabled={downloading}
                onClick={() => onDownload(report.reportType)}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Download CSV
              </Button>
            </Stack>
          );
        })}
      </Stack>
      {error && (
        <Alert severity="error" onClose={onDismissError} sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      <Alert severity="info" variant="outlined" role="note" sx={{ mt: 2 }}>
        {EXPORT_DISCLOSURE}
      </Alert>
    </Paper>
  );
}

function SummaryTable({
  title,
  labelHeader,
  rows,
  caption,
  renderLabel = (row) => row.label,
}: {
  title: string;
  labelHeader: string;
  rows: SummaryRow[];
  caption?: string;
  renderLabel?: (row: SummaryRow) => ReactNode;
}) {
  const secondaryColumn = { display: { xs: "none", sm: "table-cell" } };
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography variant="subtitle1" component="h3" fontWeight={700}>
        {title}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      )}
      <TableContainer sx={{ mt: 1 }}>
        <Table size="small" aria-label={title} sx={COMPACT_TABLE_SX}>
          <TableHead>
            <TableRow>
              <TableCell>{labelHeader}</TableCell>
              <TableCell align="right">Trades</TableCell>
              <TableCell align="right" sx={secondaryColumn}>
                Win rate
              </TableCell>
              <TableCell align="right" sx={secondaryColumn}>
                Fees + interest
              </TableCell>
              <TableCell align="right">Net realized P/L</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.key}:${row.currency}`}>
                <TableCell sx={{ overflowWrap: "anywhere" }}>{renderLabel(row)}</TableCell>
                <TableCell align="right">{row.tradeCount.toLocaleString()}</TableCell>
                <TableCell align="right" sx={secondaryColumn}>
                  {formatWinRate(row)}
                </TableCell>
                <TableCell align="right" sx={secondaryColumn}>
                  {formatMoney(row.fees + row.marginInterest, row.currency)}
                </TableCell>
                <TableCell align="right" sx={{ color: pnlColor(row.netRealizedPnl), whiteSpace: "nowrap" }}>
                  {formatMoney(row.netRealizedPnl, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function SummaryBreakdowns({ summary }: { summary: AnnualSummary }) {
  return (
    <Box
      component="section"
      aria-label={`${summary.taxYear} breakdowns`}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
        gap: 2,
        alignItems: "start",
      }}
    >
      <SummaryTable
        title="By month"
        labelHeader="Month"
        rows={summary.months}
        renderLabel={formatMonthLabel}
      />
      <SummaryTable
        title="By account"
        labelHeader="Account"
        rows={summary.accounts}
        renderLabel={(row) => (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap" }}>
            <span>{row.label}</span>
            {row.taxFree && <Chip label="Tax-free" size="small" variant="outlined" color="success" />}
          </Stack>
        )}
      />
      <SummaryTable
        title="Top symbols"
        labelHeader="Symbol"
        rows={summary.symbols.slice(0, TOP_SYMBOL_ROW_COUNT)}
        caption={`Top ${TOP_SYMBOL_ROW_COUNT} by net realized P/L. The annual summary export lists every symbol.`}
      />
      <SummaryTable title="By asset type" labelHeader="Asset type" rows={summary.assetTypes} />
      <SummaryTable title="Taxable vs tax-free" labelHeader="Accounts" rows={summary.taxTreatment} />
    </Box>
  );
}

function PurchaseHistory({ passes }: { passes: PurchaseHistoryPass[] }) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="purchase-history-heading"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Typography id="purchase-history-heading" variant="h6" component="h2">
        Purchase history
      </Typography>
      <TableContainer sx={{ mt: 1 }}>
        <Table size="small" aria-label="Purchase history" sx={COMPACT_TABLE_SX}>
          <TableHead>
            <TableRow>
              <TableCell>Tax year</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Paid</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {passes.map((pass) => (
              <TableRow key={pass.id}>
                <TableCell>{pass.taxYear}</TableCell>
                <TableCell>
                  <Chip
                    label={PASS_STATUS_LABELS[pass.status]}
                    color={PASS_STATUS_COLORS[pass.status]}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {pass.amountTotal !== null && pass.currency
                    ? formatMinorUnits(pass.amountTotal, pass.currency)
                    : "—"}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {pass.paidAt ? formatInstantDate(pass.paidAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
