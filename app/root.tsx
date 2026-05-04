import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  type PaletteMode,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import { AuthWrapper, useAuth } from "./auth/AuthProvider";
import { ColorModeContext } from "./theme/colorMode";
import type { ThemeMode } from "./api/types";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0c" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f7fb" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthWrapper>
      <AppProviders />
    </AuthWrapper>
  );
}

const THEME_STORAGE_KEY = "tv-theme-mode";

function readStoredThemeMode(): PaletteMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function AppProviders() {
  const { user, token, preferences } = useAuth();
  const [mode, setMode] = useState<PaletteMode>(() => {
    return readStoredThemeMode() ?? "light";
  });

  const mapThemeMode = useCallback((themeMode?: ThemeMode | null): PaletteMode => {
    return themeMode === "DARK" ? "dark" : "light";
  }, []);

  useEffect(() => {
    if (user && token && preferences?.themeMode) {
      setMode(mapThemeMode(preferences.themeMode));
      return;
    }
    const stored = readStoredThemeMode();
    if (stored) {
      setMode(stored);
    }
  }, [mapThemeMode, preferences?.themeMode, token, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors (e.g. disabled storage).
    }
  }, [mode]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === "dark" ? "#d4d4d8" : "#0f4d92" },
          secondary: { main: mode === "dark" ? "#f59e0b" : "#ff7043" },
          background:
            mode === "dark"
              ? { default: "#0b0b0c", paper: "#151515" }
              : { default: "#f4f7fb" },
        },
        shape: { borderRadius: 10 },
        typography: { fontFamily: "Inter, system-ui, -apple-system, sans-serif" },
      }),
    [mode]
  );

  const colorMode = useMemo(
    () => ({
      mode,
      setMode: (next: PaletteMode) => {
        setMode(next);
      },
      toggleMode: () => {
        const next = mode === "light" ? "dark" : "light";
        setMode(next);
      },
    }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <Outlet />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
