import { describe, expect, it } from "vitest";
import { shouldSendHeaderAuth } from "../api/client";

describe("API client auth headers", () => {
  it("does not send header auth outside dev even when no token exists", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: false,
        useHeaderAuth: false,
      })
    ).toBe(false);
  });

  it("allows header auth in dev when explicitly enabled", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: true,
      })
    ).toBe(true);
  });

  it("does not send the dev header unless explicitly enabled", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: false,
      })
    ).toBe(false);
  });

  it("honors skipAuthHeader", () => {
    expect(
      shouldSendHeaderAuth({
        isDev: true,
        useHeaderAuth: true,
        skipAuthHeader: true,
      })
    ).toBe(false);
  });
});
