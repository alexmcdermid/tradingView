import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { createBillingCheckoutSession, createBillingPortalSession } from "../api/billing";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "./+types/pro";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "tradelog Pro" },
    {
      name: "description",
      content: "Upgrade to tradelog Pro to unlock the trade cap for active traders.",
    },
  ];
}

const features = [
  {
    icon: <LockOpenIcon color="primary" />,
    title: "Unlock the trade cap",
    body: "Keep logging when your monthly volume moves beyond the free allowance.",
  },
  {
    icon: <TrendingUpIcon color="primary" />,
    title: "Built for active months",
    body: "Track every setup, exit, note, account, and adjustment without trimming the journal.",
  },
  {
    icon: <WorkspacePremiumIcon color="primary" />,
    title: "Account-level access",
    body: "Keep Pro attached to your signed-in account as the paid plan grows.",
  },
];

function getBillingErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Sign in again before changing your subscription.";
    }
    if (error.status === 409) {
      return "A billing portal is not linked to this account yet. Start Pro first.";
    }
    if (error.status === 503) {
      return "Billing is not available yet. Subscription setup is still pending.";
    }
  }
  return error instanceof Error ? error.message : "Billing request failed.";
}

export default function Pro() {
  const { user, profile, token, loginButton, initializing } = useAuth();
  const [searchParams] = useSearchParams();
  const [billingError, setBillingError] = useState<string | null>(null);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const isSignedIn = Boolean(user && token);
  const isPremium = Boolean(profile?.premium);
  const checkoutState = searchParams.get("checkout");

  const handleStartCheckout = async () => {
    if (!isSignedIn) {
      setBillingError("Sign in before upgrading to Pro.");
      return;
    }
    setStartingCheckout(true);
    setBillingError(null);
    try {
      const session = await createBillingCheckoutSession();
      window.location.assign(session.url);
    } catch (error) {
      setBillingError(getBillingErrorMessage(error));
      setStartingCheckout(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!isSignedIn) {
      setBillingError("Sign in before managing billing.");
      return;
    }
    setOpeningPortal(true);
    setBillingError(null);
    try {
      const session = await createBillingPortalSession();
      window.location.assign(session.url);
    } catch (error) {
      setBillingError(getBillingErrorMessage(error));
      setOpeningPortal(false);
    }
  };

  return (
    <>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Button
            component={RouterLink}
            to="/"
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
          >
            Back to app
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {isPremium && <Chip color="secondary" label="Pro active" />}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          {checkoutState === "success" && (
            <Alert severity="success">
              Checkout completed. Your Pro status will update after Stripe confirms the subscription.
            </Alert>
          )}
          {checkoutState === "cancelled" && (
            <Alert severity="info">Checkout was cancelled. Your account has not changed.</Alert>
          )}
          {billingError && (
            <Alert severity="warning" onClose={() => setBillingError(null)}>
              {billingError}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.25fr) 360px" },
              gap: 3,
              alignItems: "stretch",
            }}
          >
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                p: { xs: 3, md: 4 },
              }}
            >
              <Stack spacing={2.5} sx={{ maxWidth: 760 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <WorkspacePremiumIcon color="secondary" />
                  <Typography variant="overline" color="text.secondary" fontWeight={700}>
                    tradelog Pro
                  </Typography>
                </Stack>
                <Typography
                  variant="h3"
                  component="h1"
                  fontWeight={800}
                  sx={{ fontSize: { xs: "2.1rem", md: "3rem" } }}
                >
                  Unlock the trade cap when your journal gets serious.
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                  Pro is for active traders who need room to log every trade, every account, and every
                  adjustment without hitting the free-plan ceiling.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={
                      startingCheckout || openingPortal ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <CreditCardIcon />
                      )
                    }
                    disabled={initializing || !isSignedIn || startingCheckout || openingPortal}
                    onClick={() => void (isPremium ? handleOpenPortal() : handleStartCheckout())}
                    sx={{ textTransform: "none", alignSelf: { xs: "stretch", sm: "flex-start" } }}
                  >
                    {isPremium ? "Manage billing" : "Start Pro"}
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/"
                    variant="text"
                    size="large"
                    sx={{ textTransform: "none", alignSelf: { xs: "stretch", sm: "center" } }}
                  >
                    Keep journaling
                  </Button>
                </Stack>
                {!isSignedIn && !initializing && (
                  <Stack spacing={1} alignItems="flex-start">
                    <Typography variant="body2" color="text.secondary">
                      Sign in to connect Pro to your account.
                    </Typography>
                    {loginButton}
                  </Stack>
                )}
              </Stack>
            </Box>

            <Card variant="outlined" sx={{ borderRadius: 1 }}>
              <CardContent>
                <Stack spacing={2.25}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h5" fontWeight={800}>
                      Pro
                    </Typography>
                    <Chip label={isPremium ? "Active" : "Subscription"} color="secondary" size="small" />
                  </Stack>
                  <Typography color="text.secondary">
                    Pricing and the exact free trade threshold can be finalized later. This page is
                    the subscription home for lifting that limit.
                  </Typography>
                  <Divider />
                  <Stack spacing={1.25}>
                    {[
                      "Expanded trade logging once caps are enforced",
                      "Full-history journaling for active trading months",
                      "Foundation for future premium analytics",
                    ].map((item) => (
                      <Stack key={item} direction="row" spacing={1} alignItems="flex-start">
                        <CheckCircleIcon color="success" fontSize="small" />
                        <Typography variant="body2">{item}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
              gap: 2,
            }}
          >
            {features.map((feature) => (
              <Card key={feature.title} variant="outlined" sx={{ borderRadius: 1 }}>
                <CardContent>
                  <Stack spacing={1.5}>
                    {feature.icon}
                    <Typography variant="h6" fontWeight={700}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.body}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Stack>
      </Container>
    </>
  );
}
