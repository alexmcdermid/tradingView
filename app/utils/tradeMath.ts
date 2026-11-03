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

type MarginFeeInputs = {
  entryPrice?: number | null;
  quantity?: number | null;
  assetType?: AssetType | null;
  marginRate?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
};

export const computeMarginFee = (inputs: MarginFeeInputs) => {
  const rate = inputs.marginRate ?? 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const notional = computeTradeNotional(inputs.entryPrice, inputs.quantity, inputs.assetType);
  if (!notional || notional <= 0) return 0;
  const days = computeDaysBetween(inputs.openedAt, inputs.closedAt);
  if (!days || days <= 0) return 0;
  const fee = (notional * rate * days) / (100 * DAYS_IN_YEAR);
  return Number.isFinite(fee) ? Number(fee.toFixed(2)) : 0;
};

/**
 * The part of a trade's margin fee accrued in the month it closes, matching the API's summary buckets.
 * Earlier months' share is rounded on its own and subtracted, so both parts add up to the margin fee.
 */
export const computeClosingMonthMarginFee = (inputs: MarginFeeInputs) => {
  const totalMarginFee = computeMarginFee(inputs);
  const openedAt = toUtcMidnight(inputs.openedAt);
  const closedAt = toUtcMidnight(inputs.closedAt);
  if (totalMarginFee <= 0 || openedAt === null || closedAt === null) return totalMarginFee;
  const closedAtDate = new Date(closedAt);
  const closingMonthStart = Date.UTC(closedAtDate.getUTCFullYear(), closedAtDate.getUTCMonth(), 1);
  if (openedAt >= closingMonthStart) return totalMarginFee;
  const daysHeld = (closedAt - openedAt) / MS_PER_DAY;
  const daysBeforeClosingMonth = (closingMonthStart - openedAt) / MS_PER_DAY;
  const chargedBeforeClosingMonth = Number(((totalMarginFee * daysBeforeClosingMonth) / daysHeld).toFixed(2));
  return Number((totalMarginFee - chargedBeforeClosingMonth).toFixed(2));
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
