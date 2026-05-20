import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from "@mui/material";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { fetchUsers, fetchUserTradeHistory } from "../api/users";
import type { AdminUser, TradeHistory } from "../api/types";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "./+types/admin";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin" }];
}

function formatDate(value: string) {
  return value.slice(0, 10).replace(/-/g, "/");
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function Admin() {
  const { user, token, loginButton, logout } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<TradeHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);

  const handleRequestError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Request failed";
    if (
      err instanceof ApiError &&
      (err.status === 401 || err.status === 403) &&
      message.toLowerCase().includes("not allowed")
    ) {
      setAuthBlockedMessage(
        "This dev environment is for repo contributors only. Your account is not on the dev allowlist. Contact the repo owner to request access."
      );
      return;
    }
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      logout();
      setError(null);
      setWarning("Session expired. Please sign in again.");
      return;
    }
    setWarning(null);
    setError(message);
  };

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    let active = true;
    setLoading(true);
    fetchUsers()
      .then((data) => {
        if (active) {
          setUsers(data);
        }
      })
      .catch(handleRequestError)
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, user]);

  useEffect(() => {
    if (!user) {
      setAuthBlockedMessage(null);
    }
  }, [user]);

  const handleToggleHistory = async (adminUser: AdminUser) => {
    if (selectedUserId === adminUser.id) {
      setSelectedUserId(null);
      setHistoryRows([]);
      return;
    }
    setSelectedUserId(adminUser.id);
    setHistoryRows([]);
    setLoadingHistory(true);
    try {
      setHistoryRows(await fetchUserTradeHistory(adminUser.id));
    } catch (err) {
      handleRequestError(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const hasUsers = users.length > 0;
  const emptyLabel = useMemo(() => {
    if (loading) return "Loading users…";
    return "No users yet.";
  }, [loading]);

  return (
    <>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700}>
            Admin
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            component={RouterLink}
            to="/"
            variant="outlined"
            size="small"
          >
            Back to app
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {!user && (
          <Stack spacing={2}>
            <Alert severity="info">Sign in to view admin users.</Alert>
            <Box>{loginButton}</Box>
          </Stack>
        )}
        {warning && (
          <Alert severity="warning" onClose={() => setWarning(null)}>
            {warning}
          </Alert>
        )}
        {user && authBlockedMessage && (
          <Alert severity="warning" onClose={() => setAuthBlockedMessage(null)}>
            {authBlockedMessage}
          </Alert>
        )}
        {user && error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {user && (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Auth ID</TableCell>
                  <TableCell>Premium</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">History</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hasUsers ? (
                  users.map((adminUser) => (
                    <Fragment key={adminUser.id}>
                      <TableRow hover>
                        <TableCell>{adminUser.email || "—"}</TableCell>
                        <TableCell>{adminUser.authId}</TableCell>
                        <TableCell>{adminUser.premium ? "Yes" : "No"}</TableCell>
                        <TableCell>{formatDate(adminUser.createdAt)}</TableCell>
                        <TableCell>{formatDate(adminUser.updatedAt)}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => void handleToggleHistory(adminUser)}
                          >
                            {selectedUserId === adminUser.id ? "Hide" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {selectedUserId === adminUser.id && (
                        <TableRow>
                          <TableCell colSpan={6}>
                            {loadingHistory ? (
                              <Typography color="text.secondary">Loading history...</Typography>
                            ) : historyRows.length === 0 ? (
                              <Typography color="text.secondary">No trade history recorded.</Typography>
                            ) : (
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Action</TableCell>
                                    <TableCell>When</TableCell>
                                    <TableCell>Trade ID</TableCell>
                                    <TableCell>Symbol</TableCell>
                                    <TableCell>Side</TableCell>
                                    <TableCell align="right">Qty</TableCell>
                                    <TableCell align="right">P/L</TableCell>
                                    <TableCell>Closed</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {historyRows.map((entry) => (
                                    <TableRow key={entry.id}>
                                      <TableCell>{entry.action}</TableCell>
                                      <TableCell>{formatTimestamp(entry.actionAt)}</TableCell>
                                      <TableCell>{entry.tradeId}</TableCell>
                                      <TableCell>{entry.symbol}</TableCell>
                                      <TableCell>{entry.direction}</TableCell>
                                      <TableCell align="right">{entry.quantity}</TableCell>
                                      <TableCell align="right">{formatNumber(entry.realizedPnl)}</TableCell>
                                      <TableCell>{entry.closedAt}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary">{emptyLabel}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </>
  );
}
