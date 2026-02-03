import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Trade } from "../api/types";
import { computeMarginFee } from "../utils/tradeMath";

interface TradesTableProps {
  trades: Trade[];
  loading?: boolean;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  page?: number;
  pageSize?: number;
  totalElements?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

function TablePaginationActions({
  count,
  page,
  rowsPerPage,
  onPageChange,
}: {
  count: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (event: React.MouseEvent<HTMLButtonElement>, page: number) => void;
}) {
  const lastPage = Math.max(0, Math.ceil(count / rowsPerPage) - 1);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1 }}>
      <IconButton
        size="small"
        onClick={(event) => onPageChange(event, 0)}
        disabled={page === 0}
        aria-label="first page"
      >
        <FirstPageIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={(event) => onPageChange(event, page - 1)}
        disabled={page === 0}
        aria-label="previous page"
      >
        <NavigateBeforeIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={(event) => onPageChange(event, page + 1)}
        disabled={page >= lastPage}
        aria-label="next page"
      >
        <NavigateNextIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={(event) => onPageChange(event, lastPage)}
        disabled={page >= lastPage}
        aria-label="last page"
      >
        <LastPageIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function formatDate(value: string) {
  const iso = value.slice(0, 10);
  return iso.replace(/-/g, "/");
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function computeTradePnlPercent(trade: Trade) {
  if (trade.pnlPercent !== undefined && trade.pnlPercent !== null) {
    return trade.pnlPercent;
  }
  if (trade.entryPrice === null || trade.entryPrice === undefined) return null;
  if (trade.quantity === null || trade.quantity === undefined) return null;
  const multiplier = trade.assetType === "OPTION" ? 100 : 1;
  const notional = Math.abs(trade.entryPrice * trade.quantity * multiplier);
  if (notional <= 0) return null;
  return Number(((trade.realizedPnl / notional) * 100).toFixed(2));
}

export function TradesTable({
  trades,
  loading,
  onEdit,
  onDelete,
  page,
  pageSize,
  totalElements,
  onPageChange,
  onPageSizeChange,
}: TradesTableProps) {
  const paginationEnabled =
    page !== undefined &&
    pageSize !== undefined &&
    totalElements !== undefined &&
    onPageChange !== undefined &&
    onPageSizeChange !== undefined;

  return (
    <TableContainer component={Paper}>
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
            <TableCell align="right">Margin Fee</TableCell>
            <TableCell>Opened</TableCell>
            <TableCell>Closed</TableCell>
            <TableCell>Notes</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 14 }).map((__, cellIdx) => (
                  <TableCell key={cellIdx}>
                    <Skeleton />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={14}>
                <Typography color="text.secondary">
                  No trades yet. Log a trade to see it here.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade) => {
              const percent = computeTradePnlPercent(trade);
              const marginFee = computeMarginFee({
                entryPrice: trade.entryPrice,
                quantity: trade.quantity,
                assetType: trade.assetType,
                marginRate: trade.marginRate ?? 0,
                openedAt: trade.openedAt,
                closedAt: trade.closedAt,
              });
              const percentLabel =
                percent == null ? "—" : `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
              return (
                <TableRow
                  key={trade.id}
                  hover
                  onClick={() => onEdit(trade)}
                  sx={{ cursor: "pointer" }}
                >
                <TableCell sx={{ minWidth: 120, maxWidth: 180, whiteSpace: "normal" }}>
                  <Typography variant="body2" fontWeight={700}>
                    {trade.symbol}
                  </Typography>
                  {trade.optionType && trade.strikePrice && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", whiteSpace: "normal", wordBreak: "keep-all" }}
                    >
                      {trade.optionType} {trade.strikePrice.toFixed(2)} {trade.expiryDate}
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
                  {percent == null ? (
                    percentLabel
                  ) : (
                    <Typography
                      component="span"
                      color={percent >= 0 ? "success.main" : "error.main"}
                      fontWeight={700}
                    >
                      {percentLabel}
                    </Typography>
                  )}
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
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(trade);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(trade);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
              );
            })
          )}
        </TableBody>
        {paginationEnabled && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={14} sx={{ p: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 1.5,
                    py: 1,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Rows
                    </Typography>
                    <Select
                      size="small"
                      value={pageSize}
                      onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    >
                      {[20, 50, 100].map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {`${page * pageSize + 1}-${Math.min(totalElements, (page + 1) * pageSize)} of ${totalElements}`}
                    </Typography>
                    <TablePaginationActions
                      count={totalElements}
                      page={page}
                      rowsPerPage={pageSize}
                      onPageChange={(_, newPage) => onPageChange(newPage)}
                    />
                  </Stack>
                </Box>
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
}
