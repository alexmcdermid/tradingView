export type AssetType = "STOCK" | "OPTION";
export type Currency = "USD" | "CAD";

export type TradeDirection = "LONG" | "SHORT";

export type OptionType = "CALL" | "PUT";
export type TradeHistoryAction = "CREATE" | "EDIT" | "DELETE";
export type ThemeMode = "LIGHT" | "DARK";
export type PnlDisplayMode = "PNL" | "PERCENT";
export type TradeSortField =
  | "SYMBOL"
  | "ASSET_TYPE"
  | "CURRENCY"
  | "DIRECTION"
  | "QUANTITY"
  | "ENTRY_PRICE"
  | "EXIT_PRICE"
  | "REALIZED_PNL"
  | "FEES"
  | "MARGIN_RATE"
  | "OPTION_TYPE"
  | "STRIKE_PRICE"
  | "EXPIRY_DATE"
  | "OPENED_AT"
  | "CLOSED_AT"
  | "ACCOUNT_ID"
  | "NOTES"
  | "CREATED_AT"
  | "UPDATED_AT";
export type TradeSortDirection = "ASC" | "DESC";

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
  accountId?: string | null;
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
  accountId?: string;
  optionType?: OptionType;
  strikePrice?: number;
  expiryDate?: string;
  openedAt: string;
  closedAt: string;
  notes?: string;
}

export interface TradeHistory {
  id: string;
  tradeId: string;
  action: TradeHistoryAction;
  userId: string;
  symbol: string;
  currency: Currency;
  assetType: AssetType;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  marginRate: number;
  accountId?: string | null;
  optionType?: OptionType | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  openedAt: string;
  closedAt: string;
  realizedPnl: number;
  notes?: string | null;
  tradeCreatedAt: string;
  tradeUpdatedAt: string;
  actionAt: string;
}

export interface PnlBucket {
  period: string;
  pnl: number;
  trades: number;
  pnlPercent?: number | null;
  marginFee?: number | null;
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
  day?: string | null;
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

export type DashboardWidgetId =
  | "TOTAL_REALIZED"
  | "BEST_MONTH"
  | "BEST_DAY"
  | "DAILY_AVG_YTD"
  | "TAX_OWED";

export interface UserPreferences {
  themeMode?: ThemeMode | null;
  pnlDisplayMode?: PnlDisplayMode | null;
  defaultTradeSortBy?: TradeSortField | null;
  defaultTradeSortDirection?: TradeSortDirection | null;
  showTradeHistory?: boolean | null;
  dashboardWidgets?: DashboardWidgetId[] | null;
  taxCapitalGainsRate?: number | null;
  taxPersonalRate?: number | null;
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
  defaultTradeSortBy?: TradeSortField | null;
  defaultTradeSortDirection?: TradeSortDirection | null;
  showTradeHistory?: boolean | null;
  dashboardWidgets?: DashboardWidgetId[] | null;
  taxCapitalGainsRate?: number | null;
  taxPersonalRate?: number | null;
}

export interface TradingAccount {
  id: string;
  name: string;
  defaultStockFees: number;
  defaultOptionFees: number;
  defaultMarginRateUsd: number;
  defaultMarginRateCad: number;
  createdAt: string;
  updatedAt: string;
}

export interface TradingAccountPayload {
  name: string;
  defaultStockFees: number;
  defaultOptionFees: number;
  defaultMarginRateUsd: number;
  defaultMarginRateCad: number;
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
