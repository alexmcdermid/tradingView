import { request } from "./client";
import type {
  AccountStats,
  InferredAccountTradeCounts,
  PagedResult,
  PnlSummary,
  AggregateStats,
  PositionUpdateSignal,
  Trade,
  TradeCountStats,
  TradeHistory,
  TradePayload,
  TradeSortDirection,
  TradeSortField,
} from "./types";

export async function fetchTrades(
  page = 0,
  size = 50,
  month?: string,
  date?: string,
  sortBy?: TradeSortField,
  sortDirection?: TradeSortDirection
) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (month) {
    params.append("month", month);
  }
  if (date) {
    params.append("date", date);
  }
  if (sortBy) {
    params.append("sortBy", sortBy);
  }
  if (sortDirection) {
    params.append("sortDirection", sortDirection);
  }
  return request<PagedResult<Trade>>(`/trades/paged?${params.toString()}`);
}

export async function createTrade(payload: TradePayload) {
  return request<Trade>("/trades", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTrade(tradeId: string, payload: TradePayload) {
  return request<Trade>(`/trades/${tradeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteTrade(tradeId: string) {
  return request<void>(`/trades/${tradeId}`, {
    method: "DELETE",
  });
}

export async function fetchTradeHistory(tradeId: string) {
  return request<TradeHistory[]>(`/trades/${tradeId}/history`);
}

export async function fetchSummary(month?: string) {
  const search = month ? `?month=${encodeURIComponent(month)}` : "";
  return request<PnlSummary>(`/trades/summary${search}`);
}

export async function fetchAggregateStats(year?: number, month?: string, day?: string) {
  const params = new URLSearchParams();
  if (typeof year === "number") {
    params.append("year", String(year));
  }
  if (month) {
    params.append("month", month);
  }
  if (day) {
    params.append("day", day);
  }
  const search = params.toString();
  return request<AggregateStats>(`/trades/stats/scoped${search ? `?${search}` : ""}`);
}

export async function fetchAccountStats(year?: number) {
  const search = typeof year === "number" ? `?year=${encodeURIComponent(String(year))}` : "";
  return request<AccountStats[]>(`/trades/stats/accounts${search}`);
}

export async function fetchTradeCountStats(year?: number, month?: string, day?: string) {
  const params = new URLSearchParams();
  if (typeof year === "number") {
    params.append("year", String(year));
  }
  if (month) {
    params.append("month", month);
  }
  if (day) {
    params.append("day", day);
  }
  const search = params.toString();
  return request<TradeCountStats>(`/trades/stats/counts${search ? `?${search}` : ""}`);
}

export async function fetchPositionUpdateSignals(limit = 5) {
  return request<PositionUpdateSignal[]>(
    `/trades/history/position-update-signals?limit=${encodeURIComponent(String(limit))}`
  );
}

export async function fetchInferredAccountTradeCounts(year?: number) {
  const search = typeof year === "number" ? `?year=${encodeURIComponent(String(year))}` : "";
  return request<InferredAccountTradeCounts[]>(`/trades/stats/inferred-account-counts${search}`);
}
