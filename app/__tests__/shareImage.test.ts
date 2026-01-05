import { describe, expect, it } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import type { PnlSummary, Trade } from "../api/types";
import {
  buildSharePayload,
  buildTradesSharePayload,
  encodeShareToken,
} from "../utils/shareLink";
import { loader as shareImageLoader } from "../routes/share-image";

const buildLoaderArgs = (request: Request): LoaderFunctionArgs => ({
  request,
  params: {},
  context: {},
  unstable_pattern: "",
});

describe("share image loader", () => {
  it("returns an svg for monthly shares", async () => {
    const summary: PnlSummary = {
      totalPnl: 321.5,
      tradeCount: 2,
      daily: [{ period: "2024-02-05", pnl: 321.5, trades: 2 }],
      monthly: [{ period: "2024-02", pnl: 321.5, trades: 2 }],
    };
    const payload = buildSharePayload("2024-02", summary, {
      env: "dev",
      origin: "https://example.com",
      generatedAt: "2024-02-10T00:00:00Z",
    });
    const token = encodeShareToken(payload);
    const request = new Request(`https://example.com/share-image?data=${token}`);

    const response = (await shareImageLoader(buildLoaderArgs(request))) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    const svg = await response.text();
    expect(svg).toContain("Monthly P/L");
    expect(svg).toContain("February 2024");
    expect(svg).toContain("+321.50 USD");
  });

  it("returns an svg for daily shares", async () => {
    const trades: Trade[] = [
      {
        id: "trade-1",
        symbol: "AAPL",
        currency: "USD",
        assetType: "STOCK",
        direction: "LONG",
        quantity: 1,
        entryPrice: 100,
        exitPrice: 150,
        fees: 0,
        optionType: null,
        strikePrice: null,
        expiryDate: null,
        openedAt: "2024-03-05",
        closedAt: "2024-03-05",
        realizedPnl: 50,
        notes: null,
        createdAt: "2024-03-05T00:00:00Z",
        updatedAt: "2024-03-05T00:00:00Z",
      },
    ];
    const payload = buildTradesSharePayload("2024-03-05", trades, {
      env: "dev",
      origin: "https://example.com",
      generatedAt: "2024-03-05T12:00:00Z",
    });
    const token = encodeShareToken(payload);
    const request = new Request(`https://example.com/share-image?data=${token}`);

    const response = (await shareImageLoader(buildLoaderArgs(request))) as Response;

    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("Daily P/L");
    expect(svg).toContain("March 5, 2024");
    expect(svg).toContain("+50.00 USD");
    expect(svg).toContain("1 trade");
  });

  it("returns 400 for missing or invalid data", async () => {
    const missingRequest = new Request("https://example.com/share-image");
    const missingResponse = (await shareImageLoader(buildLoaderArgs(missingRequest))) as Response;
    expect(missingResponse.status).toBe(400);

    const invalidRequest = new Request("https://example.com/share-image?data=invalid");
    const invalidResponse = (await shareImageLoader(buildLoaderArgs(invalidRequest))) as Response;
    expect(invalidResponse.status).toBe(400);
  });
});
