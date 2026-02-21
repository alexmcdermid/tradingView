import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
  TextField,
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
import type {
  AggregateStats,
  PnlBucket,
  PnlSummary,
  ShareLinkResponse,
  Trade,
  TradePayload,
  TradingAccount,
} from "../api/types";
import {
  createUserAccount,
  deleteUserAccount,
  listUserAccounts,
  updateUserPreferences,
} from "../api/users";
import { TradeDialog, type TradeFormValues } from "../components/TradeDialog";
import { TradesTable } from "../components/TradesTable";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import { computeRealizedPnl } from "../utils/tradeMath";
import {
  buildSharePayload,
  buildTradesSharePayload,
} from "../utils/shareLink";
import { createShareLink, deleteShareLink, listUserShareLinks } from "../api/shares";
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

const normalizeAccount = (account: TradingAccount): TradingAccount => {
  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const legacyFee = toFiniteNumber(account.defaultFees, 0);
  const legacyMargin = toFiniteNumber(account.defaultMarginRate, 0);
  return {
    ...account,
    defaultStockFees: toFiniteNumber(account.defaultStockFees, legacyFee),
    defaultOptionFees: toFiniteNumber(account.defaultOptionFees, legacyFee),
    defaultMarginRateUsd: toFiniteNumber(account.defaultMarginRateUsd, legacyMargin),
    defaultMarginRateCad: toFiniteNumber(account.defaultMarginRateCad, legacyMargin),
  };
};

const blurActiveElement = () => {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};

const formatShareTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const pad2 = (value: number) => String(value).padStart(2, "0");

type StatsScope = {
  year?: number;
  month?: string;
  day?: string;
  normalized: string;
};

const isValidIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
};

