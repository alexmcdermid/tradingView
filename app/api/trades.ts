import { request } from "./client";
import type { PagedResult, PnlSummary, AggregateStats, Trade, TradePayload } from "./types";

export async function fetchTrades(page = 0, size = 50, month?: string) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (month) {
    params.append("month", month);
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

export async function fetchSummary(month?: string) {
  const search = month ? `?month=${encodeURIComponent(month)}` : "";
  return request<PnlSummary>(`/trades/summary${search}`);
}

export async function fetchAggregateStats() {
  return request<AggregateStats>("/trades/stats");
}
