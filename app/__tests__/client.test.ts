import { describe, expect, it } from "vitest";
import { shouldSendHeaderAuth } from "../api/client";

describe("API client auth headers", () => {
  it("does not send header auth outside dev even when no token exists", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: false,
        useHeaderAuth: false,
        token: null,
      })
    ).toBe(false);
  });

  it("allows header auth in dev when explicitly enabled", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: true,
        token: "token",
      })
    ).toBe(true);
  });

  it("keeps the dev fallback when no bearer token exists", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: false,
        token: null,
      })
    ).toBe(true);
  });

  it("honors skipAuthHeader", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: true,
        token: null,
        skipAuthHeader: true,
      })
    ).toBe(false);
  });
});
