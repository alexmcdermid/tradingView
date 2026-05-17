import { describe, expect, it, vi, beforeEach } from "vitest";
import { loader, meta } from "../routes/share";
import * as sharesApi from "../api/shares";
import type { PnlSummary, ShareLinkResponse } from "../api/types";
import { buildSharePayload } from "../utils/shareLink";

vi.mock("../api/shares");

const mockGetShareLink = vi.mocked(sharesApi.getShareLink);

describe("share route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads share data from API when code param is provided", async () => {
    const mockShareData: ShareLinkResponse = {
      code: "abc12345",
      shareType: "SUMMARY",
      data: JSON.stringify({
        month: 1,
        year: 2024,
        income: 5000,
        biggestWin: 1000,
        biggestLoss: -500,
        avgWin: 300,
        avgLoss: -150,
        winRate: 65,
      }),
      requiresAuth: false,
      expiresAt: "2026-01-14T00:00:00Z",
      accessCount: 1,
      createdAt: "2026-01-07T00:00:00Z",
    };

    mockGetShareLink.mockResolvedValueOnce(mockShareData);

    const request = new Request("http://localhost/share/abc12345");
    const result = await loader({ request, params: { code: "abc12345" }, context: {}, unstable_pattern: "/share/:code" } as any);

    expect(mockGetShareLink).toHaveBeenCalledWith("abc12345");
    expect(result.error).toBeNull();
    expect(result.shareData).toEqual({
      month: 1,
      year: 2024,
      income: 5000,
      biggestWin: 1000,
      biggestLoss: -500,
      avgWin: 300,
      avgLoss: -150,
      winRate: 65,
    });
  });

  it("uses the short share code for generated preview image metadata", () => {
    const summary: PnlSummary = {
      totalPnl: 1250,
      tradeCount: 3,
      daily: [{ period: "2024-06-12", pnl: 1250, trades: 3 }],
      monthly: [{ period: "2024-06", pnl: 1250, trades: 3 }],
    };
    const shareData = buildSharePayload("2024-06", summary, {
      origin: "https://stale-origin.example",
      generatedAt: "2024-06-12T00:00:00Z",
    });

    const descriptors = meta({
      location: { search: "" },
      data: {
        shareData,
        error: null,
        publicOrigin: "https://example.com",
        shareCode: "abc12345",
      },
    } as any);

    expect(descriptors).toContainEqual({
      property: "og:image",
      content: "https://example.com/share-image/abc12345",
    });
  });

  it("uses configured public origin for App Runner preview image metadata", async () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://dev.example.com");
    const summary: PnlSummary = {
      totalPnl: 1250,
      tradeCount: 3,
      daily: [{ period: "2024-06-12", pnl: 1250, trades: 3 }],
      monthly: [{ period: "2024-06", pnl: 1250, trades: 3 }],
    };
    const shareData = buildSharePayload("2024-06", summary, {
      origin: "http://internal-service",
      generatedAt: "2024-06-12T00:00:00Z",
    });
    mockGetShareLink.mockResolvedValueOnce({
      code: "abc12345",
      shareType: "SUMMARY",
      data: JSON.stringify(shareData),
      requiresAuth: false,
      expiresAt: "2026-01-14T00:00:00Z",
      accessCount: 1,
      createdAt: "2026-01-07T00:00:00Z",
    });

    const request = new Request("https://dev.example.com/share/abc12345");
    const data = await loader({
      request,
      params: { code: "abc12345" },
      context: {},
      unstable_pattern: "/share/:code",
    } as any);
    const descriptors = meta({
      location: { search: "" },
      data,
    } as any);

    expect(descriptors).toContainEqual({
      property: "og:image",
      content: "https://dev.example.com/share-image/abc12345",
    });
  });

  it("rejects unallowlisted hosts", async () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://dev.example.com");

    const request = new Request("https://attacker.example/share/abc12345");

    await expect(
      loader({
        request,
        params: { code: "abc12345" },
        context: {},
        unstable_pattern: "/share/:code",
      } as any)
    ).rejects.toMatchObject({ status: 400 });

    expect(mockGetShareLink).not.toHaveBeenCalled();
  });

  it("returns error when share link not found", async () => {
    mockGetShareLink.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/share/notfound");
    const result = await loader({ request, params: { code: "notfound" }, context: {}, unstable_pattern: "/share/:code" } as any);

    expect(result.shareData).toBeNull();
    expect(result.error).toBe("Share link not found or expired");
  });

  it("falls back to legacy base64 query param when no code param", async () => {
    // Use the actual compact format that encodeShareToken produces
    const compactToken = {
      m: "2024-01",
      g: "2024-01-15T00:00:00Z",
      s: [5000, 10, [[15, 500, 2]]] as [number, number, [number, number, number][]],
    };

    const base64Data = btoa(JSON.stringify(compactToken));
    const request = new Request(`http://localhost/share?data=${encodeURIComponent(base64Data)}`);

    const result = await loader({ request, params: {}, context: {}, unstable_pattern: "/share" } as any);

    expect(mockGetShareLink).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.shareData).toMatchObject({
      month: "2024-01",
      summary: {
        totalPnl: 5000,
        tradeCount: 10,
      },
      generatedAt: "2024-01-15T00:00:00Z",
    });
  });

  it("handles trades share type from API", async () => {
    const mockShareData: ShareLinkResponse = {
      code: "xyz98765",
      shareType: "TRADES",
      data: JSON.stringify([
        {
          id: "1",
          date: "2024-01-15",
          symbol: "AAPL",
          quantity: 100,
          price: 150.5,
          side: "BUY",
        },
      ]),
      requiresAuth: true,
      expiresAt: "2026-01-14T00:00:00Z",
      accessCount: 2,
      createdAt: "2026-01-07T00:00:00Z",
    };

    mockGetShareLink.mockResolvedValueOnce(mockShareData);

    const request = new Request("http://localhost/share/xyz98765");
    const result = await loader({ request, params: { code: "xyz98765" }, context: {}, unstable_pattern: "/share/:code" } as any);

    expect(result.error).toBeNull();
    expect(result.shareData).toEqual([
      {
        id: "1",
        date: "2024-01-15",
        symbol: "AAPL",
        quantity: 100,
        price: 150.5,
        side: "BUY",
      },
    ]);
  });

  it("returns error on invalid JSON data from API", async () => {
    const mockShareData: ShareLinkResponse = {
      code: "invalid",
      shareType: "SUMMARY",
      data: "not valid json{",
      requiresAuth: false,
      expiresAt: "2026-01-14T00:00:00Z",
      accessCount: 0,
      createdAt: "2026-01-07T00:00:00Z",
    };

    mockGetShareLink.mockResolvedValueOnce(mockShareData);

    const request = new Request("http://localhost/share/invalid");
    const result = await loader({ request, params: { code: "invalid" }, context: {}, unstable_pattern: "/share/:code" } as any);

    expect(result.shareData).toBeNull();
    expect(result.error).toBe("Failed to load share link");
  });
});
