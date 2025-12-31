import type { PnlBucket, PnlSummary } from "../api/types";

export type SharedSummaryPayload = {
  version: 1;
  month: string;
  summary: PnlSummary;
  generatedAt: string;
  env?: string;
  origin?: string;
};

export const SHARE_QUERY_PARAM = "data";

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

const filterBucketsForMonth = (buckets: PnlBucket[], month: string) =>
  buckets.filter((bucket) => bucket.period.startsWith(month));

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
    version: 1,
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
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShareToken(token: string): SharedSummaryPayload | null {
  try {
    const json = fromBase64Url(token);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<SharedSummaryPayload>;
    if (!payload.month || typeof payload.month !== "string") return null;
    if (!payload.summary) return null;
    if (!Array.isArray(payload.summary.daily) || !Array.isArray(payload.summary.monthly)) return null;
    return {
      version: payload.version === 1 ? 1 : 1,
      month: payload.month,
      summary: {
        ...payload.summary,
        totalPnl: Number(payload.summary.totalPnl ?? 0),
        tradeCount: Number(payload.summary.tradeCount ?? 0),
        daily: payload.summary.daily.map((bucket) => ({
          period: String(bucket.period),
          pnl: Number(bucket.pnl ?? 0),
          trades: Number(bucket.trades ?? 0),
        })),
        monthly: payload.summary.monthly.map((bucket) => ({
          period: String(bucket.period),
          pnl: Number(bucket.pnl ?? 0),
          trades: Number(bucket.trades ?? 0),
        })),
        cadToUsdRate:
          payload.summary.cadToUsdRate === undefined
            ? undefined
            : Number(payload.summary.cadToUsdRate),
        fxDate: payload.summary.fxDate ? String(payload.summary.fxDate) : undefined,
      },
      generatedAt: payload.generatedAt || new Date().toISOString(),
      env: payload.env,
      origin: payload.origin,
    };
  } catch {
    return null;
  }
}
