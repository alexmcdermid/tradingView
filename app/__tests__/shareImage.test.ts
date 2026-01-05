import { describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import type { PnlSummary, Trade } from "../api/types";
import {
  buildSharePayload,
  buildTradesSharePayload,
  encodeShareToken,
} from "../utils/shareLink";

const buildLoaderArgs = (request: Request): LoaderFunctionArgs => ({
  request,
  params: {},
  context: {},
  unstable_pattern: "",
});

const loadShareImageLoader = async () => {
  const module = await import("../routes/share-image");
  return module.loader;
};

const runShareImageLoader = async (request: Request) => {
  const shareImageLoader = await loadShareImageLoader();
  const response = await shareImageLoader(buildLoaderArgs(request));
  return response as Response;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const expectPngResponse = async (response: Response) => {
  expect(response.headers.get("Content-Type")).toBe("image/png");
  const buffer = new Uint8Array(await response.arrayBuffer());
  expect(buffer.length).toBeGreaterThan(PNG_SIGNATURE.length);
  expect(Array.from(buffer.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);
};

describe("share image loader", () => {
  it("returns a png for monthly shares", async () => {
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

    const response = await runShareImageLoader(request);

    expect(response.status).toBe(200);
    await expectPngResponse(response);
  });

  it("returns a png for daily shares", async () => {
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

    const response = await runShareImageLoader(request);

    expect(response.status).toBe(200);
    await expectPngResponse(response);
  });

  it("returns 400 for missing or invalid data", async () => {
    const missingRequest = new Request("https://example.com/share-image");
    const missingResponse = await runShareImageLoader(missingRequest);
    expect(missingResponse.status).toBe(400);

    const invalidRequest = new Request("https://example.com/share-image?data=invalid");
    const invalidResponse = await runShareImageLoader(invalidRequest);
    expect(invalidResponse.status).toBe(400);
  });

  it("renders even if font files are unavailable", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        default: actual,
        existsSync: () => false,
      };
    });

    const summary: PnlSummary = {
      totalPnl: 12.34,
      tradeCount: 1,
      daily: [{ period: "2024-04-01", pnl: 12.34, trades: 1 }],
      monthly: [{ period: "2024-04", pnl: 12.34, trades: 1 }],
    };
    const payload = buildSharePayload("2024-04", summary, {
      env: "dev",
      origin: "https://example.com",
      generatedAt: "2024-04-01T00:00:00Z",
    });
    const token = encodeShareToken(payload);
    const request = new Request(`https://example.com/share-image?data=${token}`);

    const loader = await loadShareImageLoader();
    const response = (await loader(buildLoaderArgs(request))) as Response;

    expect(response.status).toBe(200);
    await expectPngResponse(response);

    vi.doUnmock("node:fs");
    vi.resetModules();
  });
});
