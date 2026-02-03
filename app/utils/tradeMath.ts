import type { AssetType, TradeDirection } from "../api/types";

const OPTION_MULTIPLIER = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_IN_YEAR = 365;

const toUtcMidnight = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Date.UTC(year, month - 1, day);
};

export const computeDaysBetween = (openedAt?: string | null, closedAt?: string | null) => {
  const start = toUtcMidnight(openedAt);
  const end = toUtcMidnight(closedAt);
  if (start === null || end === null) return null;
  const diff = Math.floor((end - start) / MS_PER_DAY);
  return diff < 0 ? 0 : diff;
};

export const computeTradeNotional = (
  entryPrice?: number | null,
  quantity?: number | null,
  assetType?: AssetType | null
) => {
  if (entryPrice === null || entryPrice === undefined) return null;
  if (quantity === null || quantity === undefined) return null;
  if (!assetType) return null;
  const multiplier = assetType === "OPTION" ? OPTION_MULTIPLIER : 1;
  const notional = Math.abs(entryPrice * quantity * multiplier);
  return Number.isFinite(notional) ? notional : null;
};

export const computeMarginFee = (inputs: {
  entryPrice?: number | null;
  quantity?: number | null;
  assetType?: AssetType | null;
  marginRate?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
}) => {
  const rate = inputs.marginRate ?? 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const notional = computeTradeNotional(inputs.entryPrice, inputs.quantity, inputs.assetType);
  if (!notional || notional <= 0) return 0;
  const days = computeDaysBetween(inputs.openedAt, inputs.closedAt);
  if (!days || days <= 0) return 0;
  const fee = (notional * rate * days) / (100 * DAYS_IN_YEAR);
  return Number.isFinite(fee) ? Number(fee.toFixed(2)) : 0;
};

export const computeRealizedPnl = (inputs: {
  entryPrice?: number | null;
  exitPrice?: number | null;
  quantity?: number | null;
  assetType?: AssetType | null;
  direction?: TradeDirection | null;
  fees?: number | null;
  marginRate?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
}) => {
  const entry = inputs.entryPrice;
  const exit = inputs.exitPrice;
  const quantity = inputs.quantity;
  const direction = inputs.direction;
  const assetType = inputs.assetType;
  if (entry === null || entry === undefined) return null;
  if (exit === null || exit === undefined) return null;
  if (quantity === null || quantity === undefined) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(quantity)) return null;
  if (!direction || !assetType) return null;
  const directionMultiplier = direction === "SHORT" ? -1 : 1;
  const movement = (exit - entry) * directionMultiplier;
  const multiplier = assetType === "OPTION" ? OPTION_MULTIPLIER : 1;
  const gross = movement * quantity * multiplier;
  const fees = inputs.fees ?? 0;
  const marginFee = computeMarginFee({
    entryPrice: entry,
    quantity,
    assetType,
    marginRate: inputs.marginRate,
    openedAt: inputs.openedAt,
    closedAt: inputs.closedAt,
  });
  const total = gross - fees - marginFee;
  return Number.isFinite(total) ? Number(total.toFixed(2)) : null;
};
