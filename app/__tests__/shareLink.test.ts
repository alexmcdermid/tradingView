import { describe, expect, it } from "vitest";
import type { PnlSummary } from "../api/types";
import { buildSharePayload, decodeShareToken, encodeShareToken } from "../utils/shareLink";

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
});
