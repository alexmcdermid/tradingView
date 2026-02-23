import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetType,
  Currency,
  OptionType,
  TradeDirection,
  TradingAccount,
} from "../api/types";
import { computeMarginFee, computeRealizedPnl } from "../utils/tradeMath";

export interface TradeFormValues {
  symbol: string;
  currency: Currency;
  assetType: AssetType;
  direction: TradeDirection;
  quantity: number | "";
  entryPrice: number | "";
  exitPrice: number | "";
  fees: number | "";
  marginRate: number | "";
  accountId?: string;
  optionType?: OptionType;
  strikePrice?: number | "";
  expiryDate?: string;
  openedAt: string;
  closedAt: string;
  notes?: string;
}

interface TradeDialogProps {
  open: boolean;
  initialValues?: Partial<TradeFormValues>;
  isEditing?: boolean;
  accounts?: TradingAccount[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: TradeFormValues) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function accountFeeForAsset(account: TradingAccount, assetType: AssetType) {
  const stockFeeRaw = Number(account.defaultStockFees);
  const optionFeeRaw = Number(account.defaultOptionFees);
  const stockFee = Number.isFinite(stockFeeRaw) ? stockFeeRaw : 0;
  const optionFee = Number.isFinite(optionFeeRaw) ? optionFeeRaw : 0;
  return assetType === "OPTION" ? optionFee : stockFee;
}

function accountFeesForTrade(
  account: TradingAccount,
  assetType: AssetType,
  quantity: number | "" | undefined
) {
  const baseFee = accountFeeForAsset(account, assetType);
  if (assetType !== "OPTION") {
    return baseFee;
  }
  const contracts = typeof quantity === "number" && Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  return Number((baseFee * contracts).toFixed(2));
}

function accountMarginForCurrency(account: TradingAccount, currency: Currency) {
  const usdMarginRaw = Number(account.defaultMarginRateUsd);
  const cadMarginRaw = Number(account.defaultMarginRateCad);
  const usdMargin = Number.isFinite(usdMarginRaw) ? usdMarginRaw : 0;
  const cadMargin = Number.isFinite(cadMarginRaw) ? cadMarginRaw : 0;
  return currency === "CAD" ? cadMargin : usdMargin;
}

function accountMarginForTrade(
  account: TradingAccount,
  currency: Currency,
  assetType: AssetType,
  direction: TradeDirection
) {
  // Default covered short options to no margin borrowing cost (covered/cash secured); user can override manually.
  if (assetType === "OPTION" && direction === "SHORT") {
    return 0;
  }
  return accountMarginForCurrency(account, currency);
}

function computePnl(values: TradeFormValues) {
  const quantity = values.quantity === "" ? null : Number(values.quantity);
  const entry = values.entryPrice === "" ? null : Number(values.entryPrice);
  const exit = values.exitPrice === "" ? null : Number(values.exitPrice);
  const fees = values.fees === "" || values.fees === undefined ? 0 : Number(values.fees);
  const marginRate = values.marginRate === "" || values.marginRate === undefined ? 0 : Number(values.marginRate);

  if (
    quantity === null ||
    entry === null ||
    exit === null ||
    Number.isNaN(quantity) ||
    Number.isNaN(entry) ||
    Number.isNaN(exit)
  ) {
    return null;
  }

  return computeRealizedPnl({
    entryPrice: entry,
    exitPrice: exit,
    quantity,
    assetType: values.assetType,
    direction: values.direction,
    fees,
    marginRate,
    openedAt: values.openedAt,
    closedAt: values.closedAt,
  });
}

export function TradeDialog({
  open,
  initialValues,
  isEditing = false,
  accounts = [],
  submitting,
  onClose,
  onSubmit,
}: TradeDialogProps) {
  const exitPriceTouched = useRef(false);
  const defaults: TradeFormValues = {
    symbol: "",
    currency: "USD",
    assetType: "STOCK",
    direction: "LONG",
    quantity: "",
    entryPrice: "",
    exitPrice: "",
    fees: "",
    marginRate: "",
    accountId: "",
    optionType: "CALL",
    strikePrice: "",
    expiryDate: today(),
    openedAt: today(),
    closedAt: today(),
    notes: "",
  };

  const [values, setValues] = useState<TradeFormValues>({
    ...defaults,
    ...initialValues,
  });

  useEffect(() => {
    if (open) {
      setValues({
        ...defaults,
        ...initialValues,
      });
      exitPriceTouched.current =
        initialValues?.exitPrice !== undefined && initialValues.exitPrice !== "";
    }
  }, [open, initialValues]);

  const isOption = values.assetType === "OPTION";
  const pnlPreview = useMemo(() => computePnl(values), [values]);
  const marginRateValue =
    values.marginRate === "" || values.marginRate === undefined ? 0 : Number(values.marginRate);
  const marginFeePreview = useMemo(
    () =>
      computeMarginFee({
        entryPrice: values.entryPrice === "" ? null : Number(values.entryPrice),
        quantity: values.quantity === "" ? null : Number(values.quantity),
        assetType: values.assetType,
        marginRate: marginRateValue,
        openedAt: values.openedAt,
        closedAt: values.closedAt,
      }),
    [values, marginRateValue]
  );

  const handleChange =
    (field: keyof TradeFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleNumericChange =
    (field: keyof TradeFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = event.target.value;
      if (raw === "") {
        setValues((prev) => {
          const next = { ...prev, [field]: "" };
          if (field === "quantity" && prev.accountId && prev.assetType === "OPTION") {
            const selectedAccount = accounts.find((account) => account.id === prev.accountId);
            if (selectedAccount) {
              next.fees = accountFeesForTrade(selectedAccount, prev.assetType, "");
            }
          }
          return next;
        });
        if (field === "exitPrice") {
          exitPriceTouched.current = true;
        }
        return;
      }
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      setValues((prev) => {
        const next = { ...prev, [field]: parsed };
        if (field === "entryPrice" && !exitPriceTouched.current) {
          next.exitPrice = prev.direction === "SHORT" ? 0 : parsed;
        }
        if (field === "quantity" && prev.accountId && prev.assetType === "OPTION") {
          const selectedAccount = accounts.find((account) => account.id === prev.accountId);
          if (selectedAccount) {
            next.fees = accountFeesForTrade(selectedAccount, prev.assetType, parsed);
          }
        }
        return next;
      });
      if (field === "exitPrice") {
        exitPriceTouched.current = true;
      }
    };

  const handleSubmit = () => {
    if (!values.symbol.trim()) return;
    if (
      isOption &&
      (values.strikePrice === "" || !values.strikePrice || !values.expiryDate)
    ) {
      return;
    }

    onSubmit({
      ...values,
      symbol: values.symbol.trim(),
      accountId: values.accountId || undefined,
      strikePrice: values.strikePrice === "" ? undefined : values.strikePrice,
      fees: values.fees === "" ? 0 : values.fees,
      marginRate: values.marginRate === "" ? 0 : values.marginRate,
      quantity: values.quantity === "" ? 0 : values.quantity,
      entryPrice: values.entryPrice === "" ? 0 : values.entryPrice,
      exitPrice: values.exitPrice === "" ? 0 : values.exitPrice,
      notes: values.notes?.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{isEditing ? "Edit Trade" : "New Trade"}</DialogTitle>
      <DialogContent dividers>
          <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Symbol"
              value={values.symbol}
              onChange={handleChange("symbol")}
              required
              fullWidth
              inputProps={{ maxLength: 12, style: { textTransform: "uppercase" } }}
            />
            <ToggleButtonGroup
              exclusive
              value={values.currency}
              onChange={(_, value) =>
                value &&
                setValues((prev) => {
                  const nextCurrency = value as Currency;
                  const selectedAccount = prev.accountId
                    ? accounts.find((account) => account.id === prev.accountId)
                    : undefined;
                  return {
                    ...prev,
                    currency: nextCurrency,
                    marginRate: selectedAccount
                      ? accountMarginForTrade(
                          selectedAccount,
                          nextCurrency,
                          prev.assetType,
                          prev.direction
                        )
                      : prev.marginRate,
                  };
                })
              }
            >
              <ToggleButton value="USD">USD</ToggleButton>
              <ToggleButton value="CAD">CAD</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              value={values.assetType}
              onChange={(_, value) =>
                value &&
                setValues((prev) => {
                  const nextAssetType = value as AssetType;
                  const selectedAccount = prev.accountId
                    ? accounts.find((account) => account.id === prev.accountId)
                    : undefined;
                  return {
                    ...prev,
                    assetType: nextAssetType,
                    optionType: value === "OPTION" ? prev.optionType || "CALL" : undefined,
                    strikePrice: value === "OPTION" ? prev.strikePrice : "",
                    expiryDate: value === "OPTION" ? today() : "",
                    fees: selectedAccount
                      ? accountFeesForTrade(selectedAccount, nextAssetType, prev.quantity)
                      : prev.fees,
                    marginRate: selectedAccount
                      ? accountMarginForTrade(
                          selectedAccount,
                          prev.currency,
                          nextAssetType,
                          prev.direction
                        )
                      : prev.marginRate,
                  };
                })
              }
            >
              <ToggleButton value="STOCK">Stock</ToggleButton>
              <ToggleButton value="OPTION">Option</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              value={values.direction}
              onChange={(_, value) =>
                value &&
                setValues((prev) => {
                  const nextDirection = value as TradeDirection;
                  const selectedAccount = prev.accountId
                    ? accounts.find((account) => account.id === prev.accountId)
                    : undefined;
                  const nextValues = {
                    ...prev,
                    direction: nextDirection,
                    marginRate: selectedAccount
                      ? accountMarginForTrade(
                          selectedAccount,
                          prev.currency,
                          prev.assetType,
                          nextDirection
                        )
                      : prev.marginRate,
                  };
                  if (!exitPriceTouched.current) {
                    nextValues.exitPrice =
                      nextDirection === "SHORT"
                        ? 0
                        : prev.entryPrice === ""
                          ? ""
                          : prev.entryPrice;
                  }
                  return nextValues;
                })
              }
            >
              <ToggleButton value="LONG">Long</ToggleButton>
              <ToggleButton value="SHORT">Short</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <FormControl fullWidth>
            <InputLabel id="account-label">Account (Optional - Setup in Account Dropdown)</InputLabel>
            <Select
              labelId="account-label"
              label="Account (Optional)"
              value={values.accountId || ""}
              onChange={(event) => {
                const accountId = event.target.value;
                const selected = accounts.find((account) => account.id === accountId);
                setValues((prev) => ({
                  ...prev,
                  accountId,
                  fees: selected
                    ? accountFeesForTrade(selected, prev.assetType, prev.quantity)
                    : prev.fees,
                  marginRate: selected
                    ? accountMarginForTrade(
                        selected,
                        prev.currency,
                        prev.assetType,
                        prev.direction
                      )
                    : prev.marginRate,
                }));
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Quantity"
              type="number"
              value={values.quantity}
              onChange={handleNumericChange("quantity")}
              fullWidth
              inputProps={{ min: 0, step: 1 }}
            />
            <TextField
              label="Entry Price"
              type="number"
              value={values.entryPrice}
              onChange={handleNumericChange("entryPrice")}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              label="Exit Price"
              type="number"
              value={values.exitPrice}
              onChange={handleNumericChange("exitPrice")}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Fees"
              type="number"
              value={values.fees}
              onChange={handleNumericChange("fees")}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              label="Margin Rate (%)"
              type="number"
              value={values.marginRate}
              onChange={handleNumericChange("marginRate")}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
              helperText={
                marginRateValue > 0
                  ? `Est. margin fee: ${marginFeePreview.toFixed(2)} ${values.currency}`
                  : undefined
              }
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Opened"
              type="date"
              value={values.openedAt}
              onChange={handleChange("openedAt")}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Closed"
              type="date"
              value={values.closedAt}
              onChange={handleChange("closedAt")}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          {isOption && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="option-type-label">Option Type</InputLabel>
                <Select
                  labelId="option-type-label"
                  label="Option Type"
                  value={values.optionType || ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      optionType: event.target.value as OptionType,
                    }))
                  }
                >
                  <MenuItem value="CALL">Call</MenuItem>
                  <MenuItem value="PUT">Put</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Strike"
                type="number"
                value={values.strikePrice}
                onChange={handleNumericChange("strikePrice")}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                label="Expiry"
                type="date"
                value={values.expiryDate}
                onChange={handleChange("expiryDate")}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}

          <TextField
            label="Notes"
            value={values.notes || ""}
            onChange={handleChange("notes")}
            fullWidth
            minRows={3}
            multiline
          />

          <Divider />
          <Typography variant="body2" color="text.secondary">
            Realized P/L preview:{" "}
            <Typography
              component="span"
              fontWeight={700}
              color={
                pnlPreview == null
                  ? "text.secondary"
                  : pnlPreview >= 0
                    ? "success.main"
                    : "error.main"
              }
            >
              {pnlPreview == null ? "—" : pnlPreview.toFixed(2)}
            </Typography>
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            !values.symbol ||
            values.quantity === "" ||
            values.entryPrice === "" ||
            values.exitPrice === "" ||
            (isOption && (!values.optionType || values.strikePrice === "" || !values.expiryDate))
          }
        >
          {submitting ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
