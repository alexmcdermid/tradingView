import { request } from "./client";
import type { PnlSummary, Trade, TradePayload } from "./types";

export async function fetchTrades() {
  return request<Trade[]>("/trades");
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

export async function fetchSummary() {
  return request<PnlSummary>("/trades/summary");
}
