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
import { useEffect, useMemo, useState } from "react";
import type { AssetType, OptionType, TradeDirection } from "../api/types";

export interface TradeFormValues {
  symbol: string;
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
  if (
    values.quantity === "" ||
    values.entryPrice === "" ||
    values.exitPrice === "" ||
    !values.quantity ||
    !values.entryPrice ||
    !values.exitPrice
  ) {
    return null;
  }
  const quantity = Number(values.quantity);
  const entry = Number(values.entryPrice);
  const exit = Number(values.exitPrice);
  const fees = values.fees ? Number(values.fees) : 0;
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
  const defaults: TradeFormValues = {
    symbol: "",
    assetType: "STOCK",
    direction: "LONG",
    quantity: "",
    entryPrice: "",
    exitPrice: "",
    fees: "",
    optionType: "CALL",
    strikePrice: "",
    expiryDate: "",
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
        return;
      }
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      setValues((prev) => ({ ...prev, [field]: parsed }));
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
            <FormControl fullWidth>
              <InputLabel id="asset-type-label">Asset</InputLabel>
              <Select
                labelId="asset-type-label"
                label="Asset"
                value={values.assetType}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    assetType: event.target.value as AssetType,
                    optionType: event.target.value === "OPTION" ? prev.optionType || "CALL" : undefined,
                    strikePrice: event.target.value === "OPTION" ? prev.strikePrice : "",
                    expiryDate: event.target.value === "OPTION" ? prev.expiryDate : "",
                  }))
                }
              >
                <MenuItem value="STOCK">Stock</MenuItem>
                <MenuItem value="OPTION">Option</MenuItem>
              </Select>
            </FormControl>
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
