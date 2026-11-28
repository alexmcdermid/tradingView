import { request } from "./client";
import type { TaxYearCheckoutResponse, TaxYearPass } from "./types";

export async function fetchTaxYearPasses() {
  return request<TaxYearPass[]>("/billing/tax-year-passes");
}

export async function startTaxYearCheckout(taxYear: number) {
  return request<TaxYearCheckoutResponse>(`/billing/tax-year-passes/${taxYear}/checkout`, {
    method: "POST",
  });
}
