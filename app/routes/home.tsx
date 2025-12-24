import AddIcon from "@mui/icons-material/Add";
import CandlestickChartOutlinedIcon from "@mui/icons-material/CandlestickChartOutlined";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  IconButton,
  Snackbar,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Route } from "./+types/home";
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
import { useAuth } from "../auth/AuthProvider";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Day Trade Journal" },
    { name: "description", content: "Track trades and realized P/L by day and month" },
  ];
}

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, token, loginButton, initializing, logout } = useAuth();

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

  const computeSummary = useCallback((list: Trade[]): PnlSummary => {
    const totalPnl = list.reduce((acc, trade) => acc + (trade.realizedPnl || 0), 0);
    const dailyMap = new Map<string, { pnl: number; trades: number }>();
    const monthlyMap = new Map<string, { pnl: number; trades: number }>();

    list.forEach((trade) => {
      const day = trade.closedAt.slice(0, 10);
      const month = trade.closedAt.slice(0, 7);
      dailyMap.set(day, {
        pnl: (dailyMap.get(day)?.pnl || 0) + trade.realizedPnl,
        trades: (dailyMap.get(day)?.trades || 0) + 1,
      });
      monthlyMap.set(month, {
        pnl: (monthlyMap.get(month)?.pnl || 0) + trade.realizedPnl,
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
      tradeCount: list.length,
      daily,
      monthly,
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!user || !token) {
      setLoadingData(false);
      return;
    }
    try {
      setLoadingData(true);
      const [tradeData, summaryData] = await Promise.all([fetchTrades(), fetchSummary()]);
      setTrades(tradeData);
      setSummary(summaryData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingData(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!user || !token) {
      setLoadingData(false);
      setTrades([]);
      setSummary(null);
      return;
    }
    loadData();
  }, [loadData, token, user]);

  useEffect(() => {
    if (!user && trades.length > 0) {
      setSummary(computeSummary(trades));
    }
    if (!user && trades.length === 0) {
      setSummary(computeSummary([]));
    }
  }, [computeSummary, trades, user]);

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
        await loadData();
      } else {
        const realizedPnl = computePnl(payload);
        const now = new Date().toISOString();
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
          setSummary(computeSummary(next));
          return next;
        });
      }
      setTradeDialogOpen(false);
      setEditingTrade(null);
    } catch (err) {
      setError((err as Error).message);
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
        await loadData();
      } else {
        setTrades((prev) => {
          const next = prev.filter((t) => t.id !== trade.id);
          setSummary(computeSummary(next));
          return next;
        });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const bestBucket = useMemo(() => {
    if (!summary || summary.daily.length === 0) return null;
    return summary.daily.reduce((best, bucket) =>
      bucket.pnl > best.pnl ? bucket : best
    );
  }, [summary]);

  const bestMonth = useMemo(() => {
    if (!summary || summary.monthly.length === 0) return null;
    return summary.monthly.reduce((best, bucket) =>
      bucket.pnl > best.pnl ? bucket : best
    );
  }, [summary]);

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
          <Stack direction="row" spacing={1}>
            {user ? (
              <Button variant="text" onClick={logout}>
                Sign out
              </Button>
            ) : (
              <>{loginButton}</>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {!user && (
            <Alert severity="info">
              You&apos;re in guest mode. Log trades to explore the desk; sign in to persist them.
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
                title="Best Day"
                bucket={bestBucket}
                loading={loadingData}
                icon={<CandlestickChartOutlinedIcon color="success" />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title="Best Month"
                bucket={bestMonth}
                loading={loadingData}
                icon={<CandlestickChartOutlinedIcon color="primary" />}
              />
            </Grid>
          </Grid>

          <Card variant="outlined">
            <CardContent>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack spacing={1}>
                  <Typography variant="h6" fontWeight={700}>
                    P/L Breakdown
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Grouped by close date and month.
                  </Typography>
                </Stack>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleOpenNewTrade}
                >
                  Log Trade
                </Button>
              </Stack>

              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <BucketList
                    title="Daily"
                    buckets={summary?.daily || []}
                    loading={loadingData}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <BucketList
                    title="Monthly"
                    buckets={summary?.monthly || []}
                    loading={loadingData}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Box>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6" fontWeight={700}>
                Trades
              </Typography>
              <IconButton onClick={handleOpenNewTrade} color="primary">
                <AddIcon />
              </IconButton>
            </Stack>
            <TradesTable
              trades={trades}
              loading={loadingData}
              onEdit={handleEditTrade}
              onDelete={handleDeleteTrade}
            />
          </Box>
        </Stack>
      </Container>

      <TradeDialog
        open={tradeDialogOpen}
        initialValues={
          editingTrade
            ? {
                symbol: editingTrade.symbol,
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
          variant="h4"
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
