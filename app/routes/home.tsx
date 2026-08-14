import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ShareIcon from "@mui/icons-material/Share";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Alert,
  AppBar,
  Autocomplete,
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
  Checkbox,
  Paper,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type Key, type ReactNode } from "react";
import type { Route } from "./+types/home";
import { Link as RouterLink } from "react-router";
import {
  createTrade,
  deleteTrade,
  fetchAccountStats,
  fetchAggregateStats,
  fetchInferredAccountTradeCounts,
  fetchSummary,
  fetchTaxablePnl,
  fetchTradeCountStats,
  fetchTradeHistory,
  fetchTrades,
  updateTrade,
} from "../api/trades";
import type {
  AccountStats,
  AggregateStats,
  Currency,
  DashboardWidgetId,
  InferredAccountTradeCounts,
  PnlBucket,
  PnlSummary,
  ShareLinkResponse,
  Trade,
  TradeCountStats,
  TradeFilters,
  TradeHistory,
  TradeSortDirection,
  TradeSortField,
  TradePayload,
  TaxablePnl,
  TradingAccount,
} from "../api/types";
import {
  createUserAccount,
  deleteUserAccount,
  listUserAccounts,
  updateUserAccount,
  updateUserPreferences,
} from "../api/users";
import { TradeDialog, type TradeFormValues } from "../components/TradeDialog";
import { TradesTable } from "../components/TradesTable";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import { computeMarginFee, computeRealizedPnl } from "../utils/tradeMath";
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

const tradeToPayload = (trade: Trade, overrides?: Partial<TradePayload>): TradePayload => ({
  symbol: trade.symbol,
  currency: trade.currency,
  assetType: trade.assetType,
  direction: trade.direction,
  quantity: trade.quantity,
  entryPrice: trade.entryPrice,
  exitPrice: trade.exitPrice,
  fees: trade.fees ?? 0,
  marginRate: trade.marginRate ?? 0,
  accountId: trade.accountId ?? undefined,
  optionType: trade.assetType === "OPTION" ? trade.optionType ?? undefined : undefined,
  strikePrice: trade.assetType === "OPTION" ? trade.strikePrice ?? undefined : undefined,
  expiryDate: trade.assetType === "OPTION" ? trade.expiryDate ?? undefined : undefined,
  openedAt: trade.openedAt,
  closedAt: trade.closedAt,
  notes: trade.notes ?? undefined,
  ...overrides,
});

const DEFAULT_TRADE_SORT_BY: TradeSortField = "CLOSED_AT";
const DEFAULT_TRADE_SORT_DIRECTION: TradeSortDirection = "DESC";
const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  "TOTAL_REALIZED",
  "BEST_MONTH",
  "BEST_DAY",
];
const DEFAULT_TAX_CAPITAL_GAINS_RATE = 50;
const DEFAULT_TAX_PERSONAL_RATE = 50;
const DEFAULT_DISPLAY_CURRENCY: Currency = "USD";
const DEFAULT_CAD_TO_USD_RATE = 0.732;
const DASHBOARD_ACCOUNT_ALL = "__ALL_ACCOUNTS__";
const DASHBOARD_ACCOUNT_UNASSIGNED = "__UNASSIGNED__";
const TRADE_FILTER_ACCOUNT_UNASSIGNED = "__TRADE_FILTER_UNASSIGNED__";
const DASHBOARD_WIDGET_OPTIONS: Array<{ id: DashboardWidgetId; label: string }> = [
  { id: "TOTAL_REALIZED", label: "Total Realized P/L" },
  { id: "BEST_MONTH", label: "Best Month" },
  { id: "BEST_DAY", label: "Best Day" },
  { id: "DAILY_AVG_YTD", label: "Daily P/L Avg YTD" },
  { id: "TAX_OWED", label: "Tax Owing" },
  { id: "ACCOUNT_STATS", label: "Account Stats" },
  { id: "TRADE_COUNTS", label: "Trade Counts" },
  { id: "INFERRED_ACCOUNT_TRADE_COUNTS", label: "Inferred Account Trade Counts" },
];
const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGET_OPTIONS.map((option) => option.id);
type CalendarMarginMode = "net" | "pnl" | "margin" | "combined";
const CALENDAR_MARGIN_MODES: CalendarMarginMode[] = ["net", "pnl", "margin", "combined"];
const getCalendarMarginModeLabel = (
  marginMode: CalendarMarginMode,
  valueMode: "pnl" | "percent"
) => {
  const pnlLabel = valueMode === "percent" ? "Return" : "P/L";
  if (marginMode === "net") return `${pnlLabel} - margin`;
  if (marginMode === "combined") return `${pnlLabel} + margin`;
  if (marginMode === "pnl") return `${pnlLabel} only`;
  return "Margin only";
};

const SORTABLE_TRADE_FIELDS: TradeSortField[] = [
  "SYMBOL",
  "ASSET_TYPE",
  "DIRECTION",
  "QUANTITY",
  "ENTRY_PRICE",
  "EXIT_PRICE",
  "REALIZED_PNL",
  "FEES",
  "OPENED_AT",
  "CLOSED_AT",
  "ACCOUNT_ID",
  "NOTES",
];

const TRADE_SORT_LABELS: Record<TradeSortField, string> = {
  SYMBOL: "Symbol",
  ASSET_TYPE: "Asset",
  CURRENCY: "Currency",
  DIRECTION: "Side",
  QUANTITY: "Quantity",
  ENTRY_PRICE: "Entry price",
  EXIT_PRICE: "Exit price",
  REALIZED_PNL: "Realized P/L",
  FEES: "Fees",
  MARGIN_RATE: "Margin rate",
  OPTION_TYPE: "Option type",
  STRIKE_PRICE: "Strike price",
  EXPIRY_DATE: "Expiry date",
  OPENED_AT: "Opened date",
  CLOSED_AT: "Closed date",
  ACCOUNT_ID: "Account",
  NOTES: "Notes",
  CREATED_AT: "Created at",
  UPDATED_AT: "Updated at",
};

const resolveTradeSortBy = (value?: TradeSortField | null): TradeSortField => {
  if (!value || !SORTABLE_TRADE_FIELDS.includes(value)) {
    return DEFAULT_TRADE_SORT_BY;
  }
  return value;
};

const resolveTradeSortDirection = (value?: TradeSortDirection | null): TradeSortDirection => {
  if (value === "ASC" || value === "DESC") {
    return value;
  }
  return DEFAULT_TRADE_SORT_DIRECTION;
};

type PreferencesDraft = {
  themeMode: "light" | "dark";
  pnlDisplayMode: "pnl" | "percent";
  defaultTradeSortBy: TradeSortField;
  defaultTradeSortDirection: TradeSortDirection;
  showTradeHistory: boolean;
  showDetailedTradeTimes: boolean;
  dashboardWidgets: DashboardWidgetId[];
  displayCurrency: Currency;
  taxCapitalGainsRate: string;
  taxPersonalRate: string;
};

type DashboardAccountOption = {
  value: string;
  label: string;
};

type TradeAccountFilterOption = {
  value: string;
  label: string;
  unassigned?: boolean;
};

const normalizeDashboardWidgets = (value?: DashboardWidgetId[] | null): DashboardWidgetId[] => {
  if (!value) {
    return DEFAULT_DASHBOARD_WIDGETS;
  }
  const selected = new Set<DashboardWidgetId>();
  value.forEach((id) => {
    if (DASHBOARD_WIDGET_IDS.includes(id)) {
      selected.add(id);
    }
  });
  return Array.from(selected);
};

