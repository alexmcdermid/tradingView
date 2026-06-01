import type {
  AssetType,
  Currency,
  OptionType,
  PnlBucket,
  PnlSummary,
  Trade,
  TradeDirection,
} from "../api/types";

export type SharedSummaryPayload = {
  month: string;
  summary: PnlSummary;
  generatedAt: string;
  env?: string;
  origin?: string;
  displayCurrency?: Currency;
};

export type SharedTrade = Pick<
  Trade,
  | "symbol"
  | "currency"
  | "assetType"
  | "direction"
  | "quantity"
  | "entryPrice"
  | "exitPrice"
  | "fees"
  | "marginRate"
  | "realizedPnl"
  | "openedAt"
  | "closedAt"
  | "notes"
  | "optionType"
  | "strikePrice"
  | "expiryDate"
> & {
  accountName?: string;
};

export type SharedTradesPayload = {
  date: string;
  trades: SharedTrade[];
  totalPnl: number;
  generatedAt: string;
  env?: string;
  origin?: string;
  cadToUsdRate?: number;
  fxDate?: string;
  displayCurrency?: Currency;
};

export type SharedPayload = SharedSummaryPayload | SharedTradesPayload;

export const SHARE_QUERY_PARAM = "data";

type CompactDailyBucket = [number, number, number, number?];
type CompactSummaryTuple = [number, number, CompactDailyBucket[], number?, string?, number?];
type CompactSummaryToken = {
  m: string;
  g: string;
  e?: string;
  o?: string;
  c?: Currency;
  s: CompactSummaryTuple;
};

type CompactTradeTuple = [
  string,
  AssetType,
  TradeDirection,
  number,
  number,
  number,
  number,
  number,
  Currency,
  string,
  string,
  string?,
  OptionType?,
  number?,
  string?,
  number?,
  string?,
];

type CompactTradesToken = {
  d: string;
  g: string;
  e?: string;
  o?: string;
  c?: Currency;
  t: CompactTradeTuple[];
  p: number;
  r?: number;
  f?: string;
};

const toBase64 = (value: string) => {
  if (typeof btoa === "function") {
    return btoa(value);
  }
  return Buffer.from(value, "utf-8").toString("base64");
};

const fromBase64 = (value: string) => {
  if (typeof atob === "function") {
    return atob(value);
  }
  return Buffer.from(value, "base64").toString("utf-8");
};

const toBase64Url = (value: string) =>
  toBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return fromBase64(padded);
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const filterBucketsForMonth = (buckets: PnlBucket[], month: string) =>
  buckets.filter((bucket) => bucket.period.startsWith(month));

const ASSET_TYPES = new Set<AssetType>(["STOCK", "OPTION"]);
const DIRECTIONS = new Set<TradeDirection>(["LONG", "SHORT"]);
const CURRENCIES = new Set<Currency>(["USD", "CAD"]);
const OPTION_TYPES = new Set<OptionType>(["CALL", "PUT"]);

const isAssetType = (value: unknown): value is AssetType =>
  typeof value === "string" && ASSET_TYPES.has(value as AssetType);
const isDirection = (value: unknown): value is TradeDirection =>
  typeof value === "string" && DIRECTIONS.has(value as TradeDirection);
const isCurrency = (value: unknown): value is Currency =>
  typeof value === "string" && CURRENCIES.has(value as Currency);
const isOptionType = (value: unknown): value is OptionType =>
  typeof value === "string" && OPTION_TYPES.has(value as OptionType);

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildCompactSummaryToken = (payload: SharedSummaryPayload): CompactSummaryToken => {
  const monthKey = payload.month.slice(0, 7);
  const daily: CompactDailyBucket[] = payload.summary.daily
    .filter((bucket) => bucket.period.startsWith(monthKey))
    .map((bucket) => {
      const day = Number(bucket.period.slice(8, 10));
      if (!Number.isFinite(day)) return null;
      const compact: CompactDailyBucket = [
        day,
        Number(bucket.pnl.toFixed(2)),
        Math.round(bucket.trades),
      ];
      if (bucket.pnlPercent !== undefined && bucket.pnlPercent !== null) {
        compact[3] = Number(bucket.pnlPercent.toFixed(2));
      }
      return compact;
    })
    .filter((bucket): bucket is CompactDailyBucket => bucket !== null);

  const totalPnl = Number(payload.summary.totalPnl.toFixed(2));
  const tradeCount = Math.round(payload.summary.tradeCount ?? 0);
  const summary: CompactSummaryTuple = [totalPnl, tradeCount, daily];
  if (payload.summary.cadToUsdRate !== undefined || payload.summary.fxDate !== undefined) {
    summary[3] = payload.summary.cadToUsdRate === undefined ? undefined : Number(payload.summary.cadToUsdRate);
    summary[4] = payload.summary.fxDate;
  }
  if (payload.summary.pnlPercent !== undefined && payload.summary.pnlPercent !== null) {
    if (summary.length < 5) {
      summary.push(undefined, undefined);
    }
    summary[5] = Number(payload.summary.pnlPercent.toFixed(2));
  }

  return {
    m: monthKey,
    g: payload.generatedAt,
    e: payload.env,
    o: payload.origin,
    c: payload.displayCurrency ?? payload.summary.displayCurrency,
    s: summary,
  };
};

