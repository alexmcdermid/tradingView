import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Trade } from "../api/types";

interface TradesTableProps {
  trades: Trade[];
  loading?: boolean;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function TradesTable({ trades, loading, onEdit, onDelete }: TradesTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Symbol</TableCell>
            <TableCell>Asset</TableCell>
            <TableCell>Side</TableCell>
            <TableCell align="right">Qty</TableCell>
            <TableCell align="right">Entry</TableCell>
            <TableCell align="right">Exit</TableCell>
            <TableCell align="right">Fees</TableCell>
            <TableCell align="right">Realized P/L</TableCell>
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
                {Array.from({ length: 11 }).map((__, cellIdx) => (
                  <TableCell key={cellIdx}>
                    <Skeleton />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12}>
                <Typography color="text.secondary">
                  No trades yet. Log a trade to see it here.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade) => (
              <TableRow key={trade.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>
                    {trade.symbol}
                  </Typography>
                  {trade.optionType && trade.strikePrice && (
                    <Typography variant="caption" color="text.secondary">
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
                <TableCell align="right">{formatNumber(trade.fees, 2)}</TableCell>
                <TableCell align="right">
                  <Typography
                    component="span"
                    color={trade.realizedPnl >= 0 ? "success.main" : "error.main"}
                    fontWeight={700}
                  >
                    {formatNumber(trade.realizedPnl, 2)}
                  </Typography>
                </TableCell>
                <TableCell>{formatDate(trade.openedAt)}</TableCell>
                <TableCell>{formatDate(trade.closedAt)}</TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap title={trade.notes || ""}>
                    {trade.notes || "—"}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => onEdit(trade)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => onDelete(trade)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
