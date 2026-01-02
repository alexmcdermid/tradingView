import type { PnlBucket, PnlSummary } from "../api/types";

export type SharedSummaryPayload = {
  month: string;
  summary: PnlSummary;
  generatedAt: string;
  env?: string;
  origin?: string;
};

export const SHARE_QUERY_PARAM = "data";

type CompactDailyBucket = [number, number, number];
type CompactSummaryTuple = [number, number, CompactDailyBucket[], number?, string?];
type CompactShareToken = {
  m: string;
  g: string;
  e?: string;
  o?: string;
  s: CompactSummaryTuple;
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

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildCompactToken = (payload: SharedSummaryPayload): CompactShareToken => {
  const monthKey = payload.month.slice(0, 7);
  const daily: CompactDailyBucket[] = payload.summary.daily
    .filter((bucket) => bucket.period.startsWith(monthKey))
    .map((bucket) => {
      const day = Number(bucket.period.slice(8, 10));
      if (!Number.isFinite(day)) return null;
      return [day, Number(bucket.pnl.toFixed(2)), Math.round(bucket.trades)];
    })
    .filter((bucket): bucket is CompactDailyBucket => bucket !== null);

  const totalPnl = Number(payload.summary.totalPnl.toFixed(2));
  const tradeCount = Math.round(payload.summary.tradeCount ?? 0);
  const summary: CompactSummaryTuple = [totalPnl, tradeCount, daily];
  if (payload.summary.cadToUsdRate !== undefined || payload.summary.fxDate !== undefined) {
    summary[3] = payload.summary.cadToUsdRate === undefined ? undefined : Number(payload.summary.cadToUsdRate);
    summary[4] = payload.summary.fxDate;
  }

  return {
    m: monthKey,
    g: payload.generatedAt,
    e: payload.env,
    o: payload.origin,
    s: summary,
  };
};

const decodeCompactToken = (payload: CompactShareToken): SharedSummaryPayload | null => {
  if (!payload.m || typeof payload.m !== "string") return null;
  if (!Array.isArray(payload.s) || payload.s.length < 3) return null;
  const [totalPnlRaw, tradeCountRaw, dailyRaw, cadToUsdRateRaw, fxDateRaw] = payload.s;
  if (!Array.isArray(dailyRaw)) return null;

  const daily = dailyRaw
    .map((bucket) => {
      if (!Array.isArray(bucket) || bucket.length < 3) return null;
      const day = toNumber(bucket[0], NaN);
      if (!Number.isFinite(day) || day < 1 || day > 31) return null;
      return {
        period: `${payload.m}-${pad2(Math.trunc(day))}`,
        pnl: toNumber(bucket[1]),
        trades: Math.round(toNumber(bucket[2])),
      };
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

  return {
    month: payload.m,
    summary: {
      totalPnl,
      tradeCount,
      daily,
      monthly: [{ period: payload.m, pnl: totalPnl, trades: tradeCount }],
      cadToUsdRate,
      fxDate: fxDateRaw ? String(fxDateRaw) : undefined,
    },
    generatedAt: payload.g || new Date().toISOString(),
    env: payload.e,
    origin: payload.o,
  };
};

export function buildSharePayload(
  month: string,
  summary: PnlSummary,
  options: { env?: string; origin?: string; generatedAt?: string } = {}
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
  };
}

export function encodeShareToken(payload: SharedSummaryPayload) {
  return toBase64Url(JSON.stringify(buildCompactToken(payload)));
}

export function decodeShareToken(token: string): SharedSummaryPayload | null {
  try {
    const json = fromBase64Url(token);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return decodeCompactToken(parsed as CompactShareToken);
  } catch {
    return null;
  }
}
