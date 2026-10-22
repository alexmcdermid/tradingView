import { request } from "./client";
import type { BillingSessionResponse } from "./types";

export async function createBillingCheckoutSession() {
  return request<BillingSessionResponse>("/billing/checkout-session", {
    method: "POST",
  });
}

export async function createBillingPortalSession() {
  return request<BillingSessionResponse>("/billing/portal-session", {
    method: "POST",
  });
}
