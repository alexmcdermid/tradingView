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
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { fetchUsers } from "../api/users";
import type { AdminUser } from "../api/types";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "./+types/admin";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin" }];
}

function formatDate(value: string) {
  return value.slice(0, 10).replace(/-/g, "/");
}

export default function Admin() {
  const { user, token, loginButton } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);

  const handleRequestError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Request failed";
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setAuthBlockedMessage(
        "This admin view is limited to approved emails in dev. Ask to be added to the allowlist."
      );
      return;
    }
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
                </TableRow>
              </TableHead>
              <TableBody>
                {hasUsers ? (
                  users.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>{user.email || "—"}</TableCell>
                      <TableCell>{user.authId}</TableCell>
                      <TableCell>{user.premium ? "Yes" : "No"}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>{formatDate(user.updatedAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5}>
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
