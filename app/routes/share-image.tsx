import { Resvg } from "@resvg/resvg-js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoaderFunctionArgs } from "react-router";
import { decodeShareToken, SHARE_QUERY_PARAM } from "../utils/shareLink";

const WIDTH = 1200;
const HEIGHT = 630;
const FONT_FAMILY = "Inter, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const FONT_FILE_NAMES = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"];
let cachedFontFiles: string[] | null = null;

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => numberFormatter.format(value);
const formatPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${numberFormatter.format(value)}%`;

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

const computeTradeNotional = (trade: {
  entryPrice: number;
  quantity: number;
  assetType: string;
}) => {
  const multiplier = trade.assetType === "OPTION" ? 100 : 1;
  return Math.abs(trade.entryPrice * trade.quantity * multiplier);
};

const computeTradesPercent = (
  trades: Array<{ realizedPnl: number; currency: string; entryPrice: number; quantity: number; assetType: string }>,
  cadToUsdRate?: number
) => {
  if (trades.length === 0) return undefined;
  const rate = cadToUsdRate ?? 1;
  let totalPnl = 0;
  let totalNotional = 0;
  trades.forEach((trade) => {
    const notional = computeTradeNotional(trade);
    const pnlUsd = trade.currency === "CAD" ? trade.realizedPnl * rate : trade.realizedPnl;
    const notionalUsd = trade.currency === "CAD" ? notional * rate : notional;
    totalPnl += pnlUsd;
    totalNotional += notionalUsd;
  });
  if (!Number.isFinite(totalNotional) || totalNotional <= 0) return undefined;
  return Number(((totalPnl / totalNotional) * 100).toFixed(2));
};

const buildShareImage = (options: {
  title: string;
  subtitle: string;
  pnl: number;
  percent?: number;
  tradeCount: number;
}) => {
  const { title, subtitle, pnl, percent, tradeCount } = options;
  const accent = pnl >= 0 ? "#16a34a" : "#dc2626";
  const pnlText = escapeXml(formatPnl(pnl));
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const tradesValue = escapeXml(tradeCount.toLocaleString("en-US"));
  const returnValue = escapeXml(percent === undefined || percent === null ? "N/A" : formatPercent(percent));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <radialGradient id="glow-top" cx="85%" cy="0%" r="70%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.28" />
      <stop offset="60%" stop-color="#0f172a" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow-bottom" cx="10%" cy="100%" r="60%">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.18" />
      <stop offset="65%" stop-color="#0f172a" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
    <linearGradient id="card-header" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f1f5f9" />
      <stop offset="100%" stop-color="#ffffff" />
    </linearGradient>
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.28" />
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow-top)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow-bottom)" />
  <rect x="60" y="70" width="1080" height="490" rx="36" fill="url(#card)" filter="url(#card-shadow)" />
  <rect x="60" y="70" width="1080" height="130" rx="36" fill="url(#card-header)" />

  <text x="120" y="155" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="#0f172a">
    ${safeTitle}
  </text>
  <text x="120" y="202" font-family="${FONT_FAMILY}" font-size="26" fill="#475569">
    ${safeSubtitle}
  </text>

  <text x="120" y="320" font-family="${FONT_FAMILY}" font-size="88" font-weight="800" fill="${accent}">
    ${pnlText}
  </text>
  <text x="120" y="370" font-family="${FONT_FAMILY}" font-size="22" fill="#64748b">
    Total P/L (USD)
  </text>

  <rect x="120" y="405" width="408" height="120" rx="24" fill="#f1f5f9" />
  <rect x="552" y="405" width="408" height="120" rx="24" fill="#f1f5f9" />

  <text x="150" y="445" font-family="${FONT_FAMILY}" font-size="20" fill="#64748b">
    Trades
  </text>
  <text x="150" y="495" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="#0f172a">
    ${tradesValue}
  </text>

  <text x="582" y="445" font-family="${FONT_FAMILY}" font-size="20" fill="#64748b">
    Return
  </text>
  <text x="582" y="495" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="#0f172a">
    ${returnValue}
  </text>
</svg>`;
};

const findFontFiles = (rootDir: string) => {
  const publicDir = path.resolve(rootDir, "public", "fonts");
  const publicFiles = FONT_FILE_NAMES.map((name) => path.join(publicDir, name)).filter((file) =>
    existsSync(file)
  );
  if (publicFiles.length > 0) return publicFiles;

  const buildDir = path.resolve(rootDir, "build", "client", "fonts");
  const buildFiles = FONT_FILE_NAMES.map((name) => path.join(buildDir, name)).filter((file) =>
    existsSync(file)
  );
  return buildFiles;
};

const getFontFiles = () => {
  if (cachedFontFiles) return cachedFontFiles;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const roots = [process.cwd(), moduleDir];

  for (const root of roots) {
    let current = root;
    for (let depth = 0; depth < 5; depth += 1) {
      const files = findFontFiles(current);
      if (files.length > 0) {
        cachedFontFiles = files;
        return files;
      }
      current = path.resolve(current, "..");
    }
  }

  cachedFontFiles = [];
  return cachedFontFiles;
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
        percent: shared.summary.pnlPercent,
        tradeCount: shared.summary.tradeCount ?? 0,
      }
    : {
        title: "Daily P/L",
        subtitle: formatDayLabel(shared.date),
        pnl: shared.totalPnl,
        percent: computeTradesPercent(shared.trades, shared.cadToUsdRate),
        tradeCount: shared.trades.length,
      };

  const svg = buildShareImage(payload);
  const fontFiles = getFontFiles();
  const fontConfig = {
    fontFiles,
    loadSystemFonts: true,
    defaultFontFamily: "Inter",
  };
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: fontConfig,
  });
  const pngData = resvg.render().asPng();
  const body = new Uint8Array(pngData);

  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