const decodeCompactSummaryToken = (payload: CompactSummaryToken): SharedSummaryPayload | null => {
  if (!payload.m || typeof payload.m !== "string") return null;
  if (!Array.isArray(payload.s) || payload.s.length < 3) return null;
  const [totalPnlRaw, tradeCountRaw, dailyRaw, cadToUsdRateRaw, fxDateRaw, pnlPercentRaw] = payload.s;
  if (!Array.isArray(dailyRaw)) return null;

  const daily = dailyRaw
    .map((bucket) => {
      if (!Array.isArray(bucket) || bucket.length < 3) return null;
      const day = toNumber(bucket[0], NaN);
      if (!Number.isFinite(day) || day < 1 || day > 31) return null;
      const pnlPercent =
        bucket.length >= 4 && bucket[3] !== undefined && bucket[3] !== null
          ? toNumber(bucket[3])
          : undefined;
      const entry: PnlBucket = {
        period: `${payload.m}-${pad2(Math.trunc(day))}`,
        pnl: toNumber(bucket[1]),
        trades: Math.round(toNumber(bucket[2])),
      };
      if (pnlPercent !== undefined) {
        entry.pnlPercent = pnlPercent;
      }
      return entry;
    })
    .filter((bucket): bucket is PnlBucket => bucket !== null);

  const totalPnl = toNumber(totalPnlRaw, daily.reduce((sum, bucket) => sum + bucket.pnl, 0));
  const tradeCount = Math.round(
    toNumber(tradeCountRaw, daily.reduce((sum, bucket) => sum + bucket.trades, 0))
  );

  const cadToUsdRate =
    cadToUsdRateRaw === undefined || cadToUsdRateRaw === null
      ? undefined
      : toNumber(cadToUsdRateRaw);
  const pnlPercent =
    pnlPercentRaw === undefined || pnlPercentRaw === null
      ? undefined
      : toNumber(pnlPercentRaw);
  const monthly: PnlBucket[] = [
    {
      period: payload.m,
      pnl: totalPnl,
      trades: tradeCount,
    },
  ];
  if (pnlPercent !== undefined) {
    monthly[0].pnlPercent = pnlPercent;
  }

  const summary: PnlSummary = {
    totalPnl,
    tradeCount,
    daily,
    monthly,
    cadToUsdRate,
    fxDate: fxDateRaw ? String(fxDateRaw) : undefined,
    displayCurrency: isCurrency(payload.c) ? payload.c : undefined,
  };
  if (pnlPercent !== undefined) {
    summary.pnlPercent = pnlPercent;
  }

  return {
    month: payload.m,
    summary,
    generatedAt: payload.g || new Date().toISOString(),
    env: payload.e,
    origin: payload.o,
    displayCurrency: isCurrency(payload.c) ? payload.c : undefined,
  };
};

const toDateOnly = (value: string) => value.slice(0, 10);

const normalizeNotes = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeTradeForShare = (
  trade: Trade,
  accountNamesById?: Record<string, string>
): SharedTrade => ({
  symbol: trade.symbol,
  currency: trade.currency,
  assetType: trade.assetType,
  direction: trade.direction,
  quantity: toNumber(trade.quantity),
  entryPrice: toNumber(trade.entryPrice),
  exitPrice: toNumber(trade.exitPrice),
  fees: toNumber(trade.fees),
  marginRate: toNumber(trade.marginRate),
  realizedPnl: toNumber(trade.realizedPnl),
  openedAt: toDateOnly(trade.openedAt),
  closedAt: toDateOnly(trade.closedAt),
  notes: normalizeNotes(trade.notes ?? undefined),
  optionType: trade.assetType === "OPTION" ? trade.optionType ?? undefined : undefined,
  strikePrice: trade.assetType === "OPTION" ? trade.strikePrice ?? undefined : undefined,
  expiryDate: trade.assetType === "OPTION" ? trade.expiryDate ?? undefined : undefined,
  accountName: trade.accountId ? accountNamesById?.[trade.accountId] : undefined,
});

