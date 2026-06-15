import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import {
  Box,
  Container,
  CssBaseline,
  Link as MuiLink,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
  type PaletteMode,
} from "@mui/material";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { AuthWrapper, useAuth } from "./auth/AuthProvider";
import { securityHeaders, validateRequestHost } from "./config/security";
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

export function loader({ request }: Route.LoaderArgs) {
  validateRequestHost(request);
  return null;
}

export function headers() {
  return securityHeaders();
}

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
  const location = useLocation();
  const isLegalReviewPath = isLegalDocumentPath(location.pathname);
  const disableLoginPrompts = isPublicSharePath(location.pathname) || isLegalReviewPath;

  return (
    <AuthWrapper
      disableLoginPrompts={disableLoginPrompts}
      suppressLegalAgreementDialog={isLegalReviewPath}
    >
      <AppProviders />
    </AuthWrapper>
  );
}

const THEME_STORAGE_KEY = "tv-theme-mode";
const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function isPublicSharePath(pathname: string) {
  return (
    pathname === "/share" ||
    pathname.startsWith("/share/") ||
    pathname === "/share-image" ||
    pathname.startsWith("/share-image/")
  );
}

export function isLegalDocumentPath(pathname: string) {
  return pathname === "/privacy-policy" || pathname === "/terms-of-service";
}

function readStoredThemeMode(): PaletteMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredThemeMode(mode: PaletteMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors (e.g. disabled storage).
  }
}

function AppProviders() {
  const { user, token, preferences } = useAuth();
  const [mode, setModeState] = useState<PaletteMode>("light");

  const mapThemeMode = useCallback((themeMode?: ThemeMode | null): PaletteMode => {
    return themeMode === "DARK" ? "dark" : "light";
  }, []);

  const setMode = useCallback((next: PaletteMode) => {
    setModeState(next);
    writeStoredThemeMode(next);
  }, []);

  useBrowserLayoutEffect(() => {
    const stored = readStoredThemeMode();
    if (stored) {
      setModeState(stored);
    }
  }, []);

  useEffect(() => {
    if (user && token && preferences?.themeMode) {
      setMode(mapThemeMode(preferences.themeMode));
      return;
    }
    const stored = readStoredThemeMode();
    if (stored) {
      setModeState(stored);
    }
  }, [mapThemeMode, preferences?.themeMode, setMode, token, user]);

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
        <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
          <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
            <Outlet />
          </Box>
          <AppFooter />
        </Box>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={(theme) => ({
        borderTop: 1,
        borderColor:
          theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : theme.palette.divider,
        bgcolor: theme.palette.mode === "dark" ? "#101113" : "#ffffff",
        color: "text.secondary",
        py: 2,
      })}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="caption" color="text.secondary">
            Copyright © {year} tradelog. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <MuiLink
              component={RouterLink}
              to="/privacy-policy"
              underline="hover"
              color="text.secondary"
              variant="caption"
              sx={{ "&:hover": { color: "text.primary" } }}
            >
              Privacy Policy
            </MuiLink>
            <Typography variant="caption" color="text.secondary" aria-hidden="true">
              |
            </Typography>
            <MuiLink
              component={RouterLink}
              to="/terms-of-service"
              underline="hover"
              color="text.secondary"
              variant="caption"
              sx={{ "&:hover": { color: "text.primary" } }}
            >
              Terms of Service
            </MuiLink>
          </Stack>
        </Stack>
      </Container>
    </Box>
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
