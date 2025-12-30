import AddIcon from "@mui/icons-material/Add";
import CandlestickChartOutlinedIcon from "@mui/icons-material/CandlestickChartOutlined";
import {
  Alert,
  AppBar,
  Avatar,
  Chip,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Route } from "./+types/home";
import { Link as RouterLink } from "react-router";
import {
  createTrade,
  deleteTrade,
  fetchSummary,
  fetchTrades,
  updateTrade,
} from "../api/trades";
import type { PnlBucket, PnlSummary, Trade, TradePayload } from "../api/types";
import { TradeDialog, type TradeFormValues } from "../components/TradeDialog";
import { TradesTable } from "../components/TradesTable";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Day Trade Journal" },
    { name: "description", content: "Track trades and realized P/L by day and month" },
  ];
}

const parseEmailList = (value?: string) => {
  if (!value) {
    return new Set<string>();
  }
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
};

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [yearSummary, setYearSummary] = useState<PnlSummary | null>(null);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingYearSummary, setLoadingYearSummary] = useState(false);
  const loadingData = loadingTrades || loadingSummary;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [pageMeta, setPageMeta] = useState<{ totalPages: number; hasNext: boolean; hasPrevious: boolean; totalElements: number }>({
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
    totalElements: 0,
  });
  const [calendarMonth, setCalendarMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const { user, token, loginButton, initializing, logout } = useAuth();
  const wasAuthenticated = useRef<boolean>(!!user && !!token);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const guestSeeded = useRef<boolean>(false);
  const adminEmailSet = useMemo(() => {
    const adminList =
      import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.VITE_ALLOWED_EMAILS;
    return parseEmailList(adminList);
  }, []);
  const isAdmin = useMemo(() => {
    if (!user?.email) {
      return false;
    }
    if (adminEmailSet.size === 0) {
      return false;
    }
    return adminEmailSet.has(user.email.toLowerCase());
  }, [adminEmailSet, user?.email]);

  const handleRequestError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Request failed";
    if (
      err instanceof ApiError &&
      (err.status === 401 || err.status === 403) &&
      message.toLowerCase().includes("email not allowed")
    ) {
      setAuthBlockedMessage(
        "Signed-in accounts must be explicitly enabled for dev. You can browse, but API actions will fail until you're added."
      );
      return;
    }
    setError(message);
  };

  const computePnl = (payload: TradePayload) => {
    const quantity = Number(payload.quantity || 0);
    const entry = Number(payload.entryPrice || 0);
    const exit = Number(payload.exitPrice || 0);
    const fees = Number(payload.fees || 0);
    const directionMultiplier = payload.direction === "SHORT" ? -1 : 1;
    const movement = (exit - entry) * directionMultiplier;
    const multiplier = payload.assetType === "OPTION" ? 100 : 1;
    return Number((movement * quantity * multiplier - fees).toFixed(2));
  };

  const computeSummary = useCallback((list: Trade[], month?: string, rate?: number, fxDate?: string): PnlSummary => {
    const cadToUsd = rate ?? 1;
    const rateDate = fxDate ?? new Date().toISOString().slice(0, 10);
    const toUsd = (trade: Trade) =>
      trade.currency === "CAD" ? trade.realizedPnl * cadToUsd : trade.realizedPnl;
    const filtered = month
      ? list.filter((trade) => trade.closedAt.startsWith(month))
      : list;
    const totalPnl = filtered.reduce((acc, trade) => acc + toUsd(trade), 0);
    const dailyMap = new Map<string, { pnl: number; trades: number }>();
    const monthlyMap = new Map<string, { pnl: number; trades: number }>();

    filtered.forEach((trade) => {
      const day = trade.closedAt.slice(0, 10);
      const month = trade.closedAt.slice(0, 7);
      dailyMap.set(day, {
        pnl: (dailyMap.get(day)?.pnl || 0) + toUsd(trade),
        trades: (dailyMap.get(day)?.trades || 0) + 1,
      });
      monthlyMap.set(month, {
        pnl: (monthlyMap.get(month)?.pnl || 0) + toUsd(trade),
        trades: (monthlyMap.get(month)?.trades || 0) + 1,
      });
    });

    const daily: PnlBucket[] = Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([period, data]) => ({ period, pnl: Number(data.pnl.toFixed(2)), trades: data.trades }));
    const monthly: PnlBucket[] = Array.from(monthlyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([period, data]) => ({ period, pnl: Number(data.pnl.toFixed(2)), trades: data.trades }));

    return {
      totalPnl: Number(totalPnl.toFixed(2)),
      tradeCount: filtered.length,
      daily,
      monthly,
      cadToUsdRate: cadToUsd,
      fxDate: rateDate,
    };
  }, []);

  const loadTrades = useCallback(async (targetPage: number, targetSize: number) => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingTrades(true);
      const tradeData = await fetchTrades(targetPage, targetSize);
      setTrades(tradeData.items);
      setPage(tradeData.page);
      setPageSize(tradeData.size);
      setPageMeta({
        totalPages: tradeData.totalPages,
        hasNext: tradeData.hasNext,
        hasPrevious: tradeData.hasPrevious,
        totalElements: tradeData.totalElements,
      });
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingTrades(false);
    }
  }, [token, user]);

  const loadSummary = useCallback(async (month: string) => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingSummary(true);
      const summaryData = await fetchSummary(month);
      setSummary(summaryData);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingSummary(false);
    }
  }, [token, user]);

  const loadYearSummary = useCallback(async (year: number) => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingYearSummary(true);
      const summaryData = await fetchSummary();
      setYearSummary({
        ...summaryData,
        monthly: summaryData.monthly.filter((bucket) => bucket.period.startsWith(String(year))),
      });
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingYearSummary(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    loadTrades(page, pageSize);
  }, [loadTrades, page, pageSize, token, user]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    loadSummary(calendarMonth);
    loadYearSummary(Number(calendarMonth.slice(0, 4)));
  }, [calendarMonth, loadSummary, loadYearSummary, token, user]);

  useEffect(() => {
    if (user && token) {
      return;
    }
    if (!initializing && !user && !token && trades.length === 0 && !guestSeeded.current) {
      const seed: Trade[] = [
        {
          id: "seed-1",
          symbol: "AAPL",
          currency: "USD",
          assetType: "STOCK",
          direction: "LONG",
          quantity: 10,
          entryPrice: 180,
          exitPrice: 190,
          fees: 0,
          optionType: null,
          strikePrice: null,
          expiryDate: null,
          openedAt: "2025-12-20",
          closedAt: "2025-12-21",
          realizedPnl: 100,
          notes: "Sample USD trade",
          createdAt: "2025-12-21T00:00:00Z",
          updatedAt: "2025-12-21T00:00:00Z",
        },
        {
          id: "seed-2",
          symbol: "TSLA",
          currency: "CAD",
          assetType: "STOCK",
          direction: "SHORT",
          quantity: 5,
          entryPrice: 250,
          exitPrice: 245,
          fees: 2.99,
          optionType: null,
          strikePrice: null,
          expiryDate: null,
          openedAt: "2025-12-22",
          closedAt: "2025-12-23",
          realizedPnl: 23,
          notes: "Sample CAD trade",
          createdAt: "2025-12-23T00:00:00Z",
          updatedAt: "2025-12-23T00:00:00Z",
        },
      ];
      setTrades(seed);
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(seed, calendarMonth, rate, fxDate));
      const year = Number(calendarMonth.slice(0, 4));
      setYearSummary(computeSummary(seed.filter((t) => t.closedAt.startsWith(String(year))), undefined, rate, fxDate));
      guestSeeded.current = true;
      return;
    }
    if (!initializing && !user && !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, calendarMonth, rate, fxDate));
      const year = Number(calendarMonth.slice(0, 4));
      setYearSummary(computeSummary(trades.filter((t) => t.closedAt.startsWith(String(year))), undefined, rate, fxDate));
    }
  }, [calendarMonth, computeSummary, trades, token, user, initializing]);

  useEffect(() => {
    const isAuthed = !!user && !!token;
    if (wasAuthenticated.current && !isAuthed) {
      setTrades([]);
      setPage(0);
      setPageMeta({ totalPages: 0, hasNext: false, hasPrevious: false, totalElements: 0 });
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary([], calendarMonth, rate, fxDate));
      setLoadingTrades(false);
      setLoadingSummary(false);
      guestSeeded.current = false;
    }
    wasAuthenticated.current = isAuthed;
  }, [calendarMonth, computeSummary, token, user]);

  useEffect(() => {
    if (!user) {
      setAuthBlockedMessage(null);
    }
  }, [user]);

  const handleOpenNewTrade = () => {
    setEditingTrade(null);
    setTradeDialogOpen(true);
  };

  const handleEditTrade = (trade: Trade) => {
    setEditingTrade(trade);
    setTradeDialogOpen(true);
  };

  const handleSaveTrade = async (values: TradeFormValues) => {
    const payload: TradePayload = {
      symbol: values.symbol.trim().toUpperCase(),
      currency: values.currency,
      assetType: values.assetType,
      direction: values.direction,
      quantity: Number(values.quantity),
      entryPrice: Number(values.entryPrice),
      exitPrice: Number(values.exitPrice),
      fees: Number(values.fees || 0),
      optionType: values.assetType === "OPTION" ? values.optionType : undefined,
      strikePrice:
        values.assetType === "OPTION" && values.strikePrice !== undefined
          ? Number(values.strikePrice)
          : undefined,
      expiryDate: values.assetType === "OPTION" ? values.expiryDate : undefined,
      openedAt: values.openedAt,
      closedAt: values.closedAt,
      notes: values.notes?.trim() || undefined,
    };

    try {
      setSavingTrade(true);
      if (user && token) {
        if (editingTrade) {
          await updateTrade(editingTrade.id, payload);
        } else {
          await createTrade(payload);
        }
        await loadTrades(page, pageSize);
        await loadSummary(calendarMonth);
      } else {
        const realizedPnl = computePnl(payload);
        const now = new Date().toISOString();
        const rate = summary?.cadToUsdRate;
        const fxDate = summary?.fxDate;
        const localTrade: Trade = {
          id: editingTrade?.id || `guest-${Date.now()}`,
          ...payload,
          fees: Number(payload.fees || 0),
          strikePrice: payload.strikePrice ?? null,
          expiryDate: payload.expiryDate ?? null,
          optionType: payload.optionType ?? null,
          realizedPnl,
          createdAt: editingTrade?.createdAt || now,
          updatedAt: now,
        };
        setTrades((prev) => {
          const next = editingTrade
            ? prev.map((t) => (t.id === editingTrade.id ? localTrade : t))
            : [localTrade, ...prev];
          setSummary(computeSummary(next, calendarMonth, rate, fxDate));
          return next;
        });
      }
      setTradeDialogOpen(false);
      setEditingTrade(null);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSavingTrade(false);
    }
  };

  const handleDeleteTrade = async (trade: Trade) => {
    const confirmed = window.confirm(`Delete trade for ${trade.symbol}?`);
    if (!confirmed) return;
    try {
      if (user && token) {
        await deleteTrade(trade.id);
        await loadTrades(page, pageSize);
        await loadSummary(calendarMonth);
      } else {
        const rate = summary?.cadToUsdRate;
        const fxDate = summary?.fxDate;
        setTrades((prev) => {
          const next = prev.filter((t) => t.id !== trade.id);
          setSummary(computeSummary(next, calendarMonth, rate, fxDate));
          return next;
        });
      }
    } catch (err) {
      handleRequestError(err);
    }
  };

  const handleMonthChange = async (month: string) => {
    setCalendarMonth(month);
    setSelectedDate(null);
    setPage(0);
    if (!user || !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, month, rate, fxDate));
    }
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
    setPage(0);
  };

  const filteredTrades = useMemo(() => {
    if (!selectedDate) return trades;
    return trades.filter((trade) => trade.closedAt.startsWith(selectedDate));
  }, [selectedDate, trades]);

  const bestBucket = useMemo(() => {
    if (!summary || summary.daily.length === 0) return null;
    return summary.daily.reduce((best, bucket) =>
      bucket.pnl > best.pnl ? bucket : best
    );
  }, [summary]);

  const bestMonth = useMemo(() => {
    if (!yearSummary || yearSummary.monthly.length === 0) return null;
    return yearSummary.monthly.reduce((best, bucket) =>
      bucket.pnl > best.pnl ? bucket : best
    );
  }, [yearSummary]);

  const monthlyColor = useMemo(() => {
    if (!summary) return undefined;
    if (summary.totalPnl > 0) return "success.main";
    if (summary.totalPnl < 0) return "error.main";
    return "text.primary";
  }, [summary]);
  const fxRate = summary?.cadToUsdRate;
  const fxDate = summary?.fxDate;

  const userInitials = useMemo(() => {
    if (!user) return "ANON";
    const source = user.name || user.email || user.sub || "";
    const parts = source.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase() || "?";
  }, [user]);

  if (initializing) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography variant="body1">Loading...</Typography>
      </Container>
    );
  }

  return (
    <>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={700}>
              Day Trade Journal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Simple P/L tracker
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {user ? (
              <>
                <IconButton
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  size="small"
                  aria-label="User menu"
                >
                  <Avatar sx={{ width: 40, height: 40 }}>{userInitials}</Avatar>
                </IconButton>
                <Menu
                  anchorEl={menuAnchor}
                  open={Boolean(menuAnchor)}
                  onClose={() => setMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem disabled>
                    <Typography variant="body2">
                      {user.name || user.email || "Account"}
                    </Typography>
                  </MenuItem>
                  {isAdmin && (
                    <MenuItem
                      component={RouterLink}
                      to="/admin"
                      onClick={() => setMenuAnchor(null)}
                    >
                      Admin
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => setMenuAnchor(null)}>Settings (coming soon)</MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuAnchor(null);
                      logout();
                    }}
                  >
                    Sign out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <>{loginButton}</>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 2 }}>
        <Stack spacing={3}>
          {!user && (
            <Alert severity="info">
              You&apos;re in guest mode. Log trades to explore the desk; sign in to persist them.
            </Alert>
          )}
          {authBlockedMessage && (
            <Alert severity="warning" onClose={() => setAuthBlockedMessage(null)}>
              {authBlockedMessage}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatCard
                title="Total Realized P/L"
                value={summary?.totalPnl}
                trades={summary?.tradeCount}
                loading={loadingData}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title="Best Day (month)"
                bucket={bestBucket}
                loading={loadingData}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title="Best Month (year)"
                bucket={bestMonth}
                loading={loadingData}
              />
            </Grid>
          </Grid>

          <Card variant="outlined">
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={1}
                sx={{ mb: 2 }}
              >
                <Typography variant="h6" fontWeight={700}>
                  Monthly P/L Calendar
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color={monthlyColor} fontWeight={700}>
                    {summary ? `P/L ${calendarMonth}: ${summary.totalPnl.toFixed(2)} USD` : ""}
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleOpenNewTrade}
                    size="small"
                  >
                    Log Trade
                  </Button>
                </Stack>
              </Stack>
              <MonthlyCalendar
                daily={summary?.daily || []}
                initialMonth={summary?.daily?.[0]?.period}
                month={calendarMonth}
                onMonthChange={handleMonthChange}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {fxRate
                  ? `P/L shown in USD. CAD trades converted at ${fxRate.toFixed(3)} CAD/USD${fxDate ? ` (as of ${fxDate})` : ""}.`
                  : "P/L shown in USD. CAD trades converted using the latest rate from the API."}
              </Typography>
            </CardContent>
          </Card>

          <Box>
            <TradesTable
              trades={filteredTrades}
              loading={loadingData}
              onEdit={handleEditTrade}
              onDelete={handleDeleteTrade}
              page={user && !selectedDate ? page : undefined}
              pageSize={user && !selectedDate ? pageSize : undefined}
              totalElements={user && !selectedDate ? pageMeta.totalElements : undefined}
              onPageChange={
                user && !selectedDate
                  ? (newPage) => {
                      setPage(Math.max(0, newPage));
                    }
                  : undefined
              }
              onPageSizeChange={
                user && !selectedDate
                  ? (size) => {
                      setPageSize(size);
                      setPage(0);
                    }
                  : undefined
              }
            />
            {selectedDate && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Filtered by date:
                </Typography>
                <Chip
                  label={selectedDate.replace(/-/g, "/")}
                  onDelete={() => setSelectedDate(null)}
                  size="small"
                />
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>

      <TradeDialog
        open={tradeDialogOpen}
        initialValues={
          editingTrade
            ? {
                symbol: editingTrade.symbol,
                currency: editingTrade.currency,
                assetType: editingTrade.assetType,
                direction: editingTrade.direction,
                quantity: editingTrade.quantity,
                entryPrice: editingTrade.entryPrice,
                exitPrice: editingTrade.exitPrice,
                fees: editingTrade.fees,
                optionType: editingTrade.optionType || undefined,
                strikePrice: editingTrade.strikePrice || undefined,
                expiryDate: editingTrade.expiryDate || undefined,
                openedAt: editingTrade.openedAt,
                closedAt: editingTrade.closedAt,
                notes: editingTrade.notes || undefined,
              }
            : undefined
        }
        submitting={savingTrade}
        onClose={() => {
          setTradeDialogOpen(false);
          setEditingTrade(null);
        }}
        onSubmit={handleSaveTrade}
      />

      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

function StatCard({
  title,
  value,
  trades,
  loading,
}: {
  title: string;
  value?: number;
  trades?: number;
  loading?: boolean;
}) {
  const display = value?.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography
          variant="h5"
          fontWeight={800}
          color={!value ? "text.primary" : value >= 0 ? "success.main" : "error.main"}
        >
          {loading ? "…" : display ?? "—"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : trades !== undefined
              ? `${trades} trade${trades === 1 ? "" : "s"}`
              : "No trades"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function BucketCard({
  title,
  bucket,
  loading,
  icon,
}: {
  title: string;
  bucket: PnlBucket | null;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const value = bucket?.pnl;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="overline" color="text.secondary">
            {title}
          </Typography>
          {icon}
        </Stack>
        <Typography
          variant="h5"
          fontWeight={800}
          color={!value ? "text.primary" : value >= 0 ? "success.main" : "error.main"}
        >
          {loading ? "…" : value?.toFixed(2) ?? "—"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : bucket
              ? `${bucket.period} • ${bucket.trades} trade${bucket.trades === 1 ? "" : "s"}`
              : "No data yet"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function BucketList({
  title,
  buckets,
  loading,
}: {
  title: string;
  buckets: PnlBucket[];
  loading?: boolean;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : buckets.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No entries yet.
        </Typography>
      ) : (
        buckets.slice(0, 6).map((bucket) => (
          <Stack
            key={`${title}-${bucket.period}`}
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="body2">{bucket.period}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {bucket.trades} trade{bucket.trades === 1 ? "" : "s"}
              </Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                color={bucket.pnl >= 0 ? "success.main" : "error.main"}
              >
                {bucket.pnl.toFixed(2)}
              </Typography>
            </Stack>
          </Stack>
        ))
      )}
    </Stack>
  );
}
