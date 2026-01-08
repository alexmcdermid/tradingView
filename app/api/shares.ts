import { request, ApiError } from "./client";
import type { CreateShareLinkRequest, ShareLinkResponse } from "./types";

export async function createShareLink(
  payload: CreateShareLinkRequest
): Promise<ShareLinkResponse> {
  return request<ShareLinkResponse>("/shares", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getShareLink(code: string): Promise<ShareLinkResponse | null> {
  try {
    return await request<ShareLinkResponse>(`/shares/${code}`, {
      skipAuthHeader: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function listUserShareLinks(): Promise<ShareLinkResponse[]> {
  return request<ShareLinkResponse[]>("/shares");
}

export async function deleteShareLink(code: string): Promise<void> {
  return request<void>(`/shares/${code}`, {
    method: "DELETE",
  });
}
