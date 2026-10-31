import { request, requestBlob } from "./client";
import type {
  AnnualSummary,
  ReportFilters,
  TaxYearExportRequest,
  TaxYearOverview,
  TaxYearReportType,
} from "./types";

const EXPORT_FILENAME_SLUGS: Record<TaxYearReportType, string> = {
  TRADE_LEDGER: "trade-ledger",
  DISPOSITIONS: "dispositions",
  ANNUAL_SUMMARY: "annual-summary",
  REPURCHASE_REVIEW: "repurchase-review",
};

export async function fetchTaxYearOverview() {
  return request<TaxYearOverview>("/reports/tax-years");
}

export async function fetchAnnualSummary(taxYear: number, filters: ReportFilters) {
  return request<AnnualSummary>(`/reports/tax-years/${taxYear}/summary`, {
    method: "POST",
    body: JSON.stringify(filters),
  });
}

export async function downloadTaxYearExport(taxYear: number, exportRequest: TaxYearExportRequest) {
  return requestBlob(`/reports/tax-years/${taxYear}/exports`, {
    method: "POST",
    // JSON stays acceptable so error responses keep their message.
    headers: { Accept: "text/csv, application/json" },
    body: JSON.stringify(exportRequest),
    // The API exposes Content-Disposition through CORS, so the server names the file. The fallback
    // repeats its naming scheme for a response that arrives without the header.
    fallbackFilename: `tradelog-${taxYear}-${EXPORT_FILENAME_SLUGS[exportRequest.reportType]}.csv`,
  });
}