const buildTradeTuple = (trade: SharedTrade): CompactTradeTuple => {
  const tuple: Array<string | number | undefined> = [
    trade.symbol,
    trade.assetType,
    trade.direction,
    toNumber(trade.quantity),
    toNumber(trade.entryPrice),
    toNumber(trade.exitPrice),
    toNumber(trade.fees),
    toNumber(trade.realizedPnl),
    trade.currency,
    toDateOnly(trade.openedAt),
    toDateOnly(trade.closedAt),
    normalizeNotes(trade.notes ?? undefined),
    trade.assetType === "OPTION" && trade.optionType ? trade.optionType : undefined,
    trade.assetType === "OPTION" && trade.strikePrice !== undefined && trade.strikePrice !== null
      ? toNumber(trade.strikePrice)
      : undefined,
    trade.assetType === "OPTION" && trade.expiryDate ? trade.expiryDate : undefined,
  ];
  if (trade.marginRate !== null && trade.marginRate !== undefined && trade.marginRate > 0) {
    tuple.push(toNumber(trade.marginRate));
  }
  if (trade.accountName) {
    if (tuple.length === 15) {
      tuple.push(undefined);
    }
    tuple.push(trade.accountName);
  }
  return tuple as CompactTradeTuple;
};

const decodeTradeTuple = (tuple: CompactTradeTuple): SharedTrade | null => {
  if (!Array.isArray(tuple) || tuple.length < 11) return null;
  const [
    symbol,
    assetTypeRaw,
    directionRaw,
    quantityRaw,
    entryPriceRaw,
    exitPriceRaw,
    feesRaw,
    realizedPnlRaw,
    currencyRaw,
    openedAtRaw,
    closedAtRaw,
    notesRaw,
    optionTypeRaw,
    strikePriceRaw,
    expiryDateRaw,
    marginRateRaw,
    accountNameRaw,
  ] = tuple;

  if (typeof symbol !== "string" || !isAssetType(assetTypeRaw) || !isDirection(directionRaw)) {
    return null;
  }
  if (!isCurrency(currencyRaw) || typeof openedAtRaw !== "string" || typeof closedAtRaw !== "string") {
    return null;
  }

  const optionType = isOptionType(optionTypeRaw) ? optionTypeRaw : undefined;
  const strikePrice =
    strikePriceRaw === undefined || strikePriceRaw === null ? undefined : toNumber(strikePriceRaw);
  const expiryDate = expiryDateRaw ? String(expiryDateRaw) : undefined;
  const notes = typeof notesRaw === "string" ? normalizeNotes(notesRaw) : undefined;
  const marginRate =
    marginRateRaw === undefined || marginRateRaw === null ? undefined : toNumber(marginRateRaw);
  const accountName =
    typeof accountNameRaw === "string" ? normalizeNotes(accountNameRaw) : undefined;

  return {
    symbol,
    currency: currencyRaw,
    assetType: assetTypeRaw,
    direction: directionRaw,
    quantity: toNumber(quantityRaw),
    entryPrice: toNumber(entryPriceRaw),
    exitPrice: toNumber(exitPriceRaw),
    fees: toNumber(feesRaw),
    marginRate,
    realizedPnl: toNumber(realizedPnlRaw),
    openedAt: openedAtRaw,
    closedAt: closedAtRaw,
    notes,
    optionType: assetTypeRaw === "OPTION" ? optionType : undefined,
    strikePrice: assetTypeRaw === "OPTION" ? strikePrice : undefined,
    expiryDate: assetTypeRaw === "OPTION" ? expiryDate : undefined,
    accountName,
  };
};

const computeTradesTotal = (
  trades: SharedTrade[],
  cadToUsdRate?: number,
  displayCurrency: Currency = "USD"
) => {
  const rate = cadToUsdRate && Number.isFinite(cadToUsdRate) && cadToUsdRate > 0 ? cadToUsdRate : 1;
  const total = trades.reduce(
    (sum, trade) => {
      if (displayCurrency === "CAD") {
        return sum + (trade.currency === "USD" ? trade.realizedPnl / rate : trade.realizedPnl);
      }
      return sum + (trade.currency === "CAD" ? trade.realizedPnl * rate : trade.realizedPnl);
    },
    0
  );
  return Number(total.toFixed(2));
};

