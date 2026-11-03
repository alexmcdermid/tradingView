import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clearCsrfToken,
  request,
  requestBlob,
  shouldSendHeaderAuth,
} from "../api/client";

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

describe("requestBlob", () => {
  function mockFetch(respond: (init?: RequestInit) => Response) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ headerName: "X-XSRF-TOKEN", token: "csrf-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return respond(init);
    });
  }

  function csvResponse(contentDisposition?: string) {
    const headers = new Headers({ "Content-Type": "text/csv; charset=UTF-8" });
    if (contentDisposition) {
      headers.set("Content-Disposition", contentDisposition);
    }
    return new Response("trade_id,symbol\r\n", { status: 200, headers });
  }

  it("returns the blob with the server filename and sends CSRF on POST", async () => {
    let sentInit: RequestInit | undefined;
    mockFetch((init) => {
      sentInit = init;
      return csvResponse('attachment; filename="tradelog-2025-trade-ledger.csv"');
    });

    const result = await requestBlob("/reports/tax-years/2025/exports", {
      method: "POST",
      body: "{}",
    });

    expect(result.filename).toBe("tradelog-2025-trade-ledger.csv");
    expect(await result.blob.text()).toBe("trade_id,symbol\r\n");
    expect(new Headers(sentInit?.headers).get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(sentInit?.credentials).toBe("include");
  });

  it("prefers and decodes the RFC 5987 filename* parameter", async () => {
    mockFetch(() =>
      csvResponse(
        "attachment; filename=\"ignored.csv\"; filename*=UTF-8''tradelog%2D2025%2Ddispositions.csv"
      )
    );

    const result = await requestBlob("/reports/tax-years/2025/exports");

    expect(result.filename).toBe("tradelog-2025-dispositions.csv");
  });

  it("falls back when the header is missing or unusable", async () => {
    mockFetch(() => csvResponse());
    expect(
      (await requestBlob("/export", { fallbackFilename: "tradelog-2025-annual-summary.csv" }))
        .filename
    ).toBe("tradelog-2025-annual-summary.csv");
    expect((await requestBlob("/export")).filename).toBe("tradelog-export.csv");

    vi.restoreAllMocks();
    mockFetch(() => csvResponse("attachment; filename*=UTF-8''bad%E0%A4%A.csv"));
    expect((await requestBlob("/export")).filename).toBe("tradelog-export.csv");

    vi.restoreAllMocks();
    mockFetch(() => csvResponse('attachment; filename="..."'));
    expect((await requestBlob("/export")).filename).toBe("tradelog-export.csv");
  });

  it("strips path segments and replaces unsafe characters", async () => {
    mockFetch(() =>
      csvResponse('attachment; filename="../../reports/2025 trade ledger?<script>.csv"')
    );

    const result = await requestBlob("/export");

    expect(result.filename).toBe("2025_trade_ledger_script_.csv");
  });

  it("throws ApiError for a JSON error instead of returning the error body", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ status: 403, message: "Tax year pass required for 2025" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
    );

    const download = requestBlob("/reports/tax-years/2025/exports", { method: "POST", body: "{}" });

    await expect(download).rejects.toBeInstanceOf(ApiError);
    await expect(download).rejects.toMatchObject({
      status: 403,
      message: "Tax year pass required for 2025",
    });
  });
});
