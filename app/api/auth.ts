import { clearCsrfToken, request } from "./client";
import type { UserProfile } from "./types";

export async function loginWithGoogleCredential(credential: string) {
  return request<UserProfile>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ credential }),
    skipAuthHeader: true,
  });
}

export async function logoutSession() {
  try {
    return await request<void>("/auth/logout", {
      method: "POST",
      skipAuthHeader: true,
    });
  } finally {
    clearCsrfToken();
  }
}