const buildCompactTradesToken = (payload: SharedTradesPayload): CompactTradesToken => ({
  d: payload.date.slice(0, 10),
  g: payload.generatedAt,
  e: payload.env,
  o: payload.origin,
  c: payload.displayCurrency,
  t: payload.trades.map(buildTradeTuple),
  p: Number(payload.totalPnl.toFixed(2)),
  r: payload.cadToUsdRate === undefined ? undefined : Number(payload.cadToUsdRate),
  f: payload.fxDate,
});

const decodeCompactTradesToken = (payload: CompactTradesToken): SharedTradesPayload | null => {
  if (!payload.d || typeof payload.d !== "string") return null;
  if (!Array.isArray(payload.t)) return null;

  const decodedTrades = payload.t.map((trade) => decodeTradeTuple(trade));
  if (decodedTrades.some((trade) => trade === null)) return null;

  const trades = decodedTrades as SharedTrade[];
  const cadToUsdRate =
    payload.r === undefined || payload.r === null ? undefined : toNumber(payload.r);
  const displayCurrency = isCurrency(payload.c) ? payload.c : "USD";
  const computedTotal = computeTradesTotal(trades, cadToUsdRate, displayCurrency);
  const totalPnl = toNumber(payload.p, computedTotal);

  return {
    date: payload.d.slice(0, 10),
    trades,
    totalPnl,
    generatedAt: payload.g || new Date().toISOString(),
    env: payload.e,
    origin: payload.o,
    cadToUsdRate,
    fxDate: payload.f ? String(payload.f) : undefined,
    displayCurrency,
  };
};

export function buildSharePayload(
  month: string,
  summary: PnlSummary,
  options: { env?: string; origin?: string; generatedAt?: string; displayCurrency?: Currency } = {}
): SharedSummaryPayload {
  const monthKey = month.slice(0, 7);
  const daily = filterBucketsForMonth(summary.daily, monthKey);
  const monthly = filterBucketsForMonth(summary.monthly, monthKey);
  const tradeCount =
    monthly.length > 0
      ? monthly.reduce((total, bucket) => total + bucket.trades, 0)
      : daily.reduce((total, bucket) => total + bucket.trades, 0);
  const totalPnl =
    monthly.length > 0
      ? monthly.reduce((total, bucket) => total + bucket.pnl, 0)
      : daily.reduce((total, bucket) => total + bucket.pnl, 0);
  return {
    month: monthKey,
    summary: {
      ...summary,
      totalPnl: Number(totalPnl.toFixed(2)),
      tradeCount,
      daily,
      monthly,
    },
    generatedAt: options.generatedAt || new Date().toISOString(),
    env: options.env,
    origin: options.origin,
    displayCurrency: options.displayCurrency ?? summary.displayCurrency,
  };
}

export function buildTradesSharePayload(
  date: string,
  trades: Trade[],
  options: {
    env?: string;
    origin?: string;
    generatedAt?: string;
    cadToUsdRate?: number;
    fxDate?: string;
    displayCurrency?: Currency;
    accountNamesById?: Record<string, string>;
  } = {}
): SharedTradesPayload {
  const dateKey = date.slice(0, 10);
  const filteredTrades = trades.filter((trade) => trade.closedAt.startsWith(dateKey));
  const sharedTrades = filteredTrades.map((trade) =>
    normalizeTradeForShare(trade, options.accountNamesById)
  );
  const displayCurrency = options.displayCurrency ?? "USD";
  const totalPnl = computeTradesTotal(sharedTrades, options.cadToUsdRate, displayCurrency);

  return {
    date: dateKey,
    trades: sharedTrades,
    totalPnl,
    generatedAt: options.generatedAt || new Date().toISOString(),
    env: options.env,
    origin: options.origin,
    cadToUsdRate: options.cadToUsdRate,
    fxDate: options.fxDate,
    displayCurrency,
  };
}

export function encodeShareToken(payload: SharedPayload) {
  if ("summary" in payload) {
    return toBase64Url(JSON.stringify(buildCompactSummaryToken(payload)));
  }
  return toBase64Url(JSON.stringify(buildCompactTradesToken(payload)));
}

export function decodeShareToken(token: string): SharedPayload | null {
  try {
    const json = fromBase64Url(token);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if ("t" in parsed) {
      return decodeCompactTradesToken(parsed as CompactTradesToken);
    }
    if ("s" in parsed) {
      return decodeCompactSummaryToken(parsed as CompactSummaryToken);
    }
    return null;
  } catch {
    return null;
  }
}
