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
import type { AssetType, Currency, OptionType, TradeDirection } from "../api/types";

export interface TradeFormValues {
  symbol: string;
  currency: Currency;
  assetType: AssetType;
  direction: TradeDirection;
  quantity: number | "";
  entryPrice: number | "";
  exitPrice: number | "";
  fees: number | "";
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
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: TradeFormValues) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function computePnl(values: TradeFormValues) {
  const quantity = Number(values.quantity);
  const entry = Number(values.entryPrice);
  const exit = Number(values.exitPrice);
  const fees = values.fees === "" || values.fees === undefined ? 0 : Number(values.fees);

  if (
    values.quantity === "" ||
    values.entryPrice === "" ||
    values.exitPrice === "" ||
    Number.isNaN(quantity) ||
    Number.isNaN(entry) ||
    Number.isNaN(exit)
  ) {
    return null;
  }

  const directionMultiplier = values.direction === "SHORT" ? -1 : 1;
  const movement = (exit - entry) * directionMultiplier;
  const multiplier = values.assetType === "OPTION" ? 100 : 1;
  return Number((movement * quantity * multiplier - fees).toFixed(2));
}

export function TradeDialog({
  open,
  initialValues,
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
        setValues((prev) => ({ ...prev, [field]: "" }));
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
          next.exitPrice = parsed;
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
      strikePrice: values.strikePrice === "" ? undefined : values.strikePrice,
      fees: values.fees === "" ? 0 : values.fees,
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
      disableRestoreFocus
    >
      <DialogTitle>{initialValues ? "Edit Trade" : "New Trade"}</DialogTitle>
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
              onChange={(_, value) => value && setValues((prev) => ({ ...prev, currency: value }))}
            >
              <ToggleButton value="USD">USD</ToggleButton>
              <ToggleButton value="CAD">CAD</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              value={values.assetType}
              onChange={(_, value) =>
                value &&
                setValues((prev) => ({
                  ...prev,
                  assetType: value as AssetType,
                  optionType: value === "OPTION" ? prev.optionType || "CALL" : undefined,
                  strikePrice: value === "OPTION" ? prev.strikePrice : "",
                  expiryDate: value === "OPTION" ? today() : "",
                }))
              }
            >
              <ToggleButton value="STOCK">Stock</ToggleButton>
              <ToggleButton value="OPTION">Option</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              value={values.direction}
              onChange={(_, value) => value && setValues((prev) => ({ ...prev, direction: value }))}
            >
              <ToggleButton value="LONG">Long</ToggleButton>
              <ToggleButton value="SHORT">Short</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

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
