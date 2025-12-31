import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useSearchParams } from "react-router";
import { useMemo } from "react";
import type { Route } from "./+types/share";
import { MonthlyCalendar } from "../components/MonthlyCalendar";
import type { PnlBucket } from "../api/types";
import { decodeShareToken, SHARE_QUERY_PARAM } from "../utils/shareLink";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Shared P/L" },
    { name: "description", content: "View a shared monthly P/L summary" },
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

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const summary = shared?.summary;
  const monthLabel = shared ? formatMonthLabel(shared.month) : "Unknown month";
  const bestDay = useMemo(() => (summary ? bestBucket(summary.daily) : null), [summary]);

  const dailyBuckets = summary?.daily ?? [];
  const fxRate = summary?.cadToUsdRate;
  const fxDate = summary?.fxDate;

  const renderHeader = () => (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={800}>
          Shared P/L Snapshot
        </Typography>
        {shared && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={0.5}>
            <Chip label={monthLabel} color="primary" variant="outlined" />
            <Chip label={`${summary?.tradeCount ?? 0} trade${(summary?.tradeCount ?? 0) === 1 ? "" : "s"}`} variant="outlined" />
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

  if (!shared || !summary) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {renderHeader()}
        <Alert severity="error" sx={{ mt: 2 }}>
          This share link is invalid or has been corrupted.
        </Alert>
      </Container>
    );
  }

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
            <MonthlyCalendar daily={dailyBuckets} month={shared.month} />
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
