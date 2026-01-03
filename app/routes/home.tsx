import AddIcon from "@mui/icons-material/Add";
import CandlestickChartOutlinedIcon from "@mui/icons-material/CandlestickChartOutlined";
import ShareIcon from "@mui/icons-material/Share";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
  fetchAggregateStats,
  fetchSummary,
  fetchTrades,
  updateTrade,
} from "../api/trades";
import type { AggregateStats, PnlBucket, PnlSummary, Trade, TradePayload } from "../api/types";
import { TradeDialog, type TradeFormValues } from "../components/TradeDialog";
import { TradesTable } from "../components/TradesTable";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import {
  buildSharePayload,
  buildTradesSharePayload,
  encodeShareToken,
  SHARE_QUERY_PARAM,
} from "../utils/shareLink";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Day Trade Journal" },
    { name: "description", content: "Track trades and realized P/L by day and month" },
  ];
}

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

const detectEnvironment = () => {
  if (import.meta.env.VITE_APP_ENV) {
    return String(import.meta.env.VITE_APP_ENV);
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (
      host.includes("localhost") ||
      host.includes("127.0.0.1") ||
      host.includes("dev") ||
      host.includes("staging")
    ) {
      return "dev";
    }
  }
  return import.meta.env.PROD ? "prod" : "dev";
};

const copyTextToClipboard = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const result = document.execCommand("copy");
      return result;
    } finally {
      document.body.removeChild(textarea);
    }
  }
  return false;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const buildDate = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

const addDays = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return buildDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const getWeekdayDates = (year: number, monthIndex: number, count: number) => {
  const dates: number[] = [];
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      dates.push(day);
      if (dates.length >= count) {
        break;
      }
    }
  }
  return dates;
};

type SeedTemplate = {
  symbol: string;
  currency: Trade["currency"];
  assetType: Trade["assetType"];
  direction: Trade["direction"];
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  optionType?: TradePayload["optionType"];
  strikePrice?: TradePayload["strikePrice"];
  expiryOffsetDays?: number;
  notes?: string;
};

