import { request } from "./client";
import type {
  AdminUser,
  TradeHistory,
  TradingAccount,
  TradingAccountPayload,
  UserPreferences,
  UserProfile,
} from "./types";

export async function fetchUsers() {
  return request<AdminUser[]>("/admin/users");
}

export async function fetchUserTradeHistory(userId: string) {
  return request<TradeHistory[]>(`/admin/users/${userId}/trade-history`);
}

export async function fetchUserProfile() {
  return request<UserProfile>("/users/me");
}

export async function fetchUserPreferences() {
  return request<UserPreferences>("/users/me/preferences");
}

export async function updateUserPreferences(preferences: UserPreferences) {
  return request<UserPreferences>("/users/me/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
}

export async function listUserAccounts() {
  return request<TradingAccount[]>("/users/me/accounts");
}

export async function createUserAccount(payload: TradingAccountPayload) {
  return request<TradingAccount>("/users/me/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUserAccount(accountId: string, payload: TradingAccountPayload) {
  return request<TradingAccount>(`/users/me/accounts/${accountId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteUserAccount(accountId: string) {
  return request<void>(`/users/me/accounts/${accountId}`, {
    method: "DELETE",
  });
}