const parseStatsScope = (value: string): StatsScope | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { normalized: "" };
  }
  if (/^\d{4}$/.test(trimmed)) {
    return {
      year: Number(trimmed),
      normalized: trimmed,
    };
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return {
      year: Number(trimmed.slice(0, 4)),
      month: trimmed,
      normalized: trimmed,
    };
  }
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(trimmed) && isValidIsoDate(trimmed)) {
    return {
      year: Number(trimmed.slice(0, 4)),
      month: trimmed.slice(0, 7),
      day: trimmed,
      normalized: trimmed,
    };
  }
  return null;
};

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
      marginRate: 6.25,
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
      marginRate: 4.5,
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
      marginRate: 5.75,
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
      marginRate: 3.9,
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
  const [shareManagerOpen, setShareManagerOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkResponse[]>([]);
  const [loadingShareLinks, setLoadingShareLinks] = useState(false);
  const [deletingShareCode, setDeletingShareCode] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState({
    name: "",
    defaultStockFees: "0",
    defaultOptionFees: "0",
    defaultMarginRateUsd: "0",
    defaultMarginRateCad: "0",
  });
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const [calendarValueMode, setCalendarValueMode] = useState<"pnl" | "percent">("pnl");
  const [statsScopeFilter, setStatsScopeFilter] = useState<string | null>(null);
  const [statsScopeDraft, setStatsScopeDraft] = useState("");
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
  const parsedStatsScope = useMemo(() => {
    if (!statsScopeFilter) {
      return { year: undefined, month: undefined, day: undefined };
    }
    const parsed = parseStatsScope(statsScopeFilter);
    if (!parsed) {
      return { year: undefined, month: undefined, day: undefined };
    }
    return parsed;
  }, [statsScopeFilter]);
  const hasExplicitStatsScope = !!statsScopeFilter?.trim();
  const effectiveStatsScope = useMemo(() => {
    if (!hasExplicitStatsScope) {
      const fallbackYear = Number(calendarMonth.slice(0, 4));
      const fallbackMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(calendarMonth) ? calendarMonth : undefined;
      return {
        year: Number.isFinite(fallbackYear) ? fallbackYear : undefined,
        month: fallbackMonth,
        day: undefined,
      };
    }
    return parsedStatsScope;
  }, [calendarMonth, hasExplicitStatsScope, parsedStatsScope]);

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

  const pickBestBucket = useCallback((buckets: PnlBucket[]) => {
    if (buckets.length === 0) {
      return null;
    }
    return buckets.reduce((best, bucket) => (bucket.pnl > best.pnl ? bucket : best));
  }, []);

  const resolveLatestTradeYear = useCallback((list: Trade[]) => {
    const fallbackYear = new Date().getUTCFullYear();
    if (list.length === 0) {
      return fallbackYear;
    }
    const latestYear = list.reduce((best, trade) => {
      const parsedYear = Number(trade.closedAt.slice(0, 4));
      if (!Number.isFinite(parsedYear)) {
        return best;
      }
      return Math.max(best, parsedYear);
    }, 0);
    return latestYear > 0 ? latestYear : fallbackYear;
  }, []);

  const buildScopedAggregateStats = useCallback(
    (
      list: Trade[],
      year?: number,
      month?: string | null,
      day?: string | null,
      rate?: number,
      fxDate?: string
    ): AggregateStats => {
      const scopedYear = year
        ?? (day ? Number(day.slice(0, 4)) : month ? Number(month.slice(0, 4)) : resolveLatestTradeYear(list));
      const scoped = computeSummary(list, String(scopedYear), rate, fxDate);
      const bestMonth = pickBestBucket(scoped.monthly);
      const scopedMonth = month ?? (day ? day.slice(0, 7) : bestMonth?.period ?? null);
      const bestDay = day
        ? (scoped.daily.find((bucket) => bucket.period === day) ?? null)
        : pickBestBucket(scopedMonth
            ? scoped.daily.filter((bucket) => bucket.period.startsWith(scopedMonth))
            : []);
      return {
        totalPnl: scoped.totalPnl,
        tradeCount: scoped.tradeCount,
        bestDay,
        bestMonth,
        pnlPercent: scoped.pnlPercent,
        cadToUsdRate: scoped.cadToUsdRate,
        fxDate: scoped.fxDate,
        year: scopedYear,
        month: scopedMonth,
        day: day ?? null,
      };
    },
    [computeSummary, pickBestBucket, resolveLatestTradeYear]
  );

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
      const stats = await fetchAggregateStats(
        effectiveStatsScope.year,
        effectiveStatsScope.month,
        effectiveStatsScope.day
      );
      setAggregateStats(stats);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingStats(false);
    }
  }, [effectiveStatsScope.day, effectiveStatsScope.month, effectiveStatsScope.year, token, user]);

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
      setAggregateStats(
        buildScopedAggregateStats(
          seed,
          effectiveStatsScope.year,
          effectiveStatsScope.month,
          effectiveStatsScope.day,
          rate,
          fxDate
        )
      );
      guestSeeded.current = true;
      return;
    }
    if (!initializing && !user && !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, calendarMonth, rate, fxDate));
      setAggregateStats(
        buildScopedAggregateStats(
          trades,
          effectiveStatsScope.year,
          effectiveStatsScope.month,
          effectiveStatsScope.day,
          rate,
          fxDate
        )
      );
    }
  }, [
    buildScopedAggregateStats,
    calendarMonth,
    computeSummary,
    initializing,
    effectiveStatsScope.day,
    effectiveStatsScope.month,
    effectiveStatsScope.year,
    token,
    trades,
    user,
  ]);

  useEffect(() => {
    const isAuthed = !!user && !!token;
    if (!wasAuthenticated.current && isAuthed) {
      setTrades([]);
      setSummary(null);
      setAggregateStats(null);
      setSelectedDate(null);
      setPage(0);
      setPageMeta({ totalPages: 0, hasNext: false, hasPrevious: false, totalElements: 0 });
      setAccounts([]);
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
      setAccounts([]);
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

  const loadShareLinks = async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingShareLinks(true);
      const links = await listUserShareLinks();
      setShareLinks(links);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingShareLinks(false);
    }
  };

  const loadAccounts = async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingAccounts(true);
      const nextAccounts = await listUserAccounts();
      setAccounts(nextAccounts.map(normalizeAccount));
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    void loadAccounts();
  }, [token, user]);

  const handleOpenShareManager = () => {
    if (!user || !token) {
      setShareWarning("Sign in to manage share links.");
      return;
    }
    setMenuAnchor(null);
    blurActiveElement();
    setShareManagerOpen(true);
    void loadShareLinks();
  };

  const handleCopyManagedShareLink = async (code: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const urlString = new URL(`/share/${code}`, window.location.origin).toString();
    const copied = await copyTextToClipboard(urlString);
    if (!copied) {
      prompt("Copy this share link:", urlString);
      setShareMessage("Share link copied to dialog.");
      return;
    }
    setShareMessage("Share link copied.");
  };

  const handleDeleteManagedShareLink = async (code: string) => {
    try {
      setDeletingShareCode(code);
      await deleteShareLink(code);
      setShareLinks((prev) => prev.filter((link) => link.code !== code));
      setShareMessage("Share link deleted.");
    } catch (err) {
      handleRequestError(err);
    } finally {
      setDeletingShareCode(null);
    }
  };

  const handleOpenAccountsDialog = () => {
    if (!user || !token) {
      setShareWarning("Sign in to manage accounts.");
      return;
    }
    blurActiveElement();
    setAccountsDialogOpen(true);
    void loadAccounts();
    setMenuAnchor(null);
  };

  const handleCreateAccount = async () => {
    if (!accountDraft.name.trim()) {
      setError("Account name is required.");
      return;
    }
    const stockFees = Number(accountDraft.defaultStockFees);
    const optionFees = Number(accountDraft.defaultOptionFees);
    const marginUsd = Number(accountDraft.defaultMarginRateUsd);
    const marginCad = Number(accountDraft.defaultMarginRateCad);
    if (
      !Number.isFinite(stockFees) ||
      !Number.isFinite(optionFees) ||
      !Number.isFinite(marginUsd) ||
      !Number.isFinite(marginCad) ||
      stockFees < 0 ||
      optionFees < 0 ||
      marginUsd < 0 ||
      marginCad < 0
    ) {
      setError("Default stock fees, option fees, and USD/CAD margin rates must be valid values greater than or equal to 0.");
      return;
    }
    try {
      setSavingAccount(true);
      const created = await createUserAccount({
        name: accountDraft.name.trim(),
        defaultStockFees: Number(stockFees.toFixed(2)),
        defaultOptionFees: Number(optionFees.toFixed(2)),
        defaultMarginRateUsd: Number(marginUsd.toFixed(4)),
        defaultMarginRateCad: Number(marginCad.toFixed(4)),
      });
      const normalizedCreated = normalizeAccount(created);
      setAccounts((prev) => [
        normalizedCreated,
        ...prev.filter((account) => account.id !== normalizedCreated.id),
      ]);
      setAccountDraft({
        name: "",
        defaultStockFees: "0",
        defaultOptionFees: "0",
        defaultMarginRateUsd: "0",
        defaultMarginRateCad: "0",
      });
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      setDeletingAccountId(accountId);
      await deleteUserAccount(accountId);
      setAccounts((prev) => prev.filter((account) => account.id !== accountId));
    } catch (err) {
      handleRequestError(err);
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleOpenNewTrade = () => {
    blurActiveElement();
    setEditingTrade(null);
    setTradeDialogOpen(true);
  };

  const handleOpenPreferencesDialog = () => {
    blurActiveElement();
    setPreferencesDraft({
      themeMode: mode,
      pnlDisplayMode: calendarValueMode,
    });
    setStatsScopeDraft(statsScopeFilter ?? "");
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
    if (!preferencesDraft) return;

    const parsedScope = parseStatsScope(statsScopeDraft);
    if (!parsedScope) {
      setError("Widget scope must be blank or use YYYY, YYYY-MM, or YYYY-MM-DD.");
      return;
    }

    const normalizedScope = parsedScope.normalized || null;
    const { themeMode, pnlDisplayMode } = preferencesDraft;
    const hasPreferenceChanges =
      themeMode !== mode ||
      pnlDisplayMode !== calendarValueMode;
    const hasWidgetChanges = normalizedScope !== statsScopeFilter;

    if (!hasPreferenceChanges && !hasWidgetChanges) {
      setPreferencesDialogOpen(false);
      setPreferencesDraft(null);
      return;
    }

    if (hasPreferenceChanges && user && token) {
      setSavingPreferences(true);
      try {
        await updateUserPreferences({
          themeMode: themeMode === "dark" ? "DARK" : "LIGHT",
          pnlDisplayMode: pnlDisplayMode === "percent" ? "PERCENT" : "PNL",
        });
      } catch (err) {
        handleRequestError(err);
        setSavingPreferences(false);
        return;
      } finally {
        setSavingPreferences(false);
      }
      setPreferences({
        themeMode: themeMode === "dark" ? "DARK" : "LIGHT",
        pnlDisplayMode: pnlDisplayMode === "percent" ? "PERCENT" : "PNL",
      });
    }

    if (hasPreferenceChanges) {
      setMode(themeMode);
      setCalendarValueMode(pnlDisplayMode);
    }
    if (hasWidgetChanges) {
      setStatsScopeFilter(normalizedScope);
    }

    setPreferencesDialogOpen(false);
    setPreferencesDraft(null);
  };

  const handleEditTrade = (trade: Trade) => {
    blurActiveElement();
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
      accountId: values.accountId || undefined,
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
          accountId: payload.accountId ?? null,
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
          setAggregateStats(
            buildScopedAggregateStats(
              next,
              effectiveStatsScope.year,
              effectiveStatsScope.month,
              effectiveStatsScope.day,
              rate,
              fxDate
            )
          );
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
    blurActiveElement();
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
          setAggregateStats(
            buildScopedAggregateStats(
              next,
              effectiveStatsScope.year,
              effectiveStatsScope.month,
              effectiveStatsScope.day,
              rate,
              fxDate
            )
          );
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
      setShareLinks((prev) => [shareLink, ...prev.filter((link) => link.code !== shareLink.code)]);
      
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
        accountNamesById,
      });
      
      const shareLink = await createShareLink({
        shareType: "TRADES",
        data: JSON.stringify(payload),
        requiresAuth: false,
        expiryDays: 7,
      });
      setShareLinks((prev) => [shareLink, ...prev.filter((link) => link.code !== shareLink.code)]);
      
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
  const accountNamesById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );

  const scopedStatsYear = aggregateStats?.year ?? effectiveStatsScope.year ?? new Date().getUTCFullYear();
  const scopedStatsMonth = aggregateStats?.month ?? effectiveStatsScope.month ?? aggregateStats?.bestMonth?.period ?? null;
  const scopedStatsDay = aggregateStats?.day ?? effectiveStatsScope.day ?? null;

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
                  <MenuItem onClick={handleOpenAccountsDialog}>
                    Manage Accounts
                  </MenuItem>
                  <MenuItem onClick={handleOpenShareManager}>
                    Manage Share Links
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
                title={`Total Realized P/L (${scopedStatsYear})`}
                value={aggregateStats?.totalPnl}
                trades={aggregateStats?.tradeCount}
                percent={aggregateStats?.pnlPercent}
                loading={loadingStats}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title={`Best Month (${scopedStatsYear})`}
                bucket={aggregateStats?.bestMonth || null}
                loading={loadingStats}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BucketCard
                title={scopedStatsDay ? `Day (${scopedStatsDay})` : `Best Day (${scopedStatsMonth ?? "month"})`}
                bucket={aggregateStats?.bestDay || null}
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
              accountNamesById={accountNamesById}
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
                accountId: editingTrade.accountId || undefined,
              }
            : undefined
        }
        accounts={accounts}
        submitting={savingTrade}
        onClose={() => {
          setTradeDialogOpen(false);
          setEditingTrade(null);
        }}
        onSubmit={handleSaveTrade}
      />

      <Dialog
        open={shareManagerOpen}
        onClose={() => setShareManagerOpen(false)}
        aria-labelledby="share-manager-dialog-title"
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id="share-manager-dialog-title">Manage Share Links</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {loadingShareLinks ? (
              <Typography variant="body2" color="text.secondary">
                Loading share links...
              </Typography>
            ) : shareLinks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No share links yet. Create one from Share Month or Share Day.
              </Typography>
            ) : (
              shareLinks.map((link) => {
                const expired = new Date(link.expiresAt).getTime() < Date.now();
                return (
                  <Box
                    key={link.code}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        spacing={1}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip label={link.shareType} size="small" />
                          <Chip
                            label={expired ? "Expired" : "Active"}
                            size="small"
                            color={expired ? "default" : "success"}
                            variant={expired ? "outlined" : "filled"}
                          />
                          <Chip
                            label={link.requiresAuth ? "Auth required" : "Public"}
                            size="small"
                            variant="outlined"
                          />
                        </Stack>
                        <Typography variant="body2" fontFamily="monospace">
                          {link.code}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Created: {formatShareTimestamp(link.createdAt)} | Expires: {formatShareTimestamp(link.expiresAt)} | Views: {link.accessCount}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ContentCopyIcon />}
                          onClick={() => void handleCopyManagedShareLink(link.code)}
                        >
                          Copy Link
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<DeleteOutlineIcon />}
                          disabled={deletingShareCode === link.code}
                          onClick={() => void handleDeleteManagedShareLink(link.code)}
                        >
                          {deletingShareCode === link.code ? "Deleting..." : "Delete"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                );
              })
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareManagerOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={accountsDialogOpen}
        onClose={() => {
          if (!savingAccount && !deletingAccountId) {
            setAccountsDialogOpen(false);
          }
        }}
        aria-labelledby="accounts-dialog-title"
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id="accounts-dialog-title">Accounts</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack spacing={1.5}>
              <TextField
                label="Brokerage Name"
                value={accountDraft.name}
                onChange={(event) =>
                  setAccountDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                fullWidth
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label="Stock Fee"
                  type="number"
                  value={accountDraft.defaultStockFees}
                  onChange={(event) =>
                    setAccountDraft((prev) => ({
                      ...prev,
                      defaultStockFees: event.target.value,
                    }))
                  }
                  inputProps={{ min: 0, step: 0.01 }}
                  fullWidth
                />
                <TextField
                  label="Option Fee"
                  type="number"
                  value={accountDraft.defaultOptionFees}
                  onChange={(event) =>
                    setAccountDraft((prev) => ({
                      ...prev,
                      defaultOptionFees: event.target.value,
                    }))
                  }
                  inputProps={{ min: 0, step: 0.01 }}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label="Margin USD %"
                  type="number"
                  value={accountDraft.defaultMarginRateUsd}
                  onChange={(event) =>
                    setAccountDraft((prev) => ({
                      ...prev,
                      defaultMarginRateUsd: event.target.value,
                    }))
                  }
                  inputProps={{ min: 0, step: 0.01 }}
                  fullWidth
                />
                <TextField
                  label="Margin CAD %"
                  type="number"
                  value={accountDraft.defaultMarginRateCad}
                  onChange={(event) =>
                    setAccountDraft((prev) => ({
                      ...prev,
                      defaultMarginRateCad: event.target.value,
                    }))
                  }
                  inputProps={{ min: 0, step: 0.01 }}
                  fullWidth
                />
              </Stack>
            </Stack>
            <Button
              variant="outlined"
              onClick={handleCreateAccount}
              disabled={savingAccount}
            >
              {savingAccount ? "Adding..." : "Add Account"}
            </Button>

            {loadingAccounts ? (
              <Typography variant="body2" color="text.secondary">
                Loading accounts...
              </Typography>
            ) : accounts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No accounts yet. Trades can still be logged without selecting an account.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {accounts.map((account) => {
                  const stockFeeRaw = Number(account.defaultStockFees ?? account.defaultFees ?? 0);
                  const optionFeeRaw = Number(account.defaultOptionFees ?? account.defaultFees ?? 0);
                  const marginUsdRaw = Number(account.defaultMarginRateUsd ?? account.defaultMarginRate ?? 0);
                  const marginCadRaw = Number(account.defaultMarginRateCad ?? account.defaultMarginRate ?? 0);
                  const stockFee = Number.isFinite(stockFeeRaw) ? stockFeeRaw : 0;
                  const optionFee = Number.isFinite(optionFeeRaw) ? optionFeeRaw : 0;
                  const marginUsd = Number.isFinite(marginUsdRaw) ? marginUsdRaw : 0;
                  const marginCad = Number.isFinite(marginCadRaw) ? marginCadRaw : 0;
                  return (
                    <Box
                      key={account.id}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 1.5,
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                      >
                        <Typography variant="body2" fontWeight={700}>
                          {account.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Stock fee: {stockFee.toFixed(2)} | Option fee: {optionFee.toFixed(2)} | Margin USD: {marginUsd.toFixed(2)}% | Margin CAD: {marginCad.toFixed(2)}%
                        </Typography>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => void handleDeleteAccount(account.id)}
                          disabled={deletingAccountId === account.id}
                        >
                          {deletingAccountId === account.id ? "Deleting..." : "Delete"}
                        </Button>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAccountsDialogOpen(false)}
            disabled={savingAccount || !!deletingAccountId}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={preferencesDialogOpen}
        onClose={handleClosePreferencesDialog}
        aria-labelledby="preferences-dialog-title"
        fullWidth
        maxWidth="md"
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
            <TextField
              label="Widget scope (optional)"
              value={statsScopeDraft}
              onChange={(event) => setStatsScopeDraft(event.target.value)}
              placeholder="Auto (most recent trade year)"
              helperText="Leave blank for auto. Accepted: YYYY, YYYY-MM, or YYYY-MM-DD."
            />
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
  const value = bucket?.pnl ?? 0;
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " USD";
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
              : "0 trades"}
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
