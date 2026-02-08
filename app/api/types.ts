export type AssetType = "STOCK" | "OPTION";
export type Currency = "USD" | "CAD";

export type TradeDirection = "LONG" | "SHORT";

export type OptionType = "CALL" | "PUT";
export type ThemeMode = "LIGHT" | "DARK";
export type PnlDisplayMode = "PNL" | "PERCENT";

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
  marginRate?: number | null;
  optionType?: OptionType | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  openedAt: string;
  closedAt: string;
  realizedPnl: number;
  pnlPercent?: number | null;
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
  marginRate?: number;
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
  pnlPercent?: number | null;
}

export interface PnlSummary {
  totalPnl: number;
  tradeCount: number;
  daily: PnlBucket[];
  monthly: PnlBucket[];
  pnlPercent?: number;
  cadToUsdRate?: number;
  fxDate?: string;
}

export interface AggregateStats {
  totalPnl: number;
  tradeCount: number;
  bestDay: PnlBucket | null;
  bestMonth: PnlBucket | null;
  pnlPercent?: number;
  cadToUsdRate?: number;
  fxDate?: string;
  year?: number | null;
  month?: string | null;
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

export interface UserPreferences {
  themeMode?: ThemeMode | null;
  pnlDisplayMode?: PnlDisplayMode | null;
}

export interface UserProfile {
  id: string;
  authId: string;
  email?: string | null;
  premium: boolean;
  createdAt: string;
  updatedAt: string;
  themeMode?: ThemeMode | null;
  pnlDisplayMode?: PnlDisplayMode | null;
}

export type ShareType = "SUMMARY" | "TRADES";

export interface CreateShareLinkRequest {
  shareType: ShareType;
  data: string;
  requiresAuth: boolean;
  expiryDays: number;
}

export interface ShareLinkResponse {
  code: string;
  shareType: ShareType;
  data: string;
  requiresAuth: boolean;
  expiresAt: string;
  accessCount: number;
  createdAt: string;
}
