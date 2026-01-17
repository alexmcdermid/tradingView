import { request } from "./client";
import type { AdminUser, UserPreferences, UserProfile } from "./types";

export async function fetchUsers() {
  return request<AdminUser[]>("/admin/users");
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
