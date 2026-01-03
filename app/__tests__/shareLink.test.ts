import { describe, expect, it } from "vitest";
import type { PnlSummary, Trade } from "../api/types";
import {
  buildSharePayload,
  buildTradesSharePayload,
  decodeShareToken,
  encodeShareToken,
  SHARE_QUERY_PARAM,
} from "../utils/shareLink";

const pad2 = (value: number) => String(value).padStart(2, "0");

describe("share link helpers", () => {
  const summary: PnlSummary = {
    totalPnl: 300,
    tradeCount: 3,
    daily: [
      { period: "2024-01-15", pnl: 100, trades: 1 },
      { period: "2024-02-02", pnl: 200, trades: 2 },
    ],
    monthly: [
      { period: "2024-01", pnl: 100, trades: 1 },
      { period: "2024-02", pnl: 200, trades: 2 },
    ],
    cadToUsdRate: 0.75,
    fxDate: "2024-02-01",
  };

  it("encodes and decodes a filtered payload", () => {
    const payload = buildSharePayload("2024-02", summary, {
      env: "dev",
      origin: "http://localhost:5173",
      generatedAt: "2024-02-10T00:00:00Z",
    });
    const token = encodeShareToken(payload);
    const decoded = decodeShareToken(token);

    if (!decoded || !("summary" in decoded)) {
      throw new Error("Expected a summary payload.");
    }
    expect(decoded?.month).toBe("2024-02");
    expect(decoded?.env).toBe("dev");
    expect(decoded?.origin).toBe("http://localhost:5173");
    expect(decoded?.generatedAt).toBe("2024-02-10T00:00:00Z");
    expect(decoded?.summary.daily).toEqual([{ period: "2024-02-02", pnl: 200, trades: 2 }]);
    expect(decoded?.summary.monthly).toEqual([{ period: "2024-02", pnl: 200, trades: 2 }]);
  });

  it("returns null for invalid tokens", () => {
    expect(decodeShareToken("not-base64")).toBeNull();
    expect(decodeShareToken("")).toBeNull();
  });

  it("keeps large share links under iMessage limits", () => {
    const MAX_IMESSAGE_URL_LENGTH = 2000;
    const daily = Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      const trades = 12 + (day % 7);
      const pnl = Number(((day % 2 === 0 ? 18.42 : -9.17) + day * 0.3).toFixed(2));
      return { period: `2024-03-${pad2(day)}`, pnl, trades };
    });
    const tradeCount = daily.reduce((sum, bucket) => sum + bucket.trades, 0);
    const totalPnl = Number(daily.reduce((sum, bucket) => sum + bucket.pnl, 0).toFixed(2));
    const largeSummary: PnlSummary = {
      totalPnl,
      tradeCount,
      daily,
      monthly: [{ period: "2024-03", pnl: totalPnl, trades: tradeCount }],
      cadToUsdRate: 0.73,
      fxDate: "2024-03-31",
    };

    const payload = buildSharePayload("2024-03", largeSummary, {
      env: "dev",
      origin: "https://example.com",
      generatedAt: "2024-03-31T23:59:59Z",
    });
    const token = encodeShareToken(payload);
    const shareUrl = new URL("https://example.com/share");
    shareUrl.searchParams.set(SHARE_QUERY_PARAM, token);

    expect(tradeCount).toBeGreaterThanOrEqual(300);
    expect(shareUrl.toString().length).toBeLessThanOrEqual(MAX_IMESSAGE_URL_LENGTH);
  });

  it("encodes and decodes shared trades", () => {
    const trades: Trade[] = [
      {
        id: "trade-1",
        symbol: "AAPL",
        currency: "USD",
        assetType: "STOCK",
        direction: "LONG",
        quantity: 10,
        entryPrice: 120,
        exitPrice: 130,
        fees: 1,
        optionType: null,
        strikePrice: null,
        expiryDate: null,
        openedAt: "2024-02-10",
        closedAt: "2024-02-10",
        realizedPnl: 90,
        notes: "Morning breakout",
        createdAt: "2024-02-10T00:00:00Z",
        updatedAt: "2024-02-10T00:00:00Z",
      },
      {
        id: "trade-2",
        symbol: "SHOP",
        currency: "CAD",
        assetType: "STOCK",
        direction: "SHORT",
        quantity: 5,
        entryPrice: 75,
        exitPrice: 70,
        fees: 2,
        optionType: null,
        strikePrice: null,
        expiryDate: null,
        openedAt: "2024-02-10",
        closedAt: "2024-02-10",
        realizedPnl: 23.5,
        notes: null,
        createdAt: "2024-02-10T00:00:00Z",
        updatedAt: "2024-02-10T00:00:00Z",
      },
      {
        id: "trade-3",
        symbol: "MSFT",
        currency: "USD",
        assetType: "STOCK",
        direction: "LONG",
        quantity: 2,
        entryPrice: 300,
        exitPrice: 310,
        fees: 1,
        optionType: null,
        strikePrice: null,
        expiryDate: null,
        openedAt: "2024-02-11",
        closedAt: "2024-02-11",
        realizedPnl: 19,
        notes: null,
        createdAt: "2024-02-11T00:00:00Z",
        updatedAt: "2024-02-11T00:00:00Z",
      },
    ];

    const payload = buildTradesSharePayload("2024-02-10", trades, {
      env: "dev",
      origin: "http://localhost:5173",
      generatedAt: "2024-02-10T12:00:00Z",
      cadToUsdRate: 0.75,
      fxDate: "2024-02-10",
    });
    const token = encodeShareToken(payload);
    const decoded = decodeShareToken(token);

    if (!decoded || !("trades" in decoded)) {
      throw new Error("Expected a trades payload.");
    }

    expect(decoded.date).toBe("2024-02-10");
    expect(decoded.trades).toHaveLength(2);
    expect(decoded.trades[0].symbol).toBe("AAPL");
    expect(decoded.cadToUsdRate).toBe(0.75);
    expect(decoded.fxDate).toBe("2024-02-10");
    expect(decoded.totalPnl).toBeCloseTo(107.63, 2);
  });
});
