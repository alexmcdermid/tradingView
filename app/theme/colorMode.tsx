import { createContext, useContext } from "react";
import type { PaletteMode } from "@mui/material";

export type ColorModeContextValue = {
  mode: PaletteMode;
  setMode: (mode: PaletteMode) => void;
  toggleMode: () => void;
};

export const ColorModeContext = createContext<ColorModeContextValue | undefined>(
  undefined
);

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error("useColorMode must be used within ColorModeContext");
  }
  return ctx;
}
