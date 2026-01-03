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
import { Link as RouterLink, useSearchParams } from "react-router";
import { useMemo } from "react";
import type { Route } from "./+types/share";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import type { PnlBucket } from "../api/types";
import type { SharedTrade } from "../utils/shareLink";
import { decodeShareToken, SHARE_QUERY_PARAM } from "../utils/shareLink";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Shared P/L" },
    { name: "description", content: "View a shared P/L snapshot or daily trades" },
  ];
}

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

export default function Share() {
  const [searchParams] = useSearchParams();
  const encoded = searchParams.get(SHARE_QUERY_PARAM);

  const shared = useMemo(() => (encoded ? decodeShareToken(encoded) : null), [encoded]);
  const summaryPayload = shared && "summary" in shared ? shared : null;
  const tradesPayload = shared && "trades" in shared ? shared : null;
  const summary = summaryPayload?.summary;
  const monthLabel = summaryPayload ? formatMonthLabel(summaryPayload.month) : "Unknown month";
  const dayLabel = tradesPayload ? formatDayLabel(tradesPayload.date) : "Unknown day";
  const bestDay = useMemo(() => (summary ? bestBucket(summary.daily) : null), [summary]);

  const dailyBuckets = summary?.daily ?? [];
  const fxRate = summary?.cadToUsdRate ?? tradesPayload?.cadToUsdRate;
  const fxDate = summary?.fxDate ?? tradesPayload?.fxDate;

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

  if (!encoded) {
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
              </Stack>
              <Stack spacing={0.25}>
                <Typography variant="overline" color="text.secondary">
                  Best day
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {bestDay ? `${bestDay.period}: ${formatCurrency(bestDay.pnl)} USD` : "No trades"}
                </Typography>
              </Stack>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {fxRate
                ? `P/L shown in USD. CAD trades converted at ${fxRate.toFixed(3)} CAD/USD${fxDate ? ` (as of ${fxDate})` : ""}.`
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
                ? `Total P/L shown in USD. CAD trades converted at ${fxRate.toFixed(3)} CAD/USD${fxDate ? ` (as of ${fxDate})` : ""}.`
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
            <TableCell align="right">Fees</TableCell>
            <TableCell align="right">Realized P/L</TableCell>
            <TableCell>Opened</TableCell>
            <TableCell>Closed</TableCell>
            <TableCell>Notes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11}>
                <Typography color="text.secondary">
                  No trades recorded for this day.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade, index) => (
              <TableRow key={`${trade.symbol}-${trade.closedAt}-${index}`} hover>
                <TableCell sx={{ minWidth: 140, maxWidth: 220, whiteSpace: "normal" }}>
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
                <TableCell align="right">{formatNumber(trade.fees, 2)}</TableCell>
                <TableCell align="right" sx={{ minWidth: 140 }}>
                  <Typography
                    component="span"
                    color={trade.realizedPnl >= 0 ? "success.main" : "error.main"}
                    fontWeight={700}
                  >
                    {formatNumber(trade.realizedPnl, 2)} {trade.currency}
                  </Typography>
                </TableCell>
                <TableCell>{formatDate(trade.openedAt)}</TableCell>
                <TableCell>{formatDate(trade.closedAt)}</TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap title={trade.notes || ""}>
                    {trade.notes || "—"}
                  </Typography>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