const sameDashboardWidgets = (left: DashboardWidgetId[], right: DashboardWidgetId[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const getDashboardWidgetLabel = (id: DashboardWidgetId) =>
  DASHBOARD_WIDGET_OPTIONS.find((option) => option.id === id)?.label ?? id;

const buildDashboardWidgetPreferenceRows = (widgets: DashboardWidgetId[]) => {
  const selected = normalizeDashboardWidgets(widgets);
  return [
    ...selected,
    ...DASHBOARD_WIDGET_IDS.filter((id) => !selected.includes(id)),
  ];
};

const moveDashboardWidget = (
  widgets: DashboardWidgetId[],
  widgetId: DashboardWidgetId,
  direction: -1 | 1
) => {
  const ordered = normalizeDashboardWidgets(widgets);
  const currentIndex = ordered.indexOf(widgetId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
    return ordered;
  }
  const next = [...ordered];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
};

const reorderDashboardWidget = (
  widgets: DashboardWidgetId[],
  sourceWidgetId: DashboardWidgetId,
  targetWidgetId: DashboardWidgetId
) => {
  const ordered = normalizeDashboardWidgets(widgets);
  const sourceIndex = ordered.indexOf(sourceWidgetId);
  const targetIndex = ordered.indexOf(targetWidgetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ordered;
  }
  const next = [...ordered];
  const [movedWidget] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, movedWidget);
  return next;
};

const resolveTaxRate = (value: number | null | undefined, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const resolveDisplayCurrency = (value?: Currency | null): Currency =>
  value === "CAD" || value === "USD" ? value : DEFAULT_DISPLAY_CURRENCY;

const resolveCadToUsdRate = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_CAD_TO_USD_RATE;

const convertUsdAmount = (value: number | null | undefined, displayCurrency: Currency, cadToUsdRate?: number | null) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (displayCurrency === "USD") {
    return value;
  }
  return Number((value / resolveCadToUsdRate(cadToUsdRate)).toFixed(2));
};

const convertUsdBucket = (
  bucket: PnlBucket | null | undefined,
  displayCurrency: Currency,
  cadToUsdRate?: number | null
): PnlBucket | null => {
  if (!bucket) {
    return null;
  }
  return {
    ...bucket,
    pnl: convertUsdAmount(bucket.pnl, displayCurrency, cadToUsdRate) ?? bucket.pnl,
    marginFee:
      bucket.marginFee === null || bucket.marginFee === undefined
        ? bucket.marginFee
        : convertUsdAmount(bucket.marginFee, displayCurrency, cadToUsdRate),
  };
};

const convertUsdSummary = (
  summary: PnlSummary | null,
  displayCurrency: Currency
): PnlSummary | null => {
  if (!summary) {
    return null;
  }
  const rate = summary.cadToUsdRate;
  return {
    ...summary,
    totalPnl: convertUsdAmount(summary.totalPnl, displayCurrency, rate) ?? summary.totalPnl,
    daily: summary.daily.map((bucket) => convertUsdBucket(bucket, displayCurrency, rate)!),
    monthly: summary.monthly.map((bucket) => convertUsdBucket(bucket, displayCurrency, rate)!),
    displayCurrency,
  };
};

const convertUsdStats = (
  stats: AggregateStats | null,
  displayCurrency: Currency
): AggregateStats | null => {
  if (!stats) {
    return null;
  }
  const rate = stats.cadToUsdRate;
  return {
    ...stats,
    totalPnl: convertUsdAmount(stats.totalPnl, displayCurrency, rate) ?? stats.totalPnl,
    bestDay: convertUsdBucket(stats.bestDay, displayCurrency, rate),
    bestMonth: convertUsdBucket(stats.bestMonth, displayCurrency, rate),
    displayCurrency,
  };
};

const convertUsdAccountStats = (
  stats: AccountStats[],
  displayCurrency: Currency,
  cadToUsdRate?: number | null
): AccountStats[] =>
  stats.map((account) => ({
    ...account,
    totalPnl: convertUsdAmount(account.totalPnl, displayCurrency, cadToUsdRate) ?? account.totalPnl,
    monthlyAveragePnl:
      convertUsdAmount(account.monthlyAveragePnl, displayCurrency, cadToUsdRate) ?? account.monthlyAveragePnl,
    tradedDayAveragePnl:
      convertUsdAmount(account.tradedDayAveragePnl, displayCurrency, cadToUsdRate) ?? account.tradedDayAveragePnl,
    averageTradePnl:
      convertUsdAmount(account.averageTradePnl, displayCurrency, cadToUsdRate) ?? account.averageTradePnl,
    totalNotional:
      convertUsdAmount(account.totalNotional, displayCurrency, cadToUsdRate) ?? account.totalNotional,
  }));

const formatMoney = (value: number, currency: Currency) =>
  `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

const parseTaxRateDraft = (
  value: string,
  label: string,
  min: number,
  max: number
): { value: number; error?: never } | { value?: never; error: string } => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { error: `${label} must be between ${min} and ${max}.` };
  }
  return { value: Number(parsed.toFixed(2)) };
};

const computeTaxOwing = (
  yearlyPnl: number | undefined,
  capitalGainsRate: number,
  personalRate: number
) => {
  const taxableGain = Math.max(yearlyPnl ?? 0, 0) * (capitalGainsRate / 100);
  return Number((taxableGain * (personalRate / 100)).toFixed(2));
};

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

const toUtcIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const utcDate = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day));

const addUtcDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * UTC_DAY_MS);

const observedMarketHoliday = (year: number, monthIndex: number, day: number) => {
  const date = utcDate(year, monthIndex, day);
  const weekday = date.getUTCDay();
  if (weekday === 6) return addUtcDays(date, -1);
  if (weekday === 0) return addUtcDays(date, 1);
  return date;
};

const nthWeekdayOfMonth = (
  year: number,
  monthIndex: number,
  weekday: number,
  occurrence: number
) => {
  const date = utcDate(year, monthIndex, 1);
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  return utcDate(year, monthIndex, 1 + offset + (occurrence - 1) * 7);
};

const lastWeekdayOfMonth = (year: number, monthIndex: number, weekday: number) => {
  const date = utcDate(year, monthIndex + 1, 0);
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, monthIndex, date.getUTCDate() - offset);
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
};

const nyseHolidaySet = (year: number) => {
  const holidays = [
    observedMarketHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    addUtcDays(easterSunday(year), -2),
    lastWeekdayOfMonth(year, 4, 1),
    observedMarketHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedMarketHoliday(year, 11, 25),
    observedMarketHoliday(year + 1, 0, 1),
  ];
  if (year >= 2022) {
    holidays.push(observedMarketHoliday(year, 5, 19));
  }
  return new Set(
    holidays
      .filter((date) => date.getUTCFullYear() === year)
      .map(toUtcIsoDate)
  );
};

const countTradingDaysYtd = (year: number, today = new Date()) => {
  const currentYear = today.getFullYear();
  if (year > currentYear) {
    return 0;
  }
  const start = utcDate(year, 0, 1);
  const end = year === currentYear
    ? utcDate(year, today.getMonth(), today.getDate())
    : utcDate(year, 11, 31);
  const holidays = nyseHolidaySet(year);
  let count = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += UTC_DAY_MS) {
    const date = new Date(time);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.has(toUtcIsoDate(date))) {
      continue;
    }
    count += 1;
  }
  return count;
};

const copyTextToClipboard = async (value: string) => {
  if (typeof document === "undefined") return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      console.warn("Clipboard API failed:", err);
    }
  }

  return false;
};

const normalizeAccount = (account: TradingAccount): TradingAccount => {
  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    ...account,
    taxFree: Boolean(account.taxFree),
    defaultStockFees: toFiniteNumber(account.defaultStockFees, 0),
    defaultOptionFees: toFiniteNumber(account.defaultOptionFees, 0),
    defaultMarginRateUsd: toFiniteNumber(account.defaultMarginRateUsd, 0),
    defaultMarginRateCad: toFiniteNumber(account.defaultMarginRateCad, 0),
  };
};

const sortAccountsForDisplay = (accounts: TradingAccount[]) =>
  [...accounts].sort((a, b) => {
    const byTaxStatus = Number(a.taxFree) - Number(b.taxFree);
    if (byTaxStatus !== 0) {
      return byTaxStatus;
    }
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });

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

const formatHistoryTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatSignedNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatQuantity = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
};

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
  const { user, token, authError, loginButton, initializing, logout, preferences, profile, setPreferences } = useAuth();
  const { mode, setMode } = useColorMode();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [aggregateStats, setAggregateStats] = useState<AggregateStats | null>(null);
  const [accountStats, setAccountStats] = useState<AccountStats[]>([]);
  const [tradeCountStats, setTradeCountStats] = useState<TradeCountStats | null>(null);
  const [inferredAccountTradeCounts, setInferredAccountTradeCounts] = useState<InferredAccountTradeCounts[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingAccountStats, setLoadingAccountStats] = useState(false);
  const [loadingTradeCountStats, setLoadingTradeCountStats] = useState(false);
  const [loadingInferredAccountTradeCounts, setLoadingInferredAccountTradeCounts] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [tradeSort, setTradeSort] = useState<{
    sortBy: TradeSortField;
    sortDirection: TradeSortDirection;
  }>(() => ({
    sortBy: resolveTradeSortBy(preferences?.defaultTradeSortBy),
    sortDirection: resolveTradeSortDirection(preferences?.defaultTradeSortDirection),
  }));
  const [tradeFilters, setTradeFilters] = useState<TradeFilters>({
    accountIds: [],
    includeUnassigned: false,
    symbol: "",
  });
  const [symbolFilterDraft, setSymbolFilterDraft] = useState("");
  const [pageMeta, setPageMeta] = useState<{ totalPages: number; hasNext: boolean; hasPrevious: boolean; totalElements: number }>({
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
    totalElements: 0,
  });
  const [calendarMonth, setCalendarMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hidePastTrades, setHidePastTrades] = useState(false);
  const [calendarMarginMode, setCalendarMarginMode] = useState<CalendarMarginMode>("net");
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [tradeHistoryOpen, setTradeHistoryOpen] = useState(false);
  const [tradeHistoryRows, setTradeHistoryRows] = useState<TradeHistory[]>([]);
  const [tradeHistorySubject, setTradeHistorySubject] = useState<Trade | null>(null);
  const [loadingTradeHistory, setLoadingTradeHistory] = useState(false);
  const [draggingTradeId, setDraggingTradeId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareManagerOpen, setShareManagerOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkResponse[]>([]);
  const [loadingShareLinks, setLoadingShareLinks] = useState(false);
  const [deletingShareCode, setDeletingShareCode] = useState<string | null>(null);
  const [copiedShareCode, setCopiedShareCode] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [dashboardAccountFilter, setDashboardAccountFilter] = useState(DASHBOARD_ACCOUNT_ALL);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState({
    name: "",
    taxFree: false,
    defaultStockFees: "0",
    defaultOptionFees: "0",
    defaultMarginRateUsd: "0",
    defaultMarginRateCad: "0",
  });
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [savingEditAccount, setSavingEditAccount] = useState(false);
  const [accountEditDraft, setAccountEditDraft] = useState({
    name: "",
    taxFree: false,
    defaultStockFees: "0",
    defaultOptionFees: "0",
    defaultMarginRateUsd: "0",
    defaultMarginRateCad: "0",
  });
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const [calendarValueMode, setCalendarValueMode] = useState<"pnl" | "percent">(() =>
    preferences?.pnlDisplayMode === "PERCENT" ? "percent" : "pnl"
  );
  const [statsScopeFilter, setStatsScopeFilter] = useState<string | null>(null);
  const [statsScopeDraft, setStatsScopeDraft] = useState("");
  const [taxablePnl, setTaxablePnl] = useState<TaxablePnl | null>(null);
  const authBlockedRef = useRef(false);
  const wasAuthenticated = useRef<boolean>(!!user && !!token);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [calendarOptionsAnchor, setCalendarOptionsAnchor] = useState<null | HTMLElement>(null);
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
  const [preferencesDraft, setPreferencesDraft] = useState<PreferencesDraft | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [draggingDashboardWidget, setDraggingDashboardWidget] = useState<DashboardWidgetId | null>(null);
  const [dragOverDashboardWidget, setDragOverDashboardWidget] = useState<DashboardWidgetId | null>(null);
  const guestSeeded = useRef<boolean>(false);
  const isAdmin = Boolean(profile?.admin);
  const showTradeHistoryEnabled = Boolean(preferences?.showTradeHistory);
  const showDetailedTradeTimesEnabled = Boolean(preferences?.showDetailedTradeTimes);
  const selectedDashboardWidgets = useMemo(
    () => normalizeDashboardWidgets(preferences?.dashboardWidgets),
    [preferences?.dashboardWidgets]
  );
  const accountNamesById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );
  const dashboardAccountOptions = useMemo(
    () => [
      { value: DASHBOARD_ACCOUNT_ALL, label: "All accounts" },
      ...accounts.map((account) => ({
        value: account.id,
        label: account.taxFree ? `${account.name} (Tax-free)` : account.name,
      })),
      { value: DASHBOARD_ACCOUNT_UNASSIGNED, label: "Unassigned" },
    ],
    [accounts]
  );
  const tradeAccountFilterOptions = useMemo<TradeAccountFilterOption[]>(
    () => [
      ...accounts.map((account) => ({
        value: account.id,
        label: account.taxFree ? `${account.name} (Tax-free)` : account.name,
      })),
      { value: TRADE_FILTER_ACCOUNT_UNASSIGNED, label: "Unassigned", unassigned: true },
    ],
    [accounts]
  );
  const selectedTradeAccountFilterOptions = useMemo<TradeAccountFilterOption[]>(() => {
    const optionsByValue = new Map(
      tradeAccountFilterOptions.map((option) => [option.value, option])
    );
    const selected = (tradeFilters.accountIds ?? []).map((accountId) =>
      optionsByValue.get(accountId) ?? {
        value: accountId,
        label: accountNamesById[accountId] ?? "Deleted account",
      }
    );
    if (tradeFilters.includeUnassigned) {
      const unassignedOption = optionsByValue.get(TRADE_FILTER_ACCOUNT_UNASSIGNED);
      if (unassignedOption) {
        selected.push(unassignedOption);
      }
    }
    return selected;
  }, [
    accountNamesById,
    tradeAccountFilterOptions,
    tradeFilters.accountIds,
    tradeFilters.includeUnassigned,
  ]);
  const activeTradeFilterCount =
    (tradeFilters.accountIds?.length ?? 0) +
    (tradeFilters.includeUnassigned ? 1 : 0) +
    (tradeFilters.symbol?.trim() ? 1 : 0);
  const hasTradeFilters = activeTradeFilterCount > 0;
  const selectedDashboardAccount = useMemo(() => {
    if (dashboardAccountFilter === DASHBOARD_ACCOUNT_UNASSIGNED) {
      return { accountId: null, accountName: "Unassigned", unassigned: true };
    }
    if (dashboardAccountFilter === DASHBOARD_ACCOUNT_ALL) {
      return { accountId: null, accountName: "All accounts", unassigned: false };
    }
    const accountName = accountNamesById[dashboardAccountFilter] ?? "Deleted account";
    return { accountId: dashboardAccountFilter, accountName, unassigned: false };
  }, [accountNamesById, dashboardAccountFilter]);
  const displayCurrency = resolveDisplayCurrency(preferences?.displayCurrency);
  const taxCapitalGainsRate = resolveTaxRate(
    preferences?.taxCapitalGainsRate,
    DEFAULT_TAX_CAPITAL_GAINS_RATE
  );
  const taxPersonalRate = resolveTaxRate(
    preferences?.taxPersonalRate,
    DEFAULT_TAX_PERSONAL_RATE
  );
  const buildPreferencesDraft = useCallback(
    (prev?: PreferencesDraft | null): PreferencesDraft => ({
      themeMode: prev?.themeMode ?? mode,
      pnlDisplayMode: prev?.pnlDisplayMode ?? calendarValueMode,
      defaultTradeSortBy: prev?.defaultTradeSortBy ?? tradeSort.sortBy,
      defaultTradeSortDirection: prev?.defaultTradeSortDirection ?? tradeSort.sortDirection,
      showTradeHistory: prev?.showTradeHistory ?? showTradeHistoryEnabled,
      showDetailedTradeTimes: prev?.showDetailedTradeTimes ?? showDetailedTradeTimesEnabled,
      dashboardWidgets: prev?.dashboardWidgets ?? selectedDashboardWidgets,
      displayCurrency: prev?.displayCurrency ?? displayCurrency,
      taxCapitalGainsRate: prev?.taxCapitalGainsRate ?? String(taxCapitalGainsRate),
      taxPersonalRate: prev?.taxPersonalRate ?? String(taxPersonalRate),
    }),
    [
      calendarValueMode,
      displayCurrency,
      mode,
      selectedDashboardWidgets,
      showDetailedTradeTimesEnabled,
      showTradeHistoryEnabled,
      taxCapitalGainsRate,
      taxPersonalRate,
      tradeSort.sortBy,
      tradeSort.sortDirection,
    ]
  );
  const widgetPreferenceRows = useMemo(
    () => buildDashboardWidgetPreferenceRows(preferencesDraft?.dashboardWidgets ?? selectedDashboardWidgets),
    [preferencesDraft?.dashboardWidgets, selectedDashboardWidgets]
  );
  const handleDashboardWidgetDragStart = useCallback(
    (event: DragEvent<HTMLElement>, widgetId: DashboardWidgetId) => {
      setDraggingDashboardWidget(widgetId);
      setDragOverDashboardWidget(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", widgetId);
    },
    []
  );
  const handleDashboardWidgetDragEnd = useCallback(() => {
    setDraggingDashboardWidget(null);
    setDragOverDashboardWidget(null);
  }, []);
  const handleDashboardWidgetDragOver = useCallback(
    (event: DragEvent<HTMLElement>, widgetId: DashboardWidgetId) => {
      if (!draggingDashboardWidget || draggingDashboardWidget === widgetId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverDashboardWidget(widgetId);
    },
    [draggingDashboardWidget]
  );
  const handleDashboardWidgetDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetWidgetId: DashboardWidgetId) => {
      event.preventDefault();
      const transferredWidgetId = event.dataTransfer.getData("text/plain") as DashboardWidgetId;
      const sourceWidgetId = draggingDashboardWidget ?? transferredWidgetId;
      setDraggingDashboardWidget(null);
      setDragOverDashboardWidget(null);
      if (!DASHBOARD_WIDGET_IDS.includes(sourceWidgetId) || sourceWidgetId === targetWidgetId) {
        return;
      }
      setPreferencesDraft((prev) => {
        const base = buildPreferencesDraft(prev);
        return {
          ...base,
          dashboardWidgets: reorderDashboardWidget(base.dashboardWidgets, sourceWidgetId, targetWidgetId),
        };
      });
    },
    [buildPreferencesDraft, draggingDashboardWidget]
  );
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

  const showError = (message: string) => {
    setWarning(null);
    setError(message);
  };

  const showWarning = (message: string) => {
    setError(null);
    setWarning(message);
  };

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
      showWarning("Session expired. Please sign in again.");
      return;
    }
    showError(message);
  };

  useEffect(() => {
    if (!user || !token) {
      setCalendarValueMode("pnl");
      setTradeSort({
        sortBy: DEFAULT_TRADE_SORT_BY,
        sortDirection: DEFAULT_TRADE_SORT_DIRECTION,
      });
      return;
    }
    setCalendarValueMode(preferences?.pnlDisplayMode === "PERCENT" ? "percent" : "pnl");
    setTradeSort({
      sortBy: resolveTradeSortBy(preferences?.defaultTradeSortBy),
      sortDirection: resolveTradeSortDirection(preferences?.defaultTradeSortDirection),
    });
  }, [
    preferences?.defaultTradeSortBy,
    preferences?.defaultTradeSortDirection,
    preferences?.pnlDisplayMode,
    token,
    user,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const symbol = symbolFilterDraft.trim();
      if ((tradeFilters.symbol ?? "") !== symbol) {
        setTradeFilters((prev) => ({ ...prev, symbol }));
        setPage(0);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [symbolFilterDraft, tradeFilters.symbol]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    const validAccountIds = new Set(accounts.map((account) => account.id));
    setTradeFilters((prev) => {
      const accountIds = (prev.accountIds ?? []).filter((accountId) =>
        validAccountIds.has(accountId)
      );
      if (accountIds.length === (prev.accountIds ?? []).length) {
        return prev;
      }
      return { ...prev, accountIds };
    });
  }, [accounts, token, user]);

  const computeSummary = useCallback((list: Trade[], month?: string, rate?: number, fxDate?: string): PnlSummary => {
    const cadToUsd = resolveCadToUsdRate(rate);
    const rateDate = fxDate ?? new Date().toISOString().slice(0, 10);
    const toUsd = (trade: Trade) =>
      trade.currency === "CAD" ? trade.realizedPnl * cadToUsd : trade.realizedPnl;
    const toUsdMarginFee = (trade: Trade) => {
      const marginFee = computeMarginFee({
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        assetType: trade.assetType,
        marginRate: trade.marginRate ?? 0,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
      });
      return trade.currency === "CAD" ? marginFee * cadToUsd : marginFee;
    };
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
    const dailyMap = new Map<string, { pnl: number; trades: number; notional: number; marginFee: number }>();
    const monthlyMap = new Map<string, { pnl: number; trades: number; notional: number; marginFee: number }>();

    filtered.forEach((trade) => {
      const day = trade.closedAt.slice(0, 10);
      const month = trade.closedAt.slice(0, 7);
      const notional = toUsdNotional(trade);
      const marginFee = toUsdMarginFee(trade);
      dailyMap.set(day, {
        pnl: (dailyMap.get(day)?.pnl || 0) + toUsd(trade),
        trades: (dailyMap.get(day)?.trades || 0) + 1,
        notional: (dailyMap.get(day)?.notional || 0) + notional,
        marginFee: (dailyMap.get(day)?.marginFee || 0) + marginFee,
      });
      monthlyMap.set(month, {
        pnl: (monthlyMap.get(month)?.pnl || 0) + toUsd(trade),
        trades: (monthlyMap.get(month)?.trades || 0) + 1,
        notional: (monthlyMap.get(month)?.notional || 0) + notional,
        marginFee: (monthlyMap.get(month)?.marginFee || 0) + marginFee,
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
        marginFee: Number(data.marginFee.toFixed(2)),
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
        marginFee: Number(data.marginFee.toFixed(2)),
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
        tradedDays: scoped.daily.length,
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

  const loadTrades = useCallback(async (targetPage: number, targetSize: number, date?: string, month?: string) => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingTrades(true);
      const tradeData = await fetchTrades(
        targetPage,
        targetSize,
        month,
        date,
        tradeSort.sortBy,
        tradeSort.sortDirection,
        tradeFilters
      );
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
  }, [token, tradeFilters, tradeSort.sortBy, tradeSort.sortDirection, user]);

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
      const [stats, nextTaxablePnl] = await Promise.all([
        fetchAggregateStats(
          effectiveStatsScope.year,
          effectiveStatsScope.month,
          effectiveStatsScope.day
        ),
        fetchTaxablePnl(effectiveStatsScope.year),
      ]);
      setAggregateStats(stats);
      setTaxablePnl(nextTaxablePnl);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingStats(false);
    }
  }, [effectiveStatsScope.day, effectiveStatsScope.month, effectiveStatsScope.year, token, user]);

  const loadAccountStats = useCallback(async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingAccountStats(true);
      const stats = await fetchAccountStats(effectiveStatsScope.year);
      setAccountStats(stats);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingAccountStats(false);
    }
  }, [effectiveStatsScope.year, token, user]);

  const loadTradeCountStats = useCallback(async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingTradeCountStats(true);
      const stats = await fetchTradeCountStats(
        effectiveStatsScope.year,
        effectiveStatsScope.month,
        effectiveStatsScope.day,
        selectedDashboardAccount.accountId,
        selectedDashboardAccount.unassigned
      );
      setTradeCountStats(stats);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingTradeCountStats(false);
    }
  }, [
    effectiveStatsScope.day,
    effectiveStatsScope.month,
    effectiveStatsScope.year,
    selectedDashboardAccount.accountId,
    selectedDashboardAccount.unassigned,
    token,
    user,
  ]);

  const loadInferredAccountTradeCounts = useCallback(async () => {
    if (!user || !token) {
      return;
    }
    try {
      setLoadingInferredAccountTradeCounts(true);
      const counts = await fetchInferredAccountTradeCounts(
        effectiveStatsScope.year,
        effectiveStatsScope.month,
        effectiveStatsScope.day
      );
      setInferredAccountTradeCounts(counts);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingInferredAccountTradeCounts(false);
    }
  }, [effectiveStatsScope.day, effectiveStatsScope.month, effectiveStatsScope.year, token, user]);

  const loadSelectedExtendedWidgetData = useCallback(async () => {
    const selected = new Set(selectedDashboardWidgets);
    const requests: Promise<void>[] = [];
    if (selected.has("ACCOUNT_STATS")) {
      requests.push(loadAccountStats());
    }
    if (selected.has("TRADE_COUNTS")) {
      requests.push(loadTradeCountStats());
    }
    if (selected.has("INFERRED_ACCOUNT_TRADE_COUNTS")) {
      requests.push(loadInferredAccountTradeCounts());
    }
    await Promise.all(requests);
  }, [
    loadAccountStats,
    loadInferredAccountTradeCounts,
    loadTradeCountStats,
    selectedDashboardWidgets,
  ]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    if (selectedDate) {
      loadTrades(page, pageSize, selectedDate);
      return;
    }
    loadTrades(page, pageSize, undefined, calendarMonth);
  }, [calendarMonth, loadTrades, page, pageSize, selectedDate, token, user]);

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
    if (!user || !token) {
      return;
    }
    loadSelectedExtendedWidgetData();
  }, [loadSelectedExtendedWidgetData, token, user]);

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
      setTaxablePnl(null);
      setAccountStats([]);
      setTradeCountStats(null);
      setInferredAccountTradeCounts([]);
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
      setTaxablePnl(null);
      setAccountStats([]);
      setTradeCountStats(null);
      setInferredAccountTradeCounts([]);
      setLoadingTrades(false);
      setLoadingSummary(false);
      setLoadingAccountStats(false);
      setLoadingTradeCountStats(false);
      setLoadingInferredAccountTradeCounts(false);
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
      setAccounts(sortAccountsForDisplay(nextAccounts.map(normalizeAccount)));
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
      showWarning("Sign in to manage share links.");
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
      window.prompt("Copy this share link:", urlString);
      setShareMessage("Copy the share link from the dialog.");
      return;
    }
    setCopiedShareCode(code);
    window.setTimeout(() => {
      setCopiedShareCode((current) => (current === code ? null : current));
    }, 1800);
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
      showWarning("Sign in to manage accounts.");
      return;
    }
    blurActiveElement();
    setAccountsDialogOpen(true);
    void loadAccounts();
    setMenuAnchor(null);
  };

  const handleCreateAccount = async () => {
    if (!accountDraft.name.trim()) {
      showError("Account name is required.");
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
      showError("Default stock fees, option fees, and USD/CAD margin rates must be valid values greater than or equal to 0.");
      return;
    }
    try {
      setSavingAccount(true);
      const created = await createUserAccount({
        name: accountDraft.name.trim(),
        taxFree: accountDraft.taxFree,
        defaultStockFees: Number(stockFees.toFixed(2)),
        defaultOptionFees: Number(optionFees.toFixed(2)),
        defaultMarginRateUsd: Number(marginUsd.toFixed(4)),
        defaultMarginRateCad: Number(marginCad.toFixed(4)),
      });
      const normalizedCreated = normalizeAccount(created);
      setAccounts((prev) =>
        sortAccountsForDisplay([
          normalizedCreated,
          ...prev.filter((account) => account.id !== normalizedCreated.id),
        ])
      );
      setAccountDraft({
        name: "",
        taxFree: false,
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
      await loadAggregateStats();
    } catch (err) {
      handleRequestError(err);
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleStartEditAccount = (account: TradingAccount) => {
    setEditingAccountId(account.id);
    setAccountEditDraft({
      name: account.name,
      taxFree: account.taxFree,
      defaultStockFees: String(account.defaultStockFees),
      defaultOptionFees: String(account.defaultOptionFees),
      defaultMarginRateUsd: String(account.defaultMarginRateUsd),
      defaultMarginRateCad: String(account.defaultMarginRateCad),
    });
  };

  const handleCancelEditAccount = () => {
    setEditingAccountId(null);
  };

  const handleSaveEditAccount = async (accountId: string) => {
    if (!accountEditDraft.name.trim()) {
      showError("Account name is required.");
      return;
    }
    const stockFees = Number(accountEditDraft.defaultStockFees);
    const optionFees = Number(accountEditDraft.defaultOptionFees);
    const marginUsd = Number(accountEditDraft.defaultMarginRateUsd);
    const marginCad = Number(accountEditDraft.defaultMarginRateCad);
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
      showError("Default stock fees, option fees, and USD/CAD margin rates must be valid values greater than or equal to 0.");
      return;
    }
    try {
      setSavingEditAccount(true);
      const updated = await updateUserAccount(accountId, {
        name: accountEditDraft.name.trim(),
        taxFree: accountEditDraft.taxFree,
        defaultStockFees: Number(stockFees.toFixed(2)),
        defaultOptionFees: Number(optionFees.toFixed(2)),
        defaultMarginRateUsd: Number(marginUsd.toFixed(4)),
        defaultMarginRateCad: Number(marginCad.toFixed(4)),
      });
      const normalizedUpdated = normalizeAccount(updated);
      setAccounts((prev) =>
        sortAccountsForDisplay(
          prev.map((account) => (account.id === accountId ? normalizedUpdated : account))
        )
      );
      await loadAggregateStats();
      setEditingAccountId(null);
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSavingEditAccount(false);
    }
  };

  const handleOpenNewTrade = () => {
    blurActiveElement();
    setEditingTrade(null);
    setTradeDialogOpen(true);
  };

  const handleOpenPreferencesDialog = () => {
    blurActiveElement();
    setPreferencesDraft(buildPreferencesDraft());
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
    setDraggingDashboardWidget(null);
    setDragOverDashboardWidget(null);
  };

  const handleSavePreferences = async () => {
    if (!preferencesDraft) return;

    const parsedScope = parseStatsScope(statsScopeDraft);
    if (!parsedScope) {
      showError("Widget scope must be blank or use YYYY, YYYY-MM, or YYYY-MM-DD.");
      return;
    }

    const normalizedScope = parsedScope.normalized || null;
    const {
      themeMode,
      pnlDisplayMode,
      defaultTradeSortBy,
      defaultTradeSortDirection,
      showTradeHistory,
      showDetailedTradeTimes,
      dashboardWidgets,
      displayCurrency: nextDisplayCurrency,
      taxCapitalGainsRate: taxCapitalGainsRateDraft,
      taxPersonalRate: taxPersonalRateDraft,
    } = preferencesDraft;
    const parsedCapitalGainsRate = parseTaxRateDraft(
      taxCapitalGainsRateDraft,
      "Capital gains rate",
      0,
      100
    );
    if (parsedCapitalGainsRate.error) {
      showError(parsedCapitalGainsRate.error);
      return;
    }
    const parsedPersonalRate = parseTaxRateDraft(
      taxPersonalRateDraft,
      "Personal tax rate",
      1,
      100
    );
    if (parsedPersonalRate.error) {
      showError(parsedPersonalRate.error);
      return;
    }
    const normalizedDashboardWidgets = normalizeDashboardWidgets(dashboardWidgets);
    const hasPreferenceChanges =
      themeMode !== mode ||
      pnlDisplayMode !== calendarValueMode ||
      defaultTradeSortBy !== tradeSort.sortBy ||
      defaultTradeSortDirection !== tradeSort.sortDirection ||
      showTradeHistory !== showTradeHistoryEnabled ||
      showDetailedTradeTimes !== showDetailedTradeTimesEnabled ||
      !sameDashboardWidgets(normalizedDashboardWidgets, selectedDashboardWidgets) ||
      nextDisplayCurrency !== displayCurrency ||
      parsedCapitalGainsRate.value !== taxCapitalGainsRate ||
      parsedPersonalRate.value !== taxPersonalRate;
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
          defaultTradeSortBy,
          defaultTradeSortDirection,
          showTradeHistory,
          showDetailedTradeTimes,
          dashboardWidgets: normalizedDashboardWidgets,
          displayCurrency: nextDisplayCurrency,
          taxCapitalGainsRate: parsedCapitalGainsRate.value,
          taxPersonalRate: parsedPersonalRate.value,
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
        defaultTradeSortBy,
        defaultTradeSortDirection,
        showTradeHistory,
        showDetailedTradeTimes,
        dashboardWidgets: normalizedDashboardWidgets,
        displayCurrency: nextDisplayCurrency,
        taxCapitalGainsRate: parsedCapitalGainsRate.value,
        taxPersonalRate: parsedPersonalRate.value,
      });
    }

    if (hasPreferenceChanges) {
      setMode(themeMode);
      setCalendarValueMode(pnlDisplayMode);
      setTradeSort({
        sortBy: defaultTradeSortBy,
        sortDirection: defaultTradeSortDirection,
      });
    }
    if (hasWidgetChanges) {
      setStatsScopeFilter(normalizedScope);
    }

    setPreferencesDialogOpen(false);
    setPreferencesDraft(null);
    setDraggingDashboardWidget(null);
    setDragOverDashboardWidget(null);
  };

  const handleEditTrade = (trade: Trade) => {
    blurActiveElement();
    setEditingTrade(trade);
    setTradeDialogOpen(true);
  };

  const handleOpenTradeHistory = async () => {
    if (!editingTrade || !user || !token) {
      return;
    }
    setTradeHistorySubject(editingTrade);
    setTradeHistoryRows([]);
    setTradeHistoryOpen(true);
    setLoadingTradeHistory(true);
    try {
      setTradeHistoryRows(await fetchTradeHistory(editingTrade.id));
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingTradeHistory(false);
    }
  };

  const handleCloseTradeHistory = () => {
    setTradeHistoryOpen(false);
    setTradeHistoryRows([]);
    setTradeHistorySubject(null);
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
          await loadTrades(page, pageSize, selectedDate);
        } else {
          await loadTrades(page, pageSize, undefined, calendarMonth);
        }
        await loadSummary(calendarMonth);
        await loadAggregateStats();
        await loadSelectedExtendedWidgetData();
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

  const handleDropTradeToDate = async (tradeId: string, date: string) => {
    setDraggingTradeId(null);
    const trade = trades.find((item) => item.id === tradeId);
    if (!trade || trade.closedAt === date) {
      return;
    }

    const payload = tradeToPayload(trade, { closedAt: date });

    try {
      if (user && token) {
        await updateTrade(trade.id, payload);
        if (selectedDate) {
          await loadTrades(page, pageSize, selectedDate);
        } else {
          await loadTrades(page, pageSize, undefined, calendarMonth);
        }
        await loadSummary(calendarMonth);
        await loadAggregateStats();
        await loadSelectedExtendedWidgetData();
      } else {
        const realizedPnl = computePnl(payload);
        const now = new Date().toISOString();
        const rate = summary?.cadToUsdRate;
        const fxDate = summary?.fxDate;
        setTrades((prev) => {
          const next = prev.map((item) =>
            item.id === trade.id
              ? {
                  ...item,
                  ...payload,
                  accountId: payload.accountId ?? null,
                  optionType: payload.optionType ?? null,
                  strikePrice: payload.strikePrice ?? null,
                  expiryDate: payload.expiryDate ?? null,
                  notes: payload.notes ?? null,
                  realizedPnl,
                  updatedAt: now,
                }
              : item
          );
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
    } catch (err) {
      handleRequestError(err);
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
          await loadTrades(page, pageSize, selectedDate);
        } else {
          await loadTrades(page, pageSize, undefined, calendarMonth);
        }
        await loadSummary(calendarMonth);
        await loadAggregateStats();
        await loadSelectedExtendedWidgetData();
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
      showWarning("Sign in to share a month.");
      return;
    }
    if (!displaySummary) {
      showError("Load a month before sharing.");
      return;
    }
    if (typeof window === "undefined") return;
    try {
      setSharing(true);
      const payload = buildSharePayload(calendarMonth, displaySummary, { displayCurrency });
      
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
        setShareMessage("Share link created. Copy it from the dialog.");
        return;
      }
      setShareMessage("Share link copied. Send it to share this month's P/L.");
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSharing(false);
    }
  };

  const handleShareDay = async () => {
    if (!user || !token) {
      showWarning("Sign in to share trades.");
      return;
    }
    if (!selectedDate) {
      showWarning("Select a day to share trades.");
      return;
    }
    if (filteredTrades.length === 0) {
      showWarning("No trades found for that day.");
      return;
    }
    if (typeof window === "undefined") return;
    try {
      setSharing(true);
      const payload = buildTradesSharePayload(selectedDate, filteredTrades, {
        cadToUsdRate: summary?.cadToUsdRate,
        fxDate: summary?.fxDate,
        displayCurrency,
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
        setShareMessage("Share link created. Copy it from the dialog.");
        return;
      }
      setShareMessage(
        `Share link copied. Send it to share trades for ${selectedDate.replace(/-/g, "/")}.`
      );
    } catch (err) {
      handleRequestError(err);
    } finally {
      setSharing(false);
    }
  };

  const handleMonthChange = async (
    month: string,
    options?: { preserveSelection?: boolean }
  ) => {
    const preserveSelection = options?.preserveSelection === true;
    setCalendarMonth(month);
    if (!preserveSelection) {
      setSelectedDate(null);
    }
    if (!user || !token) {
      const rate = summary?.cadToUsdRate;
      const fxDate = summary?.fxDate;
      setSummary(computeSummary(trades, month, rate, fxDate));
      return;
    }
    if (preserveSelection) {
      return;
    }
    setPage(0);
    await loadTrades(0, pageSize, undefined, month);
  };

  const handleDateSelect = (date: string) => {
    if (!user || !token) {
      setSelectedDate((prev) => (prev === date ? null : date));
      return;
    }
    setSelectedDate((prev) => (prev === date ? null : date));
    setPage(0);
  };

  const handleClearSelectedDate = () => {
    setSelectedDate(null);
    if (!user || !token) {
      return;
    }
    setPage(0);
  };

  const handleCalendarMarginModeToggle = () => {
    setCalendarMarginMode((current) => {
      const currentIndex = CALENDAR_MARGIN_MODES.indexOf(current);
      return CALENDAR_MARGIN_MODES[(currentIndex + 1) % CALENDAR_MARGIN_MODES.length];
    });
  };

  const handleTradeSortChange = (sortBy: TradeSortField, sortDirection: TradeSortDirection) => {
    setTradeSort({ sortBy, sortDirection });
    setPage(0);
  };

  const handleTradeAccountFilterChange = (selected: TradeAccountFilterOption[]) => {
    const accountIds = selected
      .filter((option) => !option.unassigned)
      .map((option) => option.value);
    setTradeFilters((prev) => ({
      ...prev,
      accountIds,
      includeUnassigned: selected.some((option) => option.unassigned),
    }));
    setPage(0);
  };

  const handleSymbolFilterChange = (value: string) => {
    setSymbolFilterDraft(value);
  };

  const handleClearTradeFilters = () => {
    setTradeFilters({
      accountIds: [],
      includeUnassigned: false,
      symbol: "",
    });
    setSymbolFilterDraft("");
    setPage(0);
  };

  const filteredTrades = useMemo(() => {
    let result = trades;
    if (selectedDate) {
      result = result.filter((trade) => trade.closedAt.startsWith(selectedDate));
    }
    if (hidePastTrades) {
      const today = new Date().toISOString().slice(0, 10);
      result = result.filter((trade) => trade.closedAt >= today);
    }
    if (tradeFilters.accountIds?.length || tradeFilters.includeUnassigned) {
      const selectedAccountIds = new Set(tradeFilters.accountIds ?? []);
      result = result.filter((trade) => {
        if (!trade.accountId) {
          return !!tradeFilters.includeUnassigned;
        }
        return selectedAccountIds.has(trade.accountId);
      });
    }
    const symbol = tradeFilters.symbol?.trim().toLowerCase();
    if (symbol) {
      result = result.filter((trade) => trade.symbol.toLowerCase().includes(symbol));
    }
    return result;
  }, [hidePastTrades, selectedDate, tradeFilters, trades]);
  const displaySummary = useMemo(
    () => convertUsdSummary(summary, displayCurrency),
    [displayCurrency, summary]
  );
  const displayAggregateStats = useMemo(
    () => convertUsdStats(aggregateStats, displayCurrency),
    [aggregateStats, displayCurrency]
  );
  const displayTaxablePnl = useMemo(
    () => convertUsdAmount(taxablePnl?.totalPnl, displayCurrency, taxablePnl?.cadToUsdRate) ?? undefined,
    [displayCurrency, taxablePnl]
  );
  const displayAccountStats = useMemo(
    () => convertUsdAccountStats(accountStats, displayCurrency, aggregateStats?.cadToUsdRate),
    [accountStats, aggregateStats?.cadToUsdRate, displayCurrency]
  );

  const scopedStatsYear = displayAggregateStats?.year ?? effectiveStatsScope.year ?? new Date().getUTCFullYear();
  const scopedStatsMonth = displayAggregateStats?.month ?? effectiveStatsScope.month ?? displayAggregateStats?.bestMonth?.period ?? null;
  const scopedStatsDay = displayAggregateStats?.day ?? effectiveStatsScope.day ?? null;
  const selectedAccountStats = useMemo(() => {
    if (selectedDashboardAccount.unassigned) {
      return displayAccountStats.find((account) => !account.accountId) ?? null;
    }
    if (selectedDashboardAccount.accountId) {
      return displayAccountStats.find((account) => account.accountId === selectedDashboardAccount.accountId) ?? null;
    }
    const tradeCount =
      displayAggregateStats?.tradeCount ?? displayAccountStats.reduce((sum, account) => sum + account.tradeCount, 0);
    const tradedDays =
      displayAggregateStats?.tradedDays ?? displayAccountStats.reduce((sum, account) => sum + account.tradedDays, 0);
    const totalPnl =
      displayAggregateStats?.totalPnl ?? displayAccountStats.reduce((sum, account) => sum + account.totalPnl, 0);
    const totalNotional = displayAccountStats.reduce((sum, account) => sum + account.totalNotional, 0);
    const activeMonths = Math.max(...displayAccountStats.map((account) => account.activeMonths), 0);
    if (!displayAggregateStats && displayAccountStats.length === 0) {
      return null;
    }
    return {
      accountId: null,
      accountName: "All accounts",
      totalPnl,
      monthlyAveragePnl: activeMonths > 0 ? Number((totalPnl / activeMonths).toFixed(2)) : 0,
      tradedDayAveragePnl: tradedDays > 0 ? Number((totalPnl / tradedDays).toFixed(2)) : 0,
      averageTradePnl: tradeCount > 0 ? Number((totalPnl / tradeCount).toFixed(2)) : 0,
      totalNotional,
      pnlPercent: displayAggregateStats?.pnlPercent,
      tradeCount,
      tradedDays,
      activeMonths,
      year: scopedStatsYear,
    };
  }, [displayAccountStats, displayAggregateStats, scopedStatsYear, selectedDashboardAccount]);
  const selectedInferredAccountCounts = useMemo(() => {
    if (selectedDashboardAccount.unassigned) {
      return inferredAccountTradeCounts.find((account) => !account.accountId) ?? null;
    }
    if (selectedDashboardAccount.accountId) {
      return inferredAccountTradeCounts.find((account) => account.accountId === selectedDashboardAccount.accountId) ?? null;
    }
    if (inferredAccountTradeCounts.length === 0) {
      return null;
    }
    const inferredAddedQuantity = inferredAccountTradeCounts.reduce(
      (sum, account) => sum + account.inferredAddedQuantity,
      0
    );
    const inferredAddedNotional = inferredAccountTradeCounts.reduce(
      (sum, account) => sum + account.averageInferredAddPrice * account.inferredAddedQuantity,
      0
    );
    return {
      accountId: null,
      accountName: "All accounts",
      recordedTradeCount: inferredAccountTradeCounts.reduce((sum, account) => sum + account.recordedTradeCount, 0),
      inferredBuyCount: inferredAccountTradeCounts.reduce((sum, account) => sum + account.inferredBuyCount, 0),
      inferredSellCount: inferredAccountTradeCounts.reduce((sum, account) => sum + account.inferredSellCount, 0),
      inferredTotalCount: inferredAccountTradeCounts.reduce((sum, account) => sum + account.inferredTotalCount, 0),
      monthInferredTotalCount: inferredAccountTradeCounts.reduce(
        (sum, account) => sum + account.monthInferredTotalCount,
        0
      ),
      dayInferredTotalCount: inferredAccountTradeCounts.reduce(
        (sum, account) => sum + account.dayInferredTotalCount,
        0
      ),
      inferredAddCount: inferredAccountTradeCounts.reduce((sum, account) => sum + account.inferredAddCount, 0),
      monthInferredAddCount: inferredAccountTradeCounts.reduce(
        (sum, account) => sum + account.monthInferredAddCount,
        0
      ),
      dayInferredAddCount: inferredAccountTradeCounts.reduce(
        (sum, account) => sum + account.dayInferredAddCount,
        0
      ),
      inferredAddedQuantity,
      averageInferredAddPrice:
        inferredAddedQuantity > 0 ? Number((inferredAddedNotional / inferredAddedQuantity).toFixed(4)) : 0,
      year: scopedStatsYear,
      month: scopedStatsMonth,
      day: scopedStatsDay,
    };
  }, [inferredAccountTradeCounts, scopedStatsDay, scopedStatsMonth, scopedStatsYear, selectedDashboardAccount]);
  const taxOwing = useMemo(
    () => computeTaxOwing(
      user && token ? displayTaxablePnl : displayAggregateStats?.totalPnl,
      taxCapitalGainsRate,
      taxPersonalRate
    ),
    [displayAggregateStats?.totalPnl, displayTaxablePnl, taxCapitalGainsRate, taxPersonalRate, token, user]
  );
  const ytdTradingDays = useMemo(() => countTradingDaysYtd(scopedStatsYear), [scopedStatsYear]);
  const totalPnlYtd = displayAggregateStats?.totalPnl ?? 0;
  const tradedDaysYtd = displayAggregateStats?.tradedDays ?? 0;
  const dailyAverageYtd = ytdTradingDays > 0
    ? Number((totalPnlYtd / ytdTradingDays).toFixed(2))
    : undefined;
  const tradedDayAverageYtd = tradedDaysYtd > 0
    ? Number((totalPnlYtd / tradedDaysYtd).toFixed(2))
    : undefined;
  const widgetGridSize = {
    xs: 12,
    sm: selectedDashboardWidgets.length === 1 ? 12 : 6,
    md:
      selectedDashboardWidgets.length >= 4
        ? 3
        : selectedDashboardWidgets.length === 2
          ? 6
          : 4,
  };
  const dashboardWidgetCards = selectedDashboardWidgets.map((widgetId) => {
    if (widgetId === "TOTAL_REALIZED") {
      return {
        id: widgetId,
        node: (
          <StatCard
            title={`Total Realized P/L (${scopedStatsYear})`}
            value={displayAggregateStats?.totalPnl}
            trades={displayAggregateStats?.tradeCount}
            percent={displayAggregateStats?.pnlPercent}
            currency={displayCurrency}
            loading={loadingStats}
          />
        ),
      };
    }
    if (widgetId === "BEST_MONTH") {
      return {
        id: widgetId,
        node: (
          <BucketCard
            title={`Best Month (${scopedStatsYear})`}
            bucket={displayAggregateStats?.bestMonth || null}
            currency={displayCurrency}
            loading={loadingStats}
          />
        ),
      };
    }
    if (widgetId === "BEST_DAY") {
      return {
        id: widgetId,
        node: (
          <BucketCard
            title={scopedStatsDay ? `Day (${scopedStatsDay})` : `Best Day (${scopedStatsMonth ?? "month"})`}
            bucket={displayAggregateStats?.bestDay || null}
            currency={displayCurrency}
            loading={loadingStats}
          />
        ),
      };
    }
    if (widgetId === "DAILY_AVG_YTD") {
      return {
        id: widgetId,
        node: (
          <AveragePnlCard
            title={`Daily P/L Avg YTD (${scopedStatsYear})`}
            value={dailyAverageYtd}
            tradedDayValue={tradedDayAverageYtd}
            currency={displayCurrency}
            tradingDays={ytdTradingDays}
            tradedDays={tradedDaysYtd}
            loading={loadingStats}
          />
        ),
      };
    }
    if (widgetId === "TAX_OWED") {
      return {
        id: widgetId,
        node: (
          <TaxCard
            title={`Tax Owing (${scopedStatsYear})`}
            value={taxOwing}
            taxablePnl={user && token ? displayTaxablePnl : displayAggregateStats?.totalPnl}
            currency={displayCurrency}
            capitalGainsRate={taxCapitalGainsRate}
            personalRate={taxPersonalRate}
            loading={loadingStats}
          />
        ),
      };
    }
    if (widgetId === "ACCOUNT_STATS") {
      return {
        id: widgetId,
        node: (
          <AccountStatsCard
            title={`Account Stats (${scopedStatsYear})`}
            account={selectedAccountStats}
            accountOptions={dashboardAccountOptions}
            accountFilter={dashboardAccountFilter}
            onAccountFilterChange={setDashboardAccountFilter}
            currency={displayCurrency}
            loading={loadingAccountStats}
          />
        ),
      };
    }
    if (widgetId === "TRADE_COUNTS") {
      return {
        id: widgetId,
        node: (
          <TradeCountsCard
            title={`Trade Counts (${tradeCountStats?.year ?? scopedStatsYear})`}
            stats={tradeCountStats}
            accountOptions={dashboardAccountOptions}
            accountFilter={dashboardAccountFilter}
            onAccountFilterChange={setDashboardAccountFilter}
            loading={loadingTradeCountStats}
          />
        ),
      };
    }
    if (widgetId === "INFERRED_ACCOUNT_TRADE_COUNTS") {
      return {
        id: widgetId,
        node: (
          <InferredAccountTradeCountsCard
            title={`Inferred Counts (${scopedStatsYear})`}
            account={selectedInferredAccountCounts}
            normalStats={tradeCountStats}
            accountOptions={dashboardAccountOptions}
            accountFilter={dashboardAccountFilter}
            onAccountFilterChange={setDashboardAccountFilter}
            loading={loadingInferredAccountTradeCounts || loadingTradeCountStats}
          />
        ),
      };
    }
    return { id: widgetId, node: null };
  });

  const monthlyColor = useMemo(() => {
    if (!displaySummary) return undefined;
    if (displaySummary.totalPnl > 0) return "success.main";
    if (displaySummary.totalPnl < 0) return "error.main";
    return "text.primary";
  }, [displaySummary]);
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
          {!user && authError && (
            <Alert severity="warning">
              {authError}
            </Alert>
          )}
          {authBlockedMessage && (
            <Alert severity="warning" onClose={() => setAuthBlockedMessage(null)}>
              {authBlockedMessage}
            </Alert>
          )}
          {dashboardWidgetCards.length > 0 ? (
            <Grid container spacing={2}>
              {dashboardWidgetCards.map((widget) => (
                <Grid key={widget.id} size={widgetGridSize}>
                  {widget.node}
                </Grid>
              ))}
            </Grid>
          ) : (
            <Alert severity="info">
              No dashboard widgets selected. Open Preferences to add widgets.
            </Alert>
          )}

          <Card variant="outlined">
            <CardContent sx={{ "&:last-child": { pb: 2 } }}>
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
                    {displaySummary
                      ? `P/L ${calendarMonth}: ${formatMoney(displaySummary.totalPnl, displayCurrency)}${
                          displaySummary.pnlPercent != null ? ` (${displaySummary.pnlPercent.toFixed(2)}%)` : ""
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
                    disabled={!displaySummary || sharing || loadingSummary}
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
                daily={displaySummary?.daily || []}
                initialMonth={displaySummary?.daily?.[0]?.period}
                month={calendarMonth}
                onMonthChange={handleMonthChange}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                draggingTradeId={draggingTradeId}
                onTradeDrop={handleDropTradeToDate}
                valueMode={calendarValueMode}
                marginMode={calendarMarginMode}
              />
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ mt: 1 }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: "none", sm: "block" }, flex: 1, minWidth: 0 }}
                >
                  {fxRate
                    ? `P/L shown in ${displayCurrency}. CAD/USD rate ${fxRate.toFixed(5)}${fxDate ? ` (BOC effective date: ${fxDate})` : ""}.`
                    : `P/L shown in ${displayCurrency}. CAD/USD conversion used the latest available rate.`}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: "block", sm: "none" }, flex: 1, minWidth: 0 }}
                >
                  {fxRate ? `${displayCurrency} P/L. CAD/USD ${fxRate.toFixed(5)}` : `${displayCurrency} P/L. Latest FX.`}
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                  <IconButton
                    size="small"
                    aria-label="View options"
                    aria-controls={calendarOptionsAnchor ? "calendar-view-options-menu" : undefined}
                    aria-haspopup="menu"
                    aria-expanded={calendarOptionsAnchor ? "true" : undefined}
                    onClick={(event) => setCalendarOptionsAnchor(event.currentTarget)}
                    sx={{
                      display: { xs: "inline-flex", sm: "none" },
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                    }}
                  >
                    <TuneIcon fontSize="small" />
                  </IconButton>
                  <Menu
                    id="calendar-view-options-menu"
                    anchorEl={calendarOptionsAnchor}
                    open={Boolean(calendarOptionsAnchor)}
                    onClose={() => setCalendarOptionsAnchor(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    transformOrigin={{ vertical: "top", horizontal: "right" }}
                  >
                    <MenuItem onClick={handleCalendarMarginModeToggle}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2">Toggle margin</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {getCalendarMarginModeLabel(calendarMarginMode, calendarValueMode)}
                        </Typography>
                      </Stack>
                    </MenuItem>
                    <MenuItem onClick={() => setHidePastTrades((v) => !v)} selected={hidePastTrades}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2">Hide closed trades</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {hidePastTrades ? "On" : "Off"}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  </Menu>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      flexWrap: "wrap",
                      rowGap: 0.75,
                      justifyContent: "flex-end",
                    }}
                  >
                    <Chip
                      label={`Month view: ${getCalendarMarginModeLabel(calendarMarginMode, calendarValueMode)}`}
                      size="small"
                      variant={calendarMarginMode === "net" ? "outlined" : "filled"}
                      color={calendarMarginMode === "net" ? "default" : "primary"}
                      onClick={handleCalendarMarginModeToggle}
                      onDelete={calendarMarginMode === "net" ? undefined : () => setCalendarMarginMode("net")}
                    />
                    <Chip
                      label="Hide closed trades from table"
                      size="small"
                      variant={hidePastTrades ? "filled" : "outlined"}
                      color={hidePastTrades ? "primary" : "default"}
                      onClick={() => setHidePastTrades((v) => !v)}
                      onDelete={hidePastTrades ? () => setHidePastTrades(false) : undefined}
                    />
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>

            <TradesTable
              trades={filteredTrades}
              accountNamesById={accountNamesById}
              loading={loadingTrades}
              onEdit={handleEditTrade}
              onDelete={handleDeleteTrade}
              onTradeDragStart={setDraggingTradeId}
              onTradeDragEnd={() => setDraggingTradeId(null)}
              sortBy={user && token ? tradeSort.sortBy : undefined}
              sortDirection={user && token ? tradeSort.sortDirection : undefined}
              onSortChange={user && token ? handleTradeSortChange : undefined}
              showDetailedTradeTimes={showDetailedTradeTimesEnabled}
              toolbar={
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", md: "center" }}
                >
                  <TextField
                    label="Ticker"
                    placeholder="Search ticker"
                    size="small"
                    value={symbolFilterDraft}
                    onChange={(event) => handleSymbolFilterChange(event.target.value)}
                    sx={{ minWidth: { xs: "100%", md: 180 }, flex: { md: "0 1 220px" } }}
                  />
                  <Autocomplete
                    multiple
                    disableCloseOnSelect
                    disablePortal
                    size="small"
                    options={tradeAccountFilterOptions}
                    value={selectedTradeAccountFilterOptions}
                    onChange={(_, selected) => handleTradeAccountFilterChange(selected)}
                    getOptionLabel={(option) => option.label}
                    isOptionEqualToValue={(option, value) => option.value === value.value}
                    renderOption={(props, option, { selected }) => {
                      const { key, ...optionProps } = props as typeof props & { key: Key };
                      return (
                        <li key={key} {...optionProps}>
                          <Checkbox checked={selected} size="small" sx={{ mr: 1 }} />
                          {option.label}
                        </li>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Accounts"
                        placeholder={
                          selectedTradeAccountFilterOptions.length === 0 ? "Search accounts" : ""
                        }
                      />
                    )}
                    sx={{ minWidth: { xs: "100%", md: 320 }, flex: { md: "0 1 380px" } }}
                  />
                  <Box sx={{ display: { xs: "none", md: "block" }, flex: 1 }} />
                  {hasTradeFilters && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ whiteSpace: "nowrap", alignSelf: { xs: "flex-start", md: "center" } }}
                    >
                      {activeTradeFilterCount} active
                    </Typography>
                  )}
                  {hasTradeFilters && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleClearTradeFilters}
                      sx={{ alignSelf: { xs: "flex-start", md: "center" }, whiteSpace: "nowrap" }}
                    >
                      Clear filters
                    </Button>
                  )}
                </Stack>
              }
              emptyMessage={
                hasTradeFilters || selectedDate || hidePastTrades
                  ? "No trades match the current filters."
                  : undefined
              }
              page={user ? page : undefined}
              pageSize={user ? pageSize : undefined}
              totalElements={user ? pageMeta.totalElements : undefined}
              onPageChange={
                user
                  ? (newPage) => {
                      setPage(Math.max(0, newPage));
                    }
                  : undefined
              }
              onPageSizeChange={
                user
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
        </Stack>
      </Container>

      <TradeDialog
        open={tradeDialogOpen}
        isEditing={!!editingTrade}
        showHistoryAction={Boolean(editingTrade && user && token && showTradeHistoryEnabled)}
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
            : selectedDate
              ? { currency: displayCurrency, closedAt: selectedDate, expiryDate: selectedDate }
              : { currency: displayCurrency }
        }
        accounts={accounts}
        submitting={savingTrade}
        onClose={() => {
          setTradeDialogOpen(false);
          setEditingTrade(null);
        }}
        onSubmit={handleSaveTrade}
        onHistoryClick={() => void handleOpenTradeHistory()}
      />

      <Dialog
        open={tradeHistoryOpen}
        onClose={handleCloseTradeHistory}
        aria-labelledby="trade-history-dialog-title"
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle id="trade-history-dialog-title">
          {tradeHistorySubject ? `${tradeHistorySubject.symbol} history` : "Trade history"}
        </DialogTitle>
        <DialogContent dividers>
          {loadingTradeHistory ? (
            <Typography color="text.secondary">Loading history...</Typography>
          ) : tradeHistoryRows.length === 0 ? (
            <Typography color="text.secondary">No history recorded for this trade.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Action</TableCell>
                    <TableCell>When</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Side</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Entry</TableCell>
                    <TableCell align="right">Exit</TableCell>
                    <TableCell align="right">P/L</TableCell>
                    <TableCell>Closed</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tradeHistoryRows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell>{formatHistoryTimestamp(entry.actionAt)}</TableCell>
                      <TableCell>{entry.symbol}</TableCell>
                      <TableCell>{entry.direction}</TableCell>
                      <TableCell align="right">{formatQuantity(entry.quantity)}</TableCell>
                      <TableCell align="right">{formatSignedNumber(entry.entryPrice)}</TableCell>
                      <TableCell align="right">{formatSignedNumber(entry.exitPrice)}</TableCell>
                      <TableCell align="right">{formatSignedNumber(entry.realizedPnl)}</TableCell>
                      <TableCell>{entry.closedAt}</TableCell>
                      <TableCell>{entry.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTradeHistory}>Close</Button>
        </DialogActions>
      </Dialog>

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
                          {copiedShareCode === link.code ? "Copied" : "Copy Link"}
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
          if (!savingAccount && !deletingAccountId && !savingEditAccount) {
            setAccountsDialogOpen(false);
            setEditingAccountId(null);
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
              <Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={accountDraft.taxFree}
                      onChange={(event) =>
                        setAccountDraft((prev) => ({ ...prev, taxFree: event.target.checked }))
                      }
                    />
                  }
                  label="Tax-free account"
                />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                  Trades in this account are excluded from the Tax Owing widget.
                </Typography>
              </Box>
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
                  label="Option Fee / Contract"
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
                  const isEditing = editingAccountId === account.id;
                  const stockFeeRaw = Number(account.defaultStockFees);
                  const optionFeeRaw = Number(account.defaultOptionFees);
                  const marginUsdRaw = Number(account.defaultMarginRateUsd);
                  const marginCadRaw = Number(account.defaultMarginRateCad);
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
                      {isEditing ? (
                        <Stack spacing={1.5}>
                          <TextField
                            label="Brokerage Name"
                            value={accountEditDraft.name}
                            onChange={(event) =>
                              setAccountEditDraft((prev) => ({ ...prev, name: event.target.value }))
                            }
                            fullWidth
                            size="small"
                          />
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={accountEditDraft.taxFree}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    taxFree: event.target.checked,
                                  }))
                                }
                              />
                            }
                            label="Tax-free account"
                          />
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                            <TextField
                              label="Stock Fee"
                              type="number"
                              value={accountEditDraft.defaultStockFees}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({ ...prev, defaultStockFees: event.target.value }))
                              }
                              inputProps={{ min: 0, step: 0.01 }}
                              fullWidth
                              size="small"
                            />
                            <TextField
                              label="Option Fee / Contract"
                              type="number"
                              value={accountEditDraft.defaultOptionFees}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({ ...prev, defaultOptionFees: event.target.value }))
                              }
                              inputProps={{ min: 0, step: 0.01 }}
                              fullWidth
                              size="small"
                            />
                          </Stack>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                            <TextField
                              label="Margin USD %"
                              type="number"
                              value={accountEditDraft.defaultMarginRateUsd}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({ ...prev, defaultMarginRateUsd: event.target.value }))
                              }
                              inputProps={{ min: 0, step: 0.01 }}
                              fullWidth
                              size="small"
                            />
                            <TextField
                              label="Margin CAD %"
                              type="number"
                              value={accountEditDraft.defaultMarginRateCad}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({ ...prev, defaultMarginRateCad: event.target.value }))
                              }
                              inputProps={{ min: 0, step: 0.01 }}
                              fullWidth
                              size="small"
                            />
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void handleSaveEditAccount(account.id)}
                              disabled={savingEditAccount}
                            >
                              {savingEditAccount ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="small"
                              onClick={handleCancelEditAccount}
                              disabled={savingEditAccount}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", sm: "center" }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={700}>
                              {account.name}
                            </Typography>
                            {account.taxFree && <Chip label="Tax-free" size="small" color="success" />}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            Stock fee/trade: {stockFee.toFixed(2)} | Option fee/contract: {optionFee.toFixed(2)} | Margin USD: {marginUsd.toFixed(2)}% | Margin CAD: {marginCad.toFixed(2)}%
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleStartEditAccount(account)}
                              disabled={!!deletingAccountId || !!editingAccountId}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              onClick={() => void handleDeleteAccount(account.id)}
                              disabled={deletingAccountId === account.id || !!editingAccountId}
                            >
                              {deletingAccountId === account.id ? "Deleting..." : "Delete"}
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAccountsDialogOpen(false);
              setEditingAccountId(null);
            }}
            disabled={savingAccount || !!deletingAccountId || savingEditAccount}
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
                  setPreferencesDraft((prev) => ({ ...buildPreferencesDraft(prev), themeMode: next }));
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
                  setPreferencesDraft((prev) => ({ ...buildPreferencesDraft(prev), pnlDisplayMode: next }));
                }}
              >
                <FormControlLabel value="pnl" control={<Radio />} label="P/L" />
                <FormControlLabel value="percent" control={<Radio />} label="% Return" />
              </RadioGroup>
            </FormControl>
            <FormControl component="fieldset">
              <FormLabel component="legend">Display currency</FormLabel>
              <RadioGroup
                value={preferencesDraft?.displayCurrency ?? displayCurrency}
                onChange={(event) => {
                  const next = resolveDisplayCurrency(event.target.value as Currency);
                  setPreferencesDraft((prev) => ({ ...buildPreferencesDraft(prev), displayCurrency: next }));
                }}
              >
                <FormControlLabel value="USD" control={<Radio />} label="USD" />
                <FormControlLabel value="CAD" control={<Radio />} label="CAD" />
              </RadioGroup>
            </FormControl>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Default trade sort"
                value={preferencesDraft?.defaultTradeSortBy ?? tradeSort.sortBy}
                onChange={(event) => {
                  const next = event.target.value as TradeSortField;
                  setPreferencesDraft((prev) => ({
                    ...buildPreferencesDraft(prev),
                    defaultTradeSortBy: resolveTradeSortBy(next),
                  }));
                }}
              >
                {SORTABLE_TRADE_FIELDS.map((field) => (
                  <MenuItem key={field} value={field}>
                    {TRADE_SORT_LABELS[field]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Direction"
                value={preferencesDraft?.defaultTradeSortDirection ?? tradeSort.sortDirection}
                onChange={(event) => {
                  const next = event.target.value as TradeSortDirection;
                  setPreferencesDraft((prev) => ({
                    ...buildPreferencesDraft(prev),
                    defaultTradeSortDirection: resolveTradeSortDirection(next),
                  }));
                }}
              >
                <MenuItem value="DESC">Descending</MenuItem>
                <MenuItem value="ASC">Ascending</MenuItem>
              </TextField>
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={preferencesDraft?.showTradeHistory ?? showTradeHistoryEnabled}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setPreferencesDraft((prev) => ({ ...buildPreferencesDraft(prev), showTradeHistory: next }));
                  }}
                />
              }
              label="Show trade history in edit dialog"
            />
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={preferencesDraft?.showDetailedTradeTimes ?? showDetailedTradeTimesEnabled}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setPreferencesDraft((prev) => ({
                        ...buildPreferencesDraft(prev),
                        showDetailedTradeTimes: next,
                      }));
                    }}
                  />
                }
                label="Show inferred trade times"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Open time uses the first save. Close time uses the last trade update. Manual
                trade dates remain the source of truth.
              </Typography>
            </Box>
            <FormControl component="fieldset">
              <FormLabel component="legend">Dashboard widgets</FormLabel>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {widgetPreferenceRows.map((widgetId) => {
                  const selectedWidgets = preferencesDraft?.dashboardWidgets ?? selectedDashboardWidgets;
                  const isSelected = selectedWidgets.includes(widgetId);
                  const selectedIndex = selectedWidgets.indexOf(widgetId);
                  const widgetLabel = getDashboardWidgetLabel(widgetId);
                  return (
                    <Box
                      key={widgetId}
                      aria-label={`Dashboard widget preference ${widgetLabel}`}
                      onDragOver={(event) => {
                        if (isSelected) {
                          handleDashboardWidgetDragOver(event, widgetId);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          return;
                        }
                        setDragOverDashboardWidget((current) => (current === widgetId ? null : current));
                      }}
                      onDrop={(event) => {
                        if (isSelected) {
                          handleDashboardWidgetDrop(event, widgetId);
                        }
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        border: "1px solid",
                        borderColor: dragOverDashboardWidget === widgetId ? "primary.main" : "divider",
                        borderRadius: 1,
                        bgcolor: draggingDashboardWidget === widgetId ? "action.selected" : "background.paper",
                        px: 1,
                        py: 0.5,
                        opacity: isSelected ? 1 : 0.58,
                        transition: "background-color 120ms ease, border-color 120ms ease, opacity 120ms ease",
                      }}
                    >
                      <Tooltip describeChild title={isSelected ? "Drag to reorder" : "Select to enable reordering"}>
                        <Box
                          component="span"
                          aria-label={`Drag ${widgetLabel}`}
                          draggable={isSelected}
                          onDragStart={(event) => {
                            if (!isSelected) {
                              event.preventDefault();
                              return;
                            }
                            handleDashboardWidgetDragStart(event, widgetId);
                          }}
                          onDragEnd={handleDashboardWidgetDragEnd}
                          sx={{
                            alignItems: "center",
                            color: isSelected ? "text.secondary" : "action.disabled",
                            cursor: isSelected ? "grab" : "not-allowed",
                            display: "inline-flex",
                            flex: "0 0 auto",
                          }}
                        >
                          <DragIndicatorIcon fontSize="small" />
                        </Box>
                      </Tooltip>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={isSelected}
                            onChange={(event) => {
                              setPreferencesDraft((prev) => {
                                const base = buildPreferencesDraft(prev);
                                const nextWidgets = event.target.checked
                                  ? [...base.dashboardWidgets, widgetId]
                                  : base.dashboardWidgets.filter((id) => id !== widgetId);
                                return {
                                  ...base,
                                  dashboardWidgets: normalizeDashboardWidgets(nextWidgets),
                                };
                              });
                            }}
                          />
                        }
                        label={widgetLabel}
                        sx={{ flex: 1, minWidth: 0, mr: 0 }}
                      />
                      <Stack direction="row" spacing={0.5}>
                        <IconButton
                          size="small"
                          aria-label={`Move ${widgetLabel} up`}
                          disabled={!isSelected || selectedIndex <= 0}
                          onClick={() => {
                            setPreferencesDraft((prev) => {
                              const base = buildPreferencesDraft(prev);
                              return {
                                ...base,
                                dashboardWidgets: moveDashboardWidget(base.dashboardWidgets, widgetId, -1),
                              };
                            });
                          }}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Move ${widgetLabel} down`}
                          disabled={!isSelected || selectedIndex < 0 || selectedIndex >= selectedWidgets.length - 1}
                          onClick={() => {
                            setPreferencesDraft((prev) => {
                              const base = buildPreferencesDraft(prev);
                              return {
                                ...base,
                                dashboardWidgets: moveDashboardWidget(base.dashboardWidgets, widgetId, 1),
                              };
                            });
                          }}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </FormControl>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Capital gains rate %"
                type="number"
                value={preferencesDraft?.taxCapitalGainsRate ?? String(taxCapitalGainsRate)}
                onChange={(event) => {
                  const next = event.target.value;
                  setPreferencesDraft((prev) => ({
                    ...buildPreferencesDraft(prev),
                    taxCapitalGainsRate: next,
                  }));
                }}
                inputProps={{ min: 0, max: 100, step: 0.01 }}
                helperText="Defaults to 50%."
                fullWidth
              />
              <TextField
                label="Personal tax rate %"
                type="number"
                value={preferencesDraft?.taxPersonalRate ?? String(taxPersonalRate)}
                onChange={(event) => {
                  const next = event.target.value;
                  setPreferencesDraft((prev) => ({
                    ...buildPreferencesDraft(prev),
                    taxPersonalRate: next,
                  }));
                }}
                inputProps={{ min: 1, max: 100, step: 0.01 }}
                helperText="Used by the tax widget."
                fullWidth
              />
            </Stack>
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
        open={!!warning}
        autoHideDuration={3500}
        onClose={() => setWarning(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setWarning(null)} severity="warning" sx={{ width: "100%" }}>
          {warning}
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
  currency,
  loading,
}: {
  title: string;
  value?: number;
  trades?: number;
  percent?: number;
  currency: Currency;
  loading?: boolean;
}) {
  const display = value != null
    ? formatMoney(value, currency)
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

function TaxCard({
  title,
  value,
  taxablePnl,
  capitalGainsRate,
  personalRate,
  currency,
  loading,
}: {
  title: string;
  value: number;
  taxablePnl?: number;
  capitalGainsRate: number;
  personalRate: number;
  currency: Currency;
  loading?: boolean;
}) {
  const display = formatMoney(value, currency);
  const pnlLabel = taxablePnl != null
    ? `${formatMoney(taxablePnl, currency)} taxable P/L`
    : "No taxable P/L";
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={800}>
          {loading ? "…" : display}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : `${capitalGainsRate.toFixed(2)}% taxable • ${personalRate.toFixed(2)}% rate • ${pnlLabel}`}
        </Typography>
      </CardContent>
    </Card>
  );
}

function AveragePnlCard({
  title,
  value,
  tradedDayValue,
  currency,
  tradingDays,
  tradedDays,
  loading,
}: {
  title: string;
  value?: number;
  tradedDayValue?: number;
  currency: Currency;
  tradingDays: number;
  tradedDays: number;
  loading?: boolean;
}) {
  const display = value != null
    ? formatMoney(value, currency)
    : "—";
  const tradedDayDisplay = tradedDayValue != null
    ? formatMoney(tradedDayValue, currency)
    : "—";
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
            : tradingDays > 0
              ? `${tradingDays} total trading day${tradingDays === 1 ? "" : "s"}`
              : "No trading days"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : tradedDays > 0
              ? `${tradedDayDisplay} avg on ${tradedDays} day${tradedDays === 1 ? "" : "s"} traded`
              : "No traded days"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function AccountFilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: DashboardAccountOption[];
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      variant="standard"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 130 }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function AccountStatsCard({
  title,
  account,
  accountOptions,
  accountFilter,
  onAccountFilterChange,
  currency,
  loading,
}: {
  title: string;
  account: AccountStats | null;
  accountOptions: DashboardAccountOption[];
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  currency: Currency;
  loading?: boolean;
}) {
  const value = account?.totalPnl ?? 0;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="overline" color="text.secondary">
            {title}
          </Typography>
          <AccountFilterSelect
            value={accountFilter}
            options={accountOptions}
            onChange={onAccountFilterChange}
          />
        </Stack>
        <Typography
          variant="h5"
          fontWeight={800}
          color={!value ? "text.primary" : value >= 0 ? "success.main" : "error.main"}
        >
          {loading ? "…" : account ? formatMoney(account.totalPnl, currency) : "—"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : account
              ? `${account.tradeCount} trade${account.tradeCount === 1 ? "" : "s"} • ${account.pnlPercent ?? "—"}% return`
              : "No account trades"}
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Avg / month</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading || !account ? "…" : formatMoney(account.monthlyAveragePnl, currency)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Avg / traded day</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading || !account ? "…" : formatMoney(account.tradedDayAveragePnl, currency)}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function TradeCountsCard({
  title,
  stats,
  accountOptions,
  accountFilter,
  onAccountFilterChange,
  loading,
}: {
  title: string;
  stats: TradeCountStats | null;
  accountOptions: DashboardAccountOption[];
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  loading?: boolean;
}) {
  const yearlyCount = stats?.yearTradeCount ?? 0;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="overline" color="text.secondary">
            {title}
          </Typography>
          <AccountFilterSelect
            value={accountFilter}
            options={accountOptions}
            onChange={onAccountFilterChange}
          />
        </Stack>
        <Typography variant="h5" fontWeight={800}>
          {loading ? "…" : yearlyCount.toLocaleString()}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : `${stats?.yearTradedDays ?? 0} traded day${stats?.yearTradedDays === 1 ? "" : "s"} YTD`}
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Month</Typography>
            <Typography variant="body2" fontWeight={700}>{loading ? "…" : stats?.monthTradeCount ?? 0}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Day</Typography>
            <Typography variant="body2" fontWeight={700}>{loading ? "…" : stats?.dayTradeCount ?? 0}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Avg / traded day</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : formatSignedNumber(stats?.averageTradesPerTradedDay ?? 0)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Avg / weekday</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : formatSignedNumber(stats?.averageTradesPerTradingDay ?? 0)}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function InferredAccountTradeCountsCard({
  title,
  account,
  normalStats,
  accountOptions,
  accountFilter,
  onAccountFilterChange,
  loading,
}: {
  title: string;
  account: InferredAccountTradeCounts | null;
  normalStats: TradeCountStats | null;
  accountOptions: DashboardAccountOption[];
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  loading?: boolean;
}) {
  const normalYearCount = normalStats?.yearTradeCount ?? 0;
  const normalMonthCount = normalStats?.monthTradeCount ?? 0;
  const normalDayCount = normalStats?.dayTradeCount ?? 0;
  const inferredYearCount = account?.inferredAddCount ?? 0;
  const inferredMonthCount = account?.monthInferredAddCount ?? 0;
  const inferredDayCount = account?.dayInferredAddCount ?? 0;
  const adjustedYearCount = normalYearCount + inferredYearCount;
  const adjustedMonthCount = normalMonthCount + inferredMonthCount;
  const adjustedDayCount = normalDayCount + inferredDayCount;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="overline" color="text.secondary">
              {title}
            </Typography>
            <Chip size="small" label="Beta" />
          </Stack>
          <AccountFilterSelect
            value={accountFilter}
            options={accountOptions}
            onChange={onAccountFilterChange}
          />
        </Stack>
        <Typography variant="h5" fontWeight={800}>
          {loading ? "…" : adjustedYearCount.toLocaleString()}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? "Loading…"
            : `${normalYearCount.toLocaleString()} normal / ${inferredYearCount.toLocaleString()} inferred`}
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Month</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : `${adjustedMonthCount} (${normalMonthCount}+${inferredMonthCount})`}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Day</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : `${adjustedDayCount} (${normalDayCount}+${inferredDayCount})`}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Inferred adds</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : inferredYearCount.toLocaleString()}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Added shares</Typography>
            <Typography variant="body2" fontWeight={700}>
              {loading ? "…" : (account?.inferredAddedQuantity ?? 0).toLocaleString()}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function BucketCard({
  title,
  bucket,
  loading,
  icon,
  currency,
}: {
  title: string;
  bucket: PnlBucket | null;
  loading?: boolean;
  icon?: ReactNode;
  currency: Currency;
}) {
  const value = bucket?.pnl ?? 0;
  const formattedValue = formatMoney(value, currency);
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
