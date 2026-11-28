import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../api/client";
import { downloadTaxYearExport } from "../api/reports";

type SentRequest = { url: string; init?: RequestInit };

function mockExportResponse(responseHeaders: Record<string, string>) {
  const sentRequests: SentRequest[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/csrf")) {
      return new Response(JSON.stringify({ headerName: "X-XSRF-TOKEN", token: "csrf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    sentRequests.push({ url, init });
    return new Response("trade_id,description\r\n", {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=UTF-8", ...responseHeaders },
    });
  });
  return sentRequests;
}

describe("downloadTaxYearExport", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it("names the file from the Content-Disposition header the API exposes", async () => {
    const sentRequests = mockExportResponse({
      "Content-Disposition": 'attachment; filename="tradelog-2025-dispositions-server.csv"',
    });

    const download = await downloadTaxYearExport(2025, {
      reportType: "DISPOSITIONS",
      filters: { symbols: ["AAPL"] },
      includeNotes: false,
    });

    expect(download.filename).toBe("tradelog-2025-dispositions-server.csv");
    expect(await download.blob.text()).toBe("trade_id,description\r\n");
    expect(sentRequests).toHaveLength(1);
    const [{ url, init }] = sentRequests;
    expect(url).toMatch(/\/reports\/tax-years\/2025\/exports$/);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Accept")).toBe("text/csv, application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      reportType: "DISPOSITIONS",
      filters: { symbols: ["AAPL"] },
      includeNotes: false,
    });
  });

  it("falls back to the server's naming scheme without the header", async () => {
    mockExportResponse({});

    const download = await downloadTaxYearExport(2024, { reportType: "REPURCHASE_REVIEW" });

    expect(download.filename).toBe("tradelog-2024-repurchase-review.csv");
  });
});
