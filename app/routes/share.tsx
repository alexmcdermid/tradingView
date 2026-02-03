import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useSearchParams, useLoaderData } from "react-router";
import { useMemo } from "react";
import type { Route } from "./+types/share";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import type { PnlBucket } from "../api/types";
import type { SharedTrade } from "../utils/shareLink";
import { decodeShareToken, encodeShareToken, SHARE_QUERY_PARAM } from "../utils/shareLink";
import { getShareLink } from "../api/shares";
import { computeMarginFee } from "../utils/tradeMath";

const formatMonthLabel = (value?: string) => {
  if (!value) return "Unknown month";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const formatDayLabel = (value?: string) => {
  if (!value) return "Unknown day";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value: string) => value.slice(0, 10).replace(/-/g, "/");

const formatNumber = (value?: number | null, digits = 2) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const computeTradeNotional = (trade: SharedTrade) => {
  const multiplier = trade.assetType === "OPTION" ? 100 : 1;
  return Math.abs(trade.entryPrice * trade.quantity * multiplier);
};

const computeTradePercent = (trade: SharedTrade) => {
  const notional = computeTradeNotional(trade);
  if (!Number.isFinite(notional) || notional <= 0) return null;
  return Number(((trade.realizedPnl / notional) * 100).toFixed(2));
};

const computeTradesPercent = (trades: SharedTrade[], cadToUsdRate?: number) => {
  if (trades.length === 0) return null;
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
  if (!Number.isFinite(totalNotional) || totalNotional <= 0) return null;
  return Number(((totalPnl / totalNotional) * 100).toFixed(2));
};

const bestBucket = (buckets: PnlBucket[]) => {
  if (buckets.length === 0) return null;
  return buckets.reduce((best, bucket) => (bucket.pnl > best.pnl ? bucket : best));
};

const formatDateTime = (value?: string) => {
  if (!value) return "Unknown timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const buildMetaDescriptors = (
  title: string,
  description: string,
  imageUrl?: string
): Route.MetaDescriptors => {
  const base: Route.MetaDescriptors = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
  if (!imageUrl) return base;
  return [
    ...base,
    { property: "og:image", content: imageUrl },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: imageUrl },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const code = (params as { code?: string }).code;
  
  if (code) {
    try {
      const shareLink = await getShareLink(code);
      if (!shareLink) {
        return { shareData: null, error: "Share link not found or expired" };
      }
      const decoded = JSON.parse(shareLink.data);
      return { shareData: decoded, error: null };
    } catch (error) {
      console.error("Failed to fetch share link:", error);
      return { shareData: null, error: "Failed to load share link" };
    }
  }

  // Legacy URL-encoded share (query param)
  const url = new URL(request.url);
  const encoded = url.searchParams.get(SHARE_QUERY_PARAM);
  if (encoded) {
    const decoded = decodeShareToken(encoded);
    return { shareData: decoded, error: decoded ? null : "Invalid share data" };
  }

  return { shareData: null, error: null };
}

export function meta({ location, data }: Route.MetaArgs) {
  const defaultTitle = "Shared P/L";
  const defaultDescription = "View a shared P/L snapshot or daily trades";
  
  const loaderData = data as Awaited<ReturnType<typeof loader>>;
  const shared = loaderData?.shareData;
  
  if (!shared) {
    const encoded = new URLSearchParams(location.search).get(SHARE_QUERY_PARAM);
    if (encoded) {
      const decoded = decodeShareToken(encoded);
      if (decoded) {
        const imagePath = `/share-image?${SHARE_QUERY_PARAM}=${encodeURIComponent(encoded)}`;
        const imageUrl = decoded.origin ? `${decoded.origin}${imagePath}` : imagePath;

        if ("summary" in decoded) {
          const monthLabel = formatMonthLabel(decoded.month);
          return buildMetaDescriptors(
            `Shared Monthly P/L — ${monthLabel}`,
            `Shared P/L snapshot for ${monthLabel}.`,
            imageUrl
          );
        }

        const dayLabel = formatDayLabel(decoded.date);
        return buildMetaDescriptors(
          `Shared Daily P/L — ${dayLabel}`,
          `Shared trades for ${dayLabel}.`,
          imageUrl
        );
      }
    }
    return buildMetaDescriptors(defaultTitle, defaultDescription);
  }

  const encoded = encodeShareToken(shared);
  const imagePath = `/share-image?${SHARE_QUERY_PARAM}=${encodeURIComponent(encoded)}`;
  const imageUrl = shared.origin ? `${shared.origin}${imagePath}` : imagePath;

  if ("summary" in shared) {
    const monthLabel = formatMonthLabel(shared.month);
    return buildMetaDescriptors(
      `Shared Monthly P/L — ${monthLabel}`,
      `Shared P/L snapshot for ${monthLabel}.`,
      imageUrl
    );
  }

  const dayLabel = formatDayLabel(shared.date);
  return buildMetaDescriptors(
    `Shared Daily P/L — ${dayLabel}`,
    `Shared trades for ${dayLabel}.`,
    imageUrl
  );
}

export default function Share() {
  const [searchParams] = useSearchParams();
  const loaderData = useLoaderData<typeof loader>();
  
  const encoded = searchParams.get(SHARE_QUERY_PARAM);
  const shared = useMemo(() => {
    if (loaderData.shareData) {
      return loaderData.shareData;
    }
    return encoded ? decodeShareToken(encoded) : null;
  }, [loaderData.shareData, encoded]);
  const summaryPayload = shared && "summary" in shared ? shared : null;
  const tradesPayload = shared && "trades" in shared ? shared : null;
  const summary = summaryPayload?.summary;
  const monthLabel = summaryPayload ? formatMonthLabel(summaryPayload.month) : "Unknown month";
  const dayLabel = tradesPayload ? formatDayLabel(tradesPayload.date) : "Unknown day";
  const bestDay = useMemo(() => (summary ? bestBucket(summary.daily) : null), [summary]);

  const dailyBuckets: PnlBucket[] = summary?.daily ?? [];
  const fxRate = summary?.cadToUsdRate ?? tradesPayload?.cadToUsdRate;
  const fxDate = summary?.fxDate ?? tradesPayload?.fxDate;
  const summaryPercent = summary?.pnlPercent;
  const tradesPercent = useMemo(
    () => (tradesPayload ? computeTradesPercent(tradesPayload.trades, tradesPayload.cadToUsdRate) : null),
    [tradesPayload]
  );

  const renderHeader = () => (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={800}>
          {tradesPayload ? "Shared Trades Snapshot" : "Shared P/L Snapshot"}
        </Typography>
        {shared && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={0.5}>
            {summaryPayload && (
              <>
                <Chip label={monthLabel} color="primary" variant="outlined" />
                <Chip
                  label={`${summaryPayload.summary.tradeCount ?? 0} trade${(summaryPayload.summary.tradeCount ?? 0) === 1 ? "" : "s"}`}
                  variant="outlined"
                />
              </>
            )}
            {tradesPayload && (
              <>
                <Chip label={dayLabel} color="primary" variant="outlined" />
                <Chip
                  label={`${tradesPayload.trades.length} trade${tradesPayload.trades.length === 1 ? "" : "s"}`}
                  variant="outlined"
                />
              </>
            )}
            {shared.env && <Chip label={`Env: ${shared.env}`} size="small" variant="outlined" />}
            {shared.origin && <Chip label={`Ref: ${shared.origin}`} size="small" variant="outlined" />}
          </Stack>
        )}
        {shared && (
          <Typography variant="caption" color="text.secondary">
            Generated {formatDateTime(shared.generatedAt)}
          </Typography>
        )}
      </Stack>
      <Button component={RouterLink} to="/" variant="outlined">
        Exit shared view
      </Button>
    </Stack>
  );

  if (loaderData.error && !encoded) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Alert severity="error" sx={{ mt: 2 }}>
          {loaderData.error}
        </Alert>
      </Container>
    );
  }

  if (!shared && !encoded) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Alert severity="warning" sx={{ mt: 2 }}>
          No shared data found in the link.
        </Alert>
      </Container>
    );
  }

  if (!shared) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Alert severity="error" sx={{ mt: 2 }}>
          This share link is invalid or has been corrupted.
        </Alert>
      </Container>
    );
  }

  if (summaryPayload && summary) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
              <Stack spacing={0.25}>
                <Typography variant="overline" color="text.secondary">
                  Total P/L ({monthLabel})
                </Typography>
                <Typography variant="h4" fontWeight={800} color={summary.totalPnl >= 0 ? "success.main" : "error.main"}>
                  {formatCurrency(summary.totalPnl)} USD
                </Typography>
                {summaryPercent !== undefined && summaryPercent !== null && (
                  <Typography variant="body2" color="text.secondary" fontWeight={700}>
                    {formatPercent(summaryPercent)} return
                  </Typography>
                )}
              </Stack>
              <Stack spacing={0.25}>
                <Typography variant="overline" color="text.secondary">
                  Best day
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {bestDay
                    ? `${bestDay.period}: ${formatCurrency(bestDay.pnl)} USD${
                        bestDay.pnlPercent !== undefined && bestDay.pnlPercent !== null
                          ? ` (${formatPercent(bestDay.pnlPercent)})`
                          : ""
                      }`
                    : "No trades"}
                </Typography>
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {fxRate
                ? `P/L shown in USD. CAD trades converted at ${fxRate.toFixed(5)} CAD/USD${fxDate ? ` (BOC effective date: ${fxDate})` : ""}.`
                : "P/L shown in USD. CAD trades converted using the latest rate."}
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Daily P/L
              </Typography>
              <MonthlyCalendar daily={dailyBuckets} month={summaryPayload.month} readOnly />
              <Divider />
              <Box>
                {dailyBuckets.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No trades recorded for this month.
                  </Typography>
                ) : (
                  dailyBuckets.map((bucket) => (
                    <Stack key={bucket.period} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                      <Typography variant="body2">{bucket.period}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {bucket.trades} trade{bucket.trades === 1 ? "" : "s"}
                        </Typography>
                        {bucket.pnlPercent !== undefined && bucket.pnlPercent !== null && (
                          <Typography variant="caption" color="text.secondary">
                            {formatPercent(bucket.pnlPercent)} return
                          </Typography>
                        )}
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color={bucket.pnl >= 0 ? "success.main" : "error.main"}
                        >
                          {formatCurrency(bucket.pnl)}
                        </Typography>
                      </Stack>
                    </Stack>
                  ))
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (tradesPayload) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
              <Stack spacing={0.25}>
                <Typography variant="overline" color="text.secondary">
                  Total P/L ({dayLabel})
                </Typography>
                <Typography
                  variant="h4"
                  fontWeight={800}
                  color={tradesPayload.totalPnl >= 0 ? "success.main" : "error.main"}
                >
                  {formatCurrency(tradesPayload.totalPnl)} USD
                </Typography>
                {tradesPercent !== null && tradesPercent !== undefined && (
                  <Typography variant="body2" color="text.secondary" fontWeight={700}>
                    {formatPercent(tradesPercent)} return
                  </Typography>
                )}
              </Stack>
              <Stack spacing={0.25}>
                <Typography variant="overline" color="text.secondary">
                  Trades
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {tradesPayload.trades.length}
                </Typography>
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {fxRate
                ? `Total P/L shown in USD. CAD trades converted at ${fxRate.toFixed(5)} CAD/USD${fxDate ? ` (BOC effective date: ${fxDate})` : ""}.`
                : "Total P/L shown in USD. CAD trades converted using the latest rate."}
            </Typography>
          </CardContent>
        </Card>

        <SharedTradesTable trades={tradesPayload.trades} />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {renderHeader()}
      <Alert severity="error" sx={{ mt: 2 }}>
        This share link is invalid or has been corrupted.
      </Alert>
    </Container>
  );
}

