import { Card, CardContent, CardHeader, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface LoginCardProps {
  loginButton: ReactNode;
}

export function LoginCard({ loginButton }: LoginCardProps) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
      <Card sx={{ maxWidth: 420, width: "100%" }}>
        <CardHeader title="Sign in" subheader="Use Google to access your trade journal" />
        <CardContent>
          <Stack spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary" align="center">
              Authenticate to view or manage your trades and P/L.
            </Typography>
            {loginButton}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
