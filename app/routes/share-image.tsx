import type { LoaderFunctionArgs } from "react-router";
import { decodeShareToken, SHARE_QUERY_PARAM } from "../utils/shareLink";

const WIDTH = 1200;
const HEIGHT = 630;

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => numberFormatter.format(value);

const formatPnl = (value: number) =>
  `${value >= 0 ? "+" : ""}${formatCurrency(value)} USD`;

const formatMonthLabel = (value?: string) => {
  if (!value) return "Unknown month";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatDayLabel = (value?: string) => {
  if (!value) return "Unknown day";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildShareImage = (options: {
  title: string;
  subtitle: string;
  pnl: number;
  tradeCount: number;
}) => {
  const { title, subtitle, pnl, tradeCount } = options;
  const accent = pnl >= 0 ? "#16a34a" : "#dc2626";
  const pnlText = escapeXml(formatPnl(pnl));
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const tradesLabel = `${tradeCount} trade${tradeCount === 1 ? "" : "s"}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="510" rx="32" fill="url(#card)" />

  <text x="120" y="155" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">
    ${safeTitle}
  </text>
  <text x="120" y="210" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="28" fill="#475569">
    ${safeSubtitle}
  </text>

  <text x="120" y="340" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="72" font-weight="800" fill="${accent}">
    ${pnlText}
  </text>
  <text x="120" y="395" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="24" fill="#64748b">
    Total P/L - ${escapeXml(tradesLabel)}
  </text>

  <text x="120" y="480" font-family="Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif" font-size="20" fill="#94a3b8">
    Day Trade Journal
  </text>
</svg>`;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const encoded = url.searchParams.get(SHARE_QUERY_PARAM);
  if (!encoded) {
    return new Response("Missing share data.", { status: 400 });
  }

  const shared = decodeShareToken(encoded);
  if (!shared) {
    return new Response("Invalid share data.", { status: 400 });
  }

  const payload = "summary" in shared
    ? {
        title: "Monthly P/L",
        subtitle: formatMonthLabel(shared.month),
        pnl: shared.summary.totalPnl,
        tradeCount: shared.summary.tradeCount ?? 0,
      }
    : {
        title: "Daily P/L",
        subtitle: formatDayLabel(shared.date),
        pnl: shared.totalPnl,
        tradeCount: shared.trades.length,
      };

  const svg = buildShareImage(payload);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export default function ShareImage() {
  return null;
}
