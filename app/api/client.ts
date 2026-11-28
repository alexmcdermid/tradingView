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
let csrfTokenPromise: Promise<CsrfToken | null> | null = null;

export function clearCsrfToken() {
  csrfToken = null;
  csrfTokenPromise = null;
}

type RequestOptions = RequestInit & { skipAuthHeader?: boolean };

type BlobRequestOptions = RequestOptions & { fallbackFilename?: string };

export type BlobDownload = {
  blob: Blob;
  filename: string;
};

const DEFAULT_DOWNLOAD_FILENAME = "tradelog-export.csv";
const MAX_DOWNLOAD_FILENAME_LENGTH = 120;

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
  const response = await sendRequest(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Error statuses throw ApiError, so an error body is never handed back as a file.
export async function requestBlob(
  path: string,
  options: BlobRequestOptions = {}
): Promise<BlobDownload> {
  const { fallbackFilename = DEFAULT_DOWNLOAD_FILENAME, ...requestOptions } = options;
  const response = await sendRequest(path, requestOptions);

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(
      response.headers.get("Content-Disposition"),
      fallbackFilename
    ),
  };
}

async function sendRequest(path: string, options: RequestOptions) {
  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    ...options,
    headers: await buildHeaders(options),
    credentials: "include",
  });

  if (!response.ok) {
    const message = await safeParseError(response);
    throw new ApiError(
      message || `Request failed with status ${response.status}`,
      response.status
    );
  }

  return response;
}

async function buildHeaders(options: RequestOptions) {
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

  return headers;
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
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`${DEFAULT_API_BASE_URL}/auth/csrf`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        csrfToken = (await response.json()) as CsrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfTokenPromise = null;
      });
  }
  return csrfTokenPromise;
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

function filenameFromContentDisposition(header: string | null, fallbackFilename: string) {
  if (!header) {
    return fallbackFilename;
  }

  // RFC 6266: the RFC 5987 filename* wins over the plain filename when both are present.
  const encodedValue = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i.exec(header)?.[1];
  const plainMatch = /(?:^|;)\s*filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^";]*))/i.exec(header);
  const plainValue = plainMatch
    ? plainMatch[1]?.replace(/\\(.)/g, "$1") ?? plainMatch[2]
    : undefined;
  const encodedFilename = encodedValue ? decodeRfc5987Value(encodedValue.trim()) : null;
  const candidate = encodedFilename || plainValue?.trim();

  return (candidate && sanitizeDownloadFilename(candidate)) || fallbackFilename;
}

function decodeRfc5987Value(value: string) {
  const match = /^UTF-8'[^']*'(.+)$/i.exec(value);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Keeps only the base name in a conservative ASCII set; anything doubtful falls back.
function sanitizeDownloadFilename(filename: string) {
  const baseName = filename.split(/[\\/]/).pop() ?? "";
  const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  if (!/[A-Za-z0-9]/.test(safeName) || safeName.length > MAX_DOWNLOAD_FILENAME_LENGTH) {
    return null;
  }
  return safeName;
}
