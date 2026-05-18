import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken, request, shouldSendHeaderAuth } from "../api/client";

beforeEach(() => {
  clearCsrfToken();
  vi.restoreAllMocks();
});

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

  it("shares one in-flight CSRF request across concurrent unsafe calls", async () => {
    let csrfCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/csrf")) {
        csrfCalls += 1;
        return new Response(JSON.stringify({ headerName: "X-XSRF-TOKEN", token: "csrf-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ csrf: headers.get("X-XSRF-TOKEN") }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const [first, second] = await Promise.all([
      request<{ csrf: string | null }>("/trades", { method: "POST", body: "{}" }),
      request<{ csrf: string | null }>("/shares", { method: "POST", body: "{}" }),
    ]);

    expect(csrfCalls).toBe(1);
    expect(first.csrf).toBe("csrf-token");
    expect(second.csrf).toBe("csrf-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
