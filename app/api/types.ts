export type AssetType = "STOCK" | "OPTION";

export type TradeDirection = "LONG" | "SHORT";

export type OptionType = "CALL" | "PUT";

export interface Trade {
  id: string;
  symbol: string;
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
}
