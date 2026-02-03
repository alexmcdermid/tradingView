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
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
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
import { updateUserPreferences } from "../api/users";
import { TradeDialog, type TradeFormValues } from "../components/TradeDialog";
import { TradesTable } from "../components/TradesTable";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import { computeRealizedPnl } from "../utils/tradeMath";
import {
  buildSharePayload,
  buildTradesSharePayload,
  encodeShareToken,
} from "../utils/shareLink";
import { createShareLink } from "../api/shares";
import { useColorMode } from "../theme/colorMode";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Day Trade Journal" },
    { name: "description", content: "Track trades and realized P/L by day and month" },
  ];
}

const computePnl = (payload: TradePayload) => {
  return computeRealizedPnl({
    entryPrice: payload.entryPrice,
    exitPrice: payload.exitPrice,
    quantity: payload.quantity,
    assetType: payload.assetType,
    direction: payload.direction,
    fees: payload.fees ?? 0,
    marginRate: payload.marginRate ?? 0,
    openedAt: payload.openedAt,
    closedAt: payload.closedAt,
  }) ?? 0;
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
  if (typeof document === "undefined") return false;
  
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.fontSize = "12pt";
  textarea.setAttribute("readonly", "");
  document.body.appendChild(textarea);
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textarea.setSelectionRange(0, textarea.value.length);
  } else {
    textarea.focus();
    textarea.select();
  }
  
  let success = false;
  try {
    success = document.execCommand("copy");
    if (!success && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      success = true;
    }
  } catch (err) {
    console.warn("Copy failed:", err);
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        success = true;
      } catch (clipErr) {
        console.warn("Clipboard API also failed:", clipErr);
      }
    }
  } finally {
    document.body.removeChild(textarea);
  }
  
  return success;
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
  marginRate?: number;
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
      marginRate: template.marginRate ?? 0,
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
      marginRate: payload.marginRate ?? 0,
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
  const [calendarValueMode, setCalendarValueMode] = useState<"pnl" | "percent">("pnl");
  const authBlockedRef = useRef(false);
  const { user, token, loginButton, initializing, logout, preferences, setPreferences } = useAuth();
  const { mode, setMode } = useColorMode();
  const wasAuthenticated = useRef<boolean>(!!user && !!token);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
  const [preferencesDraft, setPreferencesDraft] = useState<{
    themeMode: "light" | "dark";
    pnlDisplayMode: "pnl" | "percent";
  } | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
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
      authBlockedRef.current
    ) {
      return;
    }
    if (
      err instanceof ApiError &&
      (err.status === 401 || err.status === 403) &&
      message.toLowerCase().includes("not allowed")
    ) {
      setAuthBlockedMessage(
        "This dev environment is for repo contributors only. Your account is not on the dev allowlist. Contact the repo owner to request access."
      );
      authBlockedRef.current = true;
      return;
    }
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      logout();
      setError("Session expired. Please sign in again.");
      return;
    }
    setError(message);
  };

  useEffect(() => {
    if (!user || !token) {
      setCalendarValueMode("pnl");
      return;
    }
    setCalendarValueMode(preferences?.pnlDisplayMode === "PERCENT" ? "percent" : "pnl");
  }, [preferences?.pnlDisplayMode, token, user]);

  const computeSummary = useCallback((list: Trade[], month?: string, rate?: number, fxDate?: string): PnlSummary => {
    const cadToUsd = rate ?? 1;
    const rateDate = fxDate ?? new Date().toISOString().slice(0, 10);
    const toUsd = (trade: Trade) =>
      trade.currency === "CAD" ? trade.realizedPnl * cadToUsd : trade.realizedPnl;
    const toUsdNotional = (trade: Trade) => {
      const multiplier = trade.assetType === "OPTION" ? 100 : 1;
      const notional = trade.entryPrice * trade.quantity * multiplier;
      const usdNotional = trade.currency === "CAD" ? notional * cadToUsd : notional;
      return Math.abs(usdNotional);
    };
    const filtered = month
      ? list.filter((trade) => trade.closedAt.startsWith(month))
      : list;
    const totalPnl = filtered.reduce((acc, trade) => acc + toUsd(trade), 0);
    const totalNotional = filtered.reduce((acc, trade) => {
      const multiplier = trade.assetType === "OPTION" ? 100 : 1;
      const notional = trade.entryPrice * trade.quantity * multiplier;
      const usdNotional = trade.currency === "CAD" ? notional * cadToUsd : notional;
      return acc + Math.abs(usdNotional);
    }, 0);
    const pnlPercent = totalNotional > 0
      ? Number(((totalPnl / totalNotional) * 100).toFixed(2))
      : undefined;
    const dailyMap = new Map<string, { pnl: number; trades: number; notional: number }>();
    const monthlyMap = new Map<string, { pnl: number; trades: number; notional: number }>();

    filtered.forEach((trade) => {
      const day = trade.closedAt.slice(0, 10);
      const month = trade.closedAt.slice(0, 7);
      const notional = toUsdNotional(trade);
      dailyMap.set(day, {
        pnl: (dailyMap.get(day)?.pnl || 0) + toUsd(trade),
        trades: (dailyMap.get(day)?.trades || 0) + 1,
        notional: (dailyMap.get(day)?.notional || 0) + notional,
      });
      monthlyMap.set(month, {
        pnl: (monthlyMap.get(month)?.pnl || 0) + toUsd(trade),
        trades: (monthlyMap.get(month)?.trades || 0) + 1,
        notional: (monthlyMap.get(month)?.notional || 0) + notional,
      });
    });

    const daily: PnlBucket[] = Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([period, data]) => ({
        period,
        pnl: Number(data.pnl.toFixed(2)),
        trades: data.trades,
        pnlPercent: data.notional > 0
          ? Number(((data.pnl / data.notional) * 100).toFixed(2))
          : undefined,
      }));
    const monthly: PnlBucket[] = Array.from(monthlyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([period, data]) => ({
        period,
        pnl: Number(data.pnl.toFixed(2)),
        trades: data.trades,
        pnlPercent: data.notional > 0
          ? Number(((data.pnl / data.notional) * 100).toFixed(2))
          : undefined,
      }));

    return {
      totalPnl: Number(totalPnl.toFixed(2)),
      tradeCount: filtered.length,
      daily,
      monthly,
      pnlPercent,
      cadToUsdRate: cadToUsd,
      fxDate: rateDate,
    };
  }, []);

  const loadTrades = useCallback(async (targetPage: number, targetSize: number, date?: string) => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingTrades(true);
      const tradeData = await fetchTrades(targetPage, targetSize, undefined, date);
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
    if (!user || !token || selectedDate) {
      return;
    }
    loadTrades(page, pageSize);
  }, [loadTrades, page, pageSize, selectedDate, token, user]);

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
        pnlPercent: allSummary.pnlPercent,
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
        pnlPercent: allSummary.pnlPercent,
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
      authBlockedRef.current = false;
    }
  }, [user]);

  const handleOpenNewTrade = () => {
    setEditingTrade(null);
    setTradeDialogOpen(true);
  };

  const handleOpenPreferencesDialog = () => {
    setPreferencesDraft({
      themeMode: mode,
      pnlDisplayMode: calendarValueMode,
    });
    setPreferencesDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleClosePreferencesDialog = () => {
    if (savingPreferences) {
      return;
    }
    setPreferencesDialogOpen(false);
    setPreferencesDraft(null);
  };

  const handleSavePreferences = async () => {
    if (!preferencesDraft || !user || !token) {
      return;
    }
    const { themeMode, pnlDisplayMode } = preferencesDraft;
    const hasChanges =
      themeMode !== mode || pnlDisplayMode !== calendarValueMode;
    if (!hasChanges) {
      setPreferencesDialogOpen(false);
      setPreferencesDraft(null);
      return;
    }
    setSavingPreferences(true);
    try {
      await updateUserPreferences({
        themeMode: themeMode === "dark" ? "DARK" : "LIGHT",
        pnlDisplayMode: pnlDisplayMode === "percent" ? "PERCENT" : "PNL",
      });
      setPreferences({
        themeMode: themeMode === "dark" ? "DARK" : "LIGHT",
        pnlDisplayMode: pnlDisplayMode === "percent" ? "PERCENT" : "PNL",
      });
      setMode(themeMode);
      setCalendarValueMode(pnlDisplayMode);
      setPreferencesDialogOpen(false);
      setPreferencesDraft(null);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSavingPreferences(false);
    }
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
      marginRate: values.marginRate === "" ? 0 : Number(values.marginRate),
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
        if (selectedDate) {
          await loadTrades(0, pageSize, selectedDate);
        } else {
          await loadTrades(page, pageSize);
        }
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
          marginRate: Number(payload.marginRate || 0),
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
            pnlPercent: allSummary.pnlPercent,
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
        if (selectedDate) {
          await loadTrades(0, pageSize, selectedDate);
        } else {
          await loadTrades(page, pageSize);
        }
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
      
      const shareLink = await createShareLink({
        shareType: "SUMMARY",
        data: JSON.stringify(payload),
        requiresAuth: false,
        expiryDays: 30,
      });
      
      const shareUrl = new URL(`/share/${shareLink.code}`, window.location.origin);
      const urlString = shareUrl.toString();
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile && navigator.share) {
        try {
          await navigator.share({
            url: urlString,
          });
          setShareMessage("Share link sent.");
          return;
        } catch (shareErr: any) {
          if (shareErr.name !== "AbortError") {
            console.warn("Share API failed, trying clipboard:", shareErr);
          } else {
            return;
          }
        }
      }
      
      const copied = await copyTextToClipboard(urlString);
      if (!copied) {
        prompt("Copy this share link:", urlString);
        setShareMessage("Share link created (copied to dialog).");
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
      
      const shareLink = await createShareLink({
        shareType: "TRADES",
        data: JSON.stringify(payload),
        requiresAuth: false,
        expiryDays: 7,
      });
      
      const shareUrl = new URL(`/share/${shareLink.code}`, window.location.origin);
      const urlString = shareUrl.toString();
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile && navigator.share) {
        try {
          await navigator.share({
            url: urlString,
          });
          setShareMessage("Share link sent.");
          return;
        } catch (shareErr: any) {
          if (shareErr.name !== "AbortError") {
            console.warn("Share API failed, trying clipboard:", shareErr);
          } else {
            return;
          }
        }
      }
      
      const copied = await copyTextToClipboard(urlString);
      if (!copied) {
        prompt("Copy this share link:", urlString);
        setShareMessage("Share link created (copied to dialog).");
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
      return;
    }
    setPage(0);
    await loadTrades(0, pageSize);
  };

  const handleDateSelect = (date: string) => {
    if (!user || !token) {
      setSelectedDate((prev) => (prev === date ? null : date));
      return;
    }
    setSelectedDate((prev) => {
      const next = prev === date ? null : date;
      setPage(0);
      if (next) {
        void loadTrades(0, pageSize, next);
      } else {
        void loadTrades(0, pageSize);
      }
      return next;
    });
  };

  const handleClearSelectedDate = () => {
    setSelectedDate(null);
    if (!user || !token) {
      return;
    }
    setPage(0);
    void loadTrades(0, pageSize);
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
                  <MenuItem onClick={handleOpenPreferencesDialog}>
                    Preferences
                  </MenuItem>
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
                percent={aggregateStats?.pnlPercent}
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
                    {summary
                      ? `P/L ${calendarMonth}: ${summary.totalPnl.toFixed(2)} USD${
                          summary.pnlPercent != null ? ` (${summary.pnlPercent.toFixed(2)}%)` : ""
                        }`
                      : ""}
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
                valueMode={calendarValueMode}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {fxRate
                  ? `P/L shown in USD. CAD trades converted at ${fxRate.toFixed(5)} CAD/USD${fxDate ? ` (BOC effective date: ${fxDate})` : ""}.`
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
                  onDelete={handleClearSelectedDate}
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
                marginRate: editingTrade.marginRate ?? "",
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
        open={preferencesDialogOpen}
        onClose={handleClosePreferencesDialog}
        aria-labelledby="preferences-dialog-title"
      >
        <DialogTitle id="preferences-dialog-title">Preferences</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl component="fieldset">
              <FormLabel component="legend">Theme</FormLabel>
              <RadioGroup
                value={preferencesDraft?.themeMode ?? mode}
                onChange={(event) => {
                  const next = event.target.value as "light" | "dark";
                  setPreferencesDraft((prev) => ({
                    themeMode: next,
                    pnlDisplayMode: prev?.pnlDisplayMode ?? calendarValueMode,
                  }));
                }}
              >
                <FormControlLabel value="light" control={<Radio />} label="Light" />
                <FormControlLabel value="dark" control={<Radio />} label="Dark" />
              </RadioGroup>
            </FormControl>
            <FormControl component="fieldset">
              <FormLabel component="legend">Calendar values</FormLabel>
              <RadioGroup
                value={preferencesDraft?.pnlDisplayMode ?? calendarValueMode}
                onChange={(event) => {
                  const next = event.target.value as "pnl" | "percent";
                  setPreferencesDraft((prev) => ({
                    themeMode: prev?.themeMode ?? mode,
                    pnlDisplayMode: next,
                  }));
                }}
              >
                <FormControlLabel value="pnl" control={<Radio />} label="P/L" />
                <FormControlLabel value="percent" control={<Radio />} label="% Return" />
              </RadioGroup>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePreferencesDialog} disabled={savingPreferences}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSavePreferences}
            disabled={savingPreferences}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

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
  percent,
  loading,
}: {
  title: string;
  value?: number;
  trades?: number;
  percent?: number;
  loading?: boolean;
}) {
  const display = value != null
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " USD"
    : "—";
  const percentLabel = percent != null
    ? `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`
    : null;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
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
              ? `${percentLabel ? `${percentLabel} return • ` : ""}${trades} trade${trades === 1 ? "" : "s"}`
              : percentLabel
                ? `${percentLabel} return`
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
    <Card variant="outlined" sx={{ height: "100%" }}>
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
