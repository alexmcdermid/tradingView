// @ts-nocheck
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import type { PluginOption } from "vite";

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || !!process.env.VITEST;
  const plugins: PluginOption[] = [tsconfigPaths()];

  if (!isTest) {
    plugins.unshift(reactRouter());
    plugins.unshift(tailwindcss());
  }

  return {
    plugins,
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
      watch: false,
      pool: "forks",
      maxThreads: 1,
      forceExit: true,
    },
    server: isTest
      ? {
          watch: {
            usePolling: true,
            interval: 1000,
          },
        }
      : undefined,
  };
});