const buildGuestSeedTrades = (month: string): Trade[] => {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText) || new Date().getUTCFullYear();
  const monthIndex = Math.max(0, Math.min(11, Number(monthText) - 1 || new Date().getUTCMonth()));
  const templates: SeedTemplate[] = [
    {
      symbol: "AAPL",
      currency: "USD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 12,
      entryPrice: 182,
      exitPrice: 187,
      fees: 1.5,
      notes: "Earnings pop",
    },
    {
      symbol: "NVDA",
      currency: "USD",
      assetType: "STOCK",
      direction: "SHORT",
      quantity: 5,
      entryPrice: 610,
      exitPrice: 620,
      fees: 2,
      notes: "Momentum fade",
    },
    {
      symbol: "AMD",
      currency: "USD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 20,
      entryPrice: 110,
      exitPrice: 106,
      fees: 1,
      notes: "Stopped out",
    },
    {
      symbol: "META",
      currency: "USD",
      assetType: "STOCK",
      direction: "SHORT",
      quantity: 4,
      entryPrice: 330,
      exitPrice: 315,
      fees: 1,
    },
    {
      symbol: "TSLA",
      currency: "USD",
      assetType: "OPTION",
      direction: "LONG",
      quantity: 1,
      entryPrice: 6.2,
      exitPrice: 8.4,
      fees: 1.2,
      optionType: "CALL",
      strikePrice: 260,
      expiryOffsetDays: 18,
    },
    {
      symbol: "ADBE",
      currency: "USD",
      assetType: "OPTION",
      direction: "LONG",
      quantity: 1,
      entryPrice: 5.1,
      exitPrice: 3.0,
      fees: 1.0,
      optionType: "PUT",
      strikePrice: 500,
      expiryOffsetDays: 21,
    },
    {
      symbol: "RY",
      currency: "CAD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 30,
      entryPrice: 120,
      exitPrice: 124,
      fees: 4.95,
    },
    {
      symbol: "TD",
      currency: "CAD",
      assetType: "STOCK",
      direction: "SHORT",
      quantity: 25,
      entryPrice: 84,
      exitPrice: 86,
      fees: 4.95,
    },
    {
      symbol: "SHOP",
      currency: "CAD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 15,
      entryPrice: 92,
      exitPrice: 96,
      fees: 3.5,
    },
    {
      symbol: "ENB",
      currency: "CAD",
      assetType: "STOCK",
      direction: "SHORT",
      quantity: 40,
      entryPrice: 52,
      exitPrice: 49,
      fees: 4,
    },
    {
      symbol: "BNS",
      currency: "CAD",
      assetType: "OPTION",
      direction: "SHORT",
      quantity: 1,
      entryPrice: 2.4,
      exitPrice: 1.1,
      fees: 1.5,
      optionType: "CALL",
      strikePrice: 70,
      expiryOffsetDays: 14,
    },
    {
      symbol: "CNQ",
      currency: "CAD",
      assetType: "OPTION",
      direction: "LONG",
      quantity: 2,
      entryPrice: 3.2,
      exitPrice: 4.0,
      fees: 2,
      optionType: "PUT",
      strikePrice: 90,
      expiryOffsetDays: 16,
    },
    {
      symbol: "INTC",
      currency: "USD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 30,
      entryPrice: 42,
      exitPrice: 45,
      fees: 2,
    },
    {
      symbol: "NFLX",
      currency: "USD",
      assetType: "STOCK",
      direction: "SHORT",
      quantity: 3,
      entryPrice: 490,
      exitPrice: 500,
      fees: 2,
    },
    {
      symbol: "QQQ",
      currency: "USD",
      assetType: "OPTION",
      direction: "SHORT",
      quantity: 1,
      entryPrice: 4.8,
      exitPrice: 6.1,
      fees: 1.5,
      optionType: "PUT",
      strikePrice: 410,
      expiryOffsetDays: 20,
    },
    {
      symbol: "BCE",
      currency: "CAD",
      assetType: "STOCK",
      direction: "LONG",
      quantity: 50,
      entryPrice: 52.5,
      exitPrice: 53.4,
      fees: 5,
    },
  ];
  const weekdays = getWeekdayDates(year, monthIndex, templates.length);
  return templates.map((template, index) => {
    const day = weekdays[index % weekdays.length];
    const closedAt = buildDate(year, monthIndex, day);
    const openedAt = closedAt;
    const expiryDate =
      template.assetType === "OPTION"
        ? addDays(closedAt, template.expiryOffsetDays ?? 14)
        : null;
    const payload: TradePayload = {
      symbol: template.symbol,
      currency: template.currency,
      assetType: template.assetType,
      direction: template.direction,
      quantity: template.quantity,
      entryPrice: template.entryPrice,
      exitPrice: template.exitPrice,
      fees: template.fees ?? 0,
      optionType: template.optionType ?? undefined,
      strikePrice: template.strikePrice ?? undefined,
      expiryDate: expiryDate ?? undefined,
      openedAt,
      closedAt,
      notes: template.notes,
    };
    const realizedPnl = computePnl(payload);
    const timestamp = `${closedAt}T17:00:00Z`;
    return {
      id: `seed-${index + 1}`,
      ...payload,
      fees: payload.fees ?? 0,
      optionType: template.optionType ?? null,
      strikePrice: template.strikePrice ?? null,
      expiryDate,
      realizedPnl,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
};

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [aggregateStats, setAggregateStats] = useState<AggregateStats | null>(null);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareWarning, setShareWarning] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const { user, token, loginButton, initializing, logout } = useAuth();
  const wasAuthenticated = useRef<boolean>(!!user && !!token);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const guestSeeded = useRef<boolean>(false);
  const adminEmailSet = useMemo(() => {
    const adminList = import.meta.env.VITE_ADMIN_EMAILS;
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
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      logout();
      setError("Session expired. Please sign in again.");
      return;
    }
    setError(message);
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

  const loadAggregateStats = useCallback(async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingStats(true);
      const stats = await fetchAggregateStats();
      setAggregateStats(stats);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingStats(false);
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
  }, [calendarMonth, loadSummary, token, user]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    loadAggregateStats();
  }, [loadAggregateStats, token, user]);

  useEffect(() => {
    if (user && token) {
      return;
    }
    if (!initializing && !user && !token && trades.length === 0 && !guestSeeded.current) {
      const seed = buildGuestSeedTrades(calendarMonth);
      setTrades(seed);
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(seed, calendarMonth, rate, fxDate));
      const allSummary = computeSummary(seed, undefined, rate, fxDate);
      setAggregateStats({
        totalPnl: allSummary.totalPnl,
        tradeCount: allSummary.tradeCount,
        bestDay: allSummary.daily.length > 0 ? allSummary.daily.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
        bestMonth: allSummary.monthly.length > 0 ? allSummary.monthly.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
        cadToUsdRate: rate,
        fxDate,
      });
      guestSeeded.current = true;
      return;
    }
    if (!initializing && !user && !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, calendarMonth, rate, fxDate));
      const allSummary = computeSummary(trades, undefined, rate, fxDate);
      setAggregateStats({
        totalPnl: allSummary.totalPnl,
        tradeCount: allSummary.tradeCount,
        bestDay: allSummary.daily.length > 0 ? allSummary.daily.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
        bestMonth: allSummary.monthly.length > 0 ? allSummary.monthly.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
        cadToUsdRate: rate,
        fxDate,
      });
    }
  }, [calendarMonth, computeSummary, trades, token, user, initializing]);

  useEffect(() => {
    const isAuthed = !!user && !!token;
    if (!wasAuthenticated.current && isAuthed) {
      setTrades([]);
      setSummary(null);
      setAggregateStats(null);
      setSelectedDate(null);
      setPage(0);
      setPageMeta({ totalPages: 0, hasNext: false, hasPrevious: false, totalElements: 0 });
      guestSeeded.current = false;
    } else if (wasAuthenticated.current && !isAuthed) {
      setTrades([]);
      setPage(0);
      setPageMeta({ totalPages: 0, hasNext: false, hasPrevious: false, totalElements: 0 });
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary([], calendarMonth, rate, fxDate));
      setAggregateStats(null);
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
        await loadAggregateStats();
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
          const allSummary = computeSummary(next, undefined, rate, fxDate);
          setAggregateStats({
            totalPnl: allSummary.totalPnl,
            tradeCount: allSummary.tradeCount,
            bestDay: allSummary.daily.length > 0 ? allSummary.daily.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
            bestMonth: allSummary.monthly.length > 0 ? allSummary.monthly.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
            cadToUsdRate: rate,
            fxDate,
          });
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

  const handleDeleteTrade = (trade: Trade) => {
    setTradeToDelete(trade);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    if (deletingTrade) return;
    setDeleteDialogOpen(false);
    setTradeToDelete(null);
  };

  const handleConfirmDeleteTrade = async () => {
    if (!tradeToDelete) return;
    try {
      setDeletingTrade(true);
      if (user && token) {
        await deleteTrade(tradeToDelete.id);
        await loadTrades(page, pageSize);
        await loadSummary(calendarMonth);
        await loadAggregateStats();
      } else {
        const rate = summary?.cadToUsdRate;
        const fxDate = summary?.fxDate;
        setTrades((prev) => {
          const next = prev.filter((t) => t.id !== tradeToDelete.id);
          setSummary(computeSummary(next, calendarMonth, rate, fxDate));
          const allSummary = computeSummary(next, undefined, rate, fxDate);
          setAggregateStats({
            totalPnl: allSummary.totalPnl,
            tradeCount: allSummary.tradeCount,
            bestDay: allSummary.daily.length > 0 ? allSummary.daily.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
            bestMonth: allSummary.monthly.length > 0 ? allSummary.monthly.reduce((best, b) => b.pnl > best.pnl ? b : best) : null,
            cadToUsdRate: rate,
            fxDate,
          });
          return next;
        });
      }
      handleCloseDeleteDialog();
    } catch (err) {
      handleRequestError(err);
    } finally {
      setDeletingTrade(false);
    }
  };

  const handleShareMonth = async () => {
    if (!user || !token) {
      setShareWarning("Sign in to share a month.");
      return;
    }
    if (!summary) {
      setError("Load a month before sharing.");
      return;
    }
    if (typeof window === "undefined") return;
    try {
      setSharing(true);
      const payload = buildSharePayload(calendarMonth, summary, {
        env: detectEnvironment(),
        origin: window.location.origin,
      });
      const token = encodeShareToken(payload);
      const shareUrl = new URL("/share", window.location.origin);
      shareUrl.searchParams.set(SHARE_QUERY_PARAM, token);
      const copied = await copyTextToClipboard(shareUrl.toString());
      if (!copied) {
        setError("Could not copy the share link. Copy it manually if needed.");
        return;
      }
      setShareMessage("Share link copied. Send it to share this month's P/L.");
    } catch (err) {
      console.error(err);
      setError("Could not build the share link. Try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleShareDay = async () => {
    if (!user || !token) {
      setShareWarning("Sign in to share trades.");
      return;
    }
    if (!selectedDate) {
      setShareWarning("Select a day to share trades.");
      return;
    }
    if (filteredTrades.length === 0) {
      setShareWarning("No trades found for that day.");
      return;
    }
    if (typeof window === "undefined") return;
    try {
      setSharing(true);
      const payload = buildTradesSharePayload(selectedDate, filteredTrades, {
        env: detectEnvironment(),
        origin: window.location.origin,
        cadToUsdRate: summary?.cadToUsdRate,
        fxDate: summary?.fxDate,
      });
      const token = encodeShareToken(payload);
      const shareUrl = new URL("/share", window.location.origin);
      shareUrl.searchParams.set(SHARE_QUERY_PARAM, token);
      const copied = await copyTextToClipboard(shareUrl.toString());
      if (!copied) {
        setError("Could not copy the share link. Copy it manually if needed.");
        return;
      }
      setShareMessage(
        `Share link copied. Send it to share trades for ${selectedDate.replace(/-/g, "/")}.`
      );
    } catch (err) {
      console.error(err);
      setError("Could not build the share link. Try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleMonthChange = async (month: string) => {
    setCalendarMonth(month);
    setSelectedDate(null);
    if (!user || !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, month, rate, fxDate));
    }
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
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
    return aggregateStats?.bestMonth || null;
  }, [aggregateStats]);

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
        <Toolbar   
          disableGutters
          sx={{ justifyContent: "space-between", px: { xs: 1, sm: 2 } }}  
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.5, sm: 1 }}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Typography variant="h6" fontWeight={700}>
              Day Trade Journal
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Simple P/L tracker
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexWrap: "wrap", rowGap: 1, justifyContent: { xs: "flex-start", sm: "flex-end" } }}
          >
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
                  {/* <MenuItem onClick={() => setMenuAnchor(null)}>Settings (coming soon)</MenuItem> */}
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
                value={aggregateStats?.totalPnl}
                trades={aggregateStats?.tradeCount}
                loading={loadingStats}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title="Best Day (month)"
                bucket={bestBucket}
                loading={loadingSummary}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title="Best Month (all time)"
                bucket={bestMonth}
                loading={loadingStats}
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
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  <Typography variant="h6" fontWeight={700}>
                    Monthly P/L Calendar
                  </Typography>
                  <Typography variant="body2" color={monthlyColor} fontWeight={700}>
                    {summary ? `P/L ${calendarMonth}: ${summary.totalPnl.toFixed(2)} USD` : ""}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  {selectedDate && (
                    <Button
                      variant="outlined"
                      startIcon={<ShareIcon />}
                      onClick={handleShareDay}
                      size="small"
                      disabled={sharing || loadingTrades || filteredTrades.length === 0}
                    >
                      Share Day
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    startIcon={<ShareIcon />}
                    onClick={handleShareMonth}
                    size="small"
                    disabled={!summary || sharing || loadingSummary}
                  >
                    Share Month
                  </Button>
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
              loading={loadingTrades}
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

      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-trade-dialog-title"
        aria-describedby="delete-trade-dialog-description"
      >
        <DialogTitle id="delete-trade-dialog-title">Delete trade?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-trade-dialog-description">
            {tradeToDelete
              ? `Delete the trade for ${tradeToDelete.symbol}? This cannot be undone.`
              : "Delete this trade? This cannot be undone."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deletingTrade}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteTrade}
            color="error"
            variant="contained"
            disabled={deletingTrade}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

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
      <Snackbar
        open={!!shareMessage}
        autoHideDuration={3500}
        onClose={() => setShareMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setShareMessage(null)} severity="success" sx={{ width: "100%" }}>
          {shareMessage}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!shareWarning}
        autoHideDuration={3500}
        onClose={() => setShareWarning(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setShareWarning(null)} severity="warning" sx={{ width: "100%" }}>
          {shareWarning}
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
  const display = value != null
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " USD"
    : "—";
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
          {loading ? "…" : display}
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
  const formattedValue = value != null 
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " USD"
    : "—";
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
          {loading ? "…" : formattedValue}
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
