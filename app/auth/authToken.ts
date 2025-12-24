const STORAGE_KEY = "auth_id_token";

export function setAuthToken(token: string | null) {
  if (!token) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearAuthToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}
