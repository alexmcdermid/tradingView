import { createTheme, type PaletteMode } from "@mui/material";

// The app's MUI theme for a colour mode. Shared so UI rendered outside the app's ThemeProvider
// (the legal agreement dialog, which sits above it in AuthProvider) still matches the page.
export function createAppTheme(mode: PaletteMode) {
  return createTheme({
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
  });
}
