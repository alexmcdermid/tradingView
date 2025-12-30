export type AssetType = "STOCK" | "OPTION";
export type Currency = "USD" | "CAD";

export type TradeDirection = "LONG" | "SHORT";

export type OptionType = "CALL" | "PUT";

export interface Trade {
  id: string;
  symbol: string;
  currency: Currency;
  assetType: AssetType;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  optionType?: OptionType | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  openedAt: string;
  closedAt: string;
  realizedPnl: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradePayload {
  symbol: string;
  currency: Currency;
  assetType: AssetType;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fees?: number;
  optionType?: OptionType;
  strikePrice?: number;
  expiryDate?: string;
  openedAt: string;
  closedAt: string;
  notes?: string;
}

export interface PnlBucket {
  period: string;
  pnl: number;
  trades: number;
}

export interface PnlSummary {
  totalPnl: number;
  tradeCount: number;
  daily: PnlBucket[];
  monthly: PnlBucket[];
  cadToUsdRate?: number;
  fxDate?: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AdminUser {
  id: string;
  authId: string;
  email?: string | null;
  premium: boolean;
  createdAt: string;
  updatedAt: string;
}
