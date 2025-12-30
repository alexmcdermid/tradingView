import { getAuthToken } from "../auth/authToken";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const DEFAULT_USER_ID = import.meta.env.VITE_USER_ID || "demo-user";
const USE_HEADER_AUTH = import.meta.env.VITE_USE_HEADER_AUTH === "true";

type RequestOptions = RequestInit & { skipAuthHeader?: boolean };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // In local/dev we can force header-based auth even when a token exists
  if (!options.skipAuthHeader && (USE_HEADER_AUTH || !token)) {
    headers.set("X-User-Id", DEFAULT_USER_ID);
  }

  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const message = await safeParseError(response);
    throw new ApiError(
      message || `Request failed with status ${response.status}`,
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function safeParseError(response: Response) {
  try {
    const data = await response.json();
    if (data && typeof data === "object" && "message" in data) {
      return (data as { message?: string }).message;
    }
  } catch {
    // ignore parse errors
  }
  return response.statusText;
}
