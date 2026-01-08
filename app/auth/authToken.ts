const STORAGE_KEY = "auth_id_token";

export function setAuthToken(token: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (!token) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function getAuthToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearAuthToken() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