function SharedTradesTable({ trades }: { trades: SharedTrade[] }) {
  return (
    <TableContainer sx={{ my: 2 }} component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Symbol</TableCell>
            <TableCell sx={{ width: 70 }}>Asset</TableCell>
            <TableCell sx={{ width: 70 }}>Side</TableCell>
            <TableCell align="right">Qty</TableCell>
            <TableCell align="right">Entry</TableCell>
            <TableCell align="right">Exit</TableCell>
            <TableCell align="right">Realized P/L</TableCell>
            <TableCell align="right">P/L %</TableCell>
            <TableCell align="right">Fees</TableCell>
            <TableCell align="right">Margin</TableCell>
            <TableCell>Opened</TableCell>
            <TableCell>Closed</TableCell>
            <TableCell>Notes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={13}>
                <Typography color="text.secondary">
                  No trades recorded for this day.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade, index) => {
              const marginFee = computeMarginFee({
                entryPrice: trade.entryPrice,
                quantity: trade.quantity,
                assetType: trade.assetType,
                marginRate: trade.marginRate ?? 0,
                openedAt: trade.openedAt,
                closedAt: trade.closedAt,
              });
              return (
                <TableRow key={`${trade.symbol}-${trade.closedAt}-${index}`} hover>
                <TableCell sx={{ minWidth: 120, maxWidth: 180, whiteSpace: "normal" }}>
                  <Typography variant="body2" fontWeight={700}>
                    {trade.symbol}
                  </Typography>
                  {trade.optionType && trade.strikePrice !== undefined && trade.strikePrice !== null && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", whiteSpace: "normal", wordBreak: "keep-all" }}
                    >
                      {trade.optionType} {trade.strikePrice.toFixed(2)}
                      {trade.expiryDate ? ` ${trade.expiryDate}` : ""}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip label={trade.assetType} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={trade.direction}
                    size="small"
                    color={trade.direction === "LONG" ? "success" : "warning"}
                  />
                </TableCell>
                <TableCell align="right">{formatNumber(trade.quantity, 0)}</TableCell>
                <TableCell align="right">{formatNumber(trade.entryPrice, 2)}</TableCell>
                <TableCell align="right">{formatNumber(trade.exitPrice, 2)}</TableCell>
                <TableCell align="right" sx={{ minWidth: 140 }}>
                  <Typography
                    component="span"
                    color={trade.realizedPnl >= 0 ? "success.main" : "error.main"}
                    fontWeight={700}
                  >
                    {formatNumber(trade.realizedPnl, 2)} {trade.currency}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {(() => {
                    const percent = computeTradePercent(trade);
                    if (percent === null) return "—";
                    return (
                      <Typography
                        component="span"
                        color={percent >= 0 ? "success.main" : "error.main"}
                        fontWeight={700}
                      >
                        {formatPercent(percent)}
                      </Typography>
                    );
                  })()}
                </TableCell>
                <TableCell align="right">{formatNumber(trade.fees, 2)}</TableCell>
                <TableCell align="right">{formatNumber(marginFee, 2)}</TableCell>
                <TableCell>{formatDate(trade.openedAt)}</TableCell>
                <TableCell>{formatDate(trade.closedAt)}</TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap title={trade.notes || ""}>
                    {trade.notes || "—"}
                  </Typography>
                </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
