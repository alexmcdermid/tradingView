const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const readEnv = (key: string) => {
  const importMetaEnv = import.meta.env as Record<string, string | undefined>;
  const fromVite = importMetaEnv[key];
  if (fromVite) {
    return fromVite;
  }
  if (typeof process !== "undefined") {
    return process.env[key];
  }
  return undefined;
};

const normalizeOrigin = (value?: string) => {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "";
  }
};

const splitCsv = (value?: string) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const hostFromValue = (value: string) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
};

export function getPublicOrigin(request?: Request) {
  const configured = normalizeOrigin(readEnv("PUBLIC_ORIGIN") || readEnv("VITE_PUBLIC_ORIGIN"));
  if (configured) {
    return configured;
  }

  if (!request) {
    return "";
  }

  const url = new URL(request.url);
  return LOCAL_HOSTS.has(url.hostname.toLowerCase()) ? url.origin : "";
}

export function getAllowedHosts() {
  const hosts = new Set<string>();
  const publicOrigin = getPublicOrigin();
  if (publicOrigin) {
    hosts.add(new URL(publicOrigin).host.toLowerCase());
  }

  splitCsv(readEnv("PUBLIC_HOST_ALLOWLIST") || readEnv("VITE_PUBLIC_HOST_ALLOWLIST"))
    .map(hostFromValue)
    .forEach((host) => hosts.add(host));

  if (!publicOrigin || import.meta.env.DEV) {
    LOCAL_HOSTS.forEach((host) => hosts.add(host));
    hosts.add("localhost:5173");
    hosts.add("127.0.0.1:5173");
  }

  return hosts;
}

export function validateRequestHost(request: Request) {
  const requestHost = new URL(request.url).host.toLowerCase();
  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.has(requestHost)) {
    throw new Response("Invalid host", { status: 400 });
  }
}

const apiOrigin = () => {
  const apiBase = readEnv("VITE_API_BASE_URL");
  return normalizeOrigin(apiBase);
};

export function securityHeaders(): HeadersInit {
  const connectSources = new Set([
    "'self'",
    "https://accounts.google.com",
    "https://*.googleapis.com",
  ]);
  const api = apiOrigin();
  if (api) {
    connectSources.add(api);
  }
  if (import.meta.env.DEV) {
    connectSources.add("http://localhost:*");
    connectSources.add("http://127.0.0.1:*");
    connectSources.add("ws://localhost:*");
    connectSources.add("ws://127.0.0.1:*");
  }

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    "frame-src https://accounts.google.com",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
}
