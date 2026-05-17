const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const DEFAULT_USER_ID = import.meta.env.VITE_USER_ID || "demo-user";
const USE_HEADER_AUTH = import.meta.env.VITE_USE_HEADER_AUTH === "true";
const IS_DEV = import.meta.env.DEV;

type CsrfToken = {
  headerName: string;
  token: string;
};

let csrfToken: CsrfToken | null = null;

export function clearCsrfToken() {
  csrfToken = null;
}

type RequestOptions = RequestInit & { skipAuthHeader?: boolean };

type HeaderAuthOptions = {
  isDev: boolean;
  useHeaderAuth: boolean;
  skipAuthHeader?: boolean;
};

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

  if (requiresCsrfToken(options.method)) {
    const token = await getCsrfToken();
    if (token) {
      headers.set(token.headerName, token.token);
    }
  }

  // Header auth is a local/test convenience only. Production uses the session cookie.
  if (
    shouldSendHeaderAuth({
      isDev: IS_DEV,
      useHeaderAuth: USE_HEADER_AUTH,
      skipAuthHeader: options.skipAuthHeader,
    })
  ) {
    headers.set("X-User-Id", DEFAULT_USER_ID);
  }

  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
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

export function shouldSendHeaderAuth({
  isDev,
  useHeaderAuth,
  skipAuthHeader,
}: HeaderAuthOptions) {
  return isDev && !skipAuthHeader && useHeaderAuth;
}

function requiresCsrfToken(method?: string) {
  const normalized = (method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(normalized);
}

async function getCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch(`${DEFAULT_API_BASE_URL}/auth/csrf`, {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  csrfToken = (await response.json()) as CsrfToken;
  return csrfToken;
}

async function safeParseError(response: Response) {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") {
        return data.message;
      }
      if ("detail" in data && typeof data.detail === "string") {
        return data.detail;
      }
      if ("error" in data && typeof data.error === "string") {
        return data.error;
      }
      if ("title" in data && typeof data.title === "string") {
        return data.title;
      }
    }
  } catch {
    // ignore parse errors
  }
  return response.statusText;
}
