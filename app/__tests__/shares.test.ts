import { describe, expect, it, vi, beforeEach } from "vitest";
import { createShareLink, getShareLink, listUserShareLinks, deleteShareLink } from "../api/shares";
import type { ShareLinkResponse } from "../api/types";

// Mock the client module
vi.mock("../api/client", () => ({
  request: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

const mockRequest = vi.mocked((await import("../api/client")).request);

describe("shares API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createShareLink", () => {
    it("creates a share link successfully", async () => {
      const mockResponse: ShareLinkResponse = {
        code: "abc12345",
        shareType: "SUMMARY",
        data: '{"test":"data"}',
        requiresAuth: false,
        expiresAt: "2026-01-14T00:00:00Z",
        accessCount: 0,
        createdAt: "2026-01-07T00:00:00Z",
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await createShareLink({
        shareType: "SUMMARY",
        data: '{"test":"data"}',
        requiresAuth: false,
        expiryDays: 7,
      });

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith("/shares", {
        method: "POST",
        body: '{"shareType":"SUMMARY","data":"{\\"test\\":\\"data\\"}","requiresAuth":false,"expiryDays":7}',
      });
    });
  });

  describe("getShareLink", () => {
    it("retrieves a share link successfully", async () => {
      const mockResponse: ShareLinkResponse = {
        code: "abc12345",
        shareType: "SUMMARY",
        data: '{"test":"data"}',
        requiresAuth: false,
        expiresAt: "2026-01-14T00:00:00Z",
        accessCount: 1,
        createdAt: "2026-01-07T00:00:00Z",
      };

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await getShareLink("abc12345");

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith("/shares/abc12345", {
        skipAuthHeader: true,
      });
    });

    it("returns null for 404 errors", async () => {
      const { ApiError } = await import("../api/client");
      mockRequest.mockRejectedValueOnce(new ApiError("Not found", 404));

      const result = await getShareLink("notfound");

      expect(result).toBeNull();
    });

    it("throws for other errors", async () => {
      const { ApiError } = await import("../api/client");
      mockRequest.mockRejectedValueOnce(new ApiError("Server error", 500));

      await expect(getShareLink("abc12345")).rejects.toThrow("Server error");
    });
  });

  describe("listUserShareLinks", () => {
    it("lists user share links", async () => {
      const mockResponse: ShareLinkResponse[] = [
        {
          code: "abc12345",
          shareType: "SUMMARY",
          data: '{"test":"data"}',
          requiresAuth: false,
          expiresAt: "2026-01-14T00:00:00Z",
          accessCount: 1,
          createdAt: "2026-01-07T00:00:00Z",
        },
        {
          code: "xyz98765",
          shareType: "TRADES",
          data: '{"test":"auth"}',
          requiresAuth: true,
          expiresAt: "2026-01-14T00:00:00Z",
          accessCount: 0,
          createdAt: "2026-01-07T00:00:00Z",
        },
      ];

      mockRequest.mockResolvedValueOnce(mockResponse);

      const result = await listUserShareLinks();

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith("/shares");
    });
  });

  describe("deleteShareLink", () => {
    it("deletes a share link", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await deleteShareLink("abc12345");

      expect(mockRequest).toHaveBeenCalledWith("/shares/abc12345", {
        method: "DELETE",
      });
    });
  });
});
