import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import {
  Box,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import type { PnlBucket } from "../api/types";

interface MonthlyCalendarProps {
  daily: PnlBucket[];
  initialMonth?: string; // YYYY-MM or YYYY-MM-DD
  month?: string; // controlled month (YYYY-MM or YYYY-MM-DD)
  onMonthChange?: (month: string) => void;
  selectedDate?: string | null;
  onDateSelect?: (date: string) => void;
}

function toDate(value?: string) {
  if (!value) return new Date();
  const parts = value.split("-");
  if (parts.length >= 2) {
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      return new Date(year, month, 1);
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toDay(value: string) {
  const parts = value.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (!parts.some((p) => Number.isNaN(Number(p)))) {
      return new Date(year, month - 1, day);
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthlyCalendar({
  daily,
  initialMonth,
  month,
  onMonthChange,
  selectedDate,
  onDateSelect,
}: MonthlyCalendarProps) {
  const [activeMonth, setActiveMonth] = useState<Date>(() => toDate(month || initialMonth));

  useEffect(() => {
    if (month) {
      setActiveMonth(toDate(month));
    }
  }, [month]);

  const pnlByDate = useMemo(() => {
    const map = new Map<string, number>();
    daily.forEach((bucket) => {
      const dayKey = bucket.period.slice(0, 10);
      map.set(dayKey, bucket.pnl);
    });
    return map;
  }, [daily]);

  const firstDay = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
  const daysInMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const cellDates: Array<string | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      return `${activeMonth.getFullYear()}-${String(activeMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }),
  ];

  const monthLabel = activeMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const changeMonth = (delta: number) => {
    setActiveMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      if (onMonthChange) {
        const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        onMonthChange(key);
      }
      return next;
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ArrowBackIosNewIcon fontSize="small" />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={700}>
            {monthLabel}
          </Typography>
          <IconButton size="small" onClick={() => changeMonth(1)} aria-label="Next month">
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          P/L per day
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 0.5,
        }}
      >
        {weekdayLabels.map((label) => (
          <Typography
            key={label}
            variant="caption"
            color="text.secondary"
            textAlign="center"
          >
            {label}
          </Typography>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
        }}
      >
        {cellDates.map((date, idx) => {
          if (!date) {
            return <Box key={`blank-${idx}`} />;
          }
          const dayNumber = Number(date.split("-")[2]);
          const pnl = pnlByDate.get(date) ?? null;
          const cellDate = toDay(date);
          const today = new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isPastNoTrade = pnl == null && cellDate < todayStart;
          const isSelected = selectedDate === date;
          const color =
            pnl == null
              ? isPastNoTrade
                ? "text.disabled"
                : "text.secondary"
              : pnl > 0
                ? "success.main"
                : pnl < 0
                  ? "error.main"
                  : "text.primary";
          const backgroundColor = (theme: Theme) => {
            if (pnl == null) {
              if (isPastNoTrade) return theme.palette.action.disabledBackground;
              return "transparent";
            }
            if (pnl > 0) return alpha(theme.palette.success.main, 0.12);
            if (pnl < 0) return alpha(theme.palette.error.main, 0.12);
            return alpha(theme.palette.text.primary, 0.06);
          };

          const content = (
            <Box
              component={onDateSelect ? "button" : "div"}
              type={onDateSelect ? "button" : undefined}
              onClick={onDateSelect ? () => onDateSelect(date) : undefined}
              aria-label={onDateSelect ? `Select ${date}` : undefined}
              aria-pressed={onDateSelect ? isSelected : undefined}
              sx={{
                borderRadius: 1,
                p: 0.75,
                border: "1px solid",
                borderColor: isSelected ? "primary.main" : "divider",
                textAlign: "center",
                backgroundColor,
                width: "100%",
                cursor: onDateSelect ? "pointer" : "default",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                boxShadow: isSelected ? (theme) => `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}` : "none",
                backgroundClip: "padding-box",
                appearance: "none",
                outline: "none",
              }}
            >
              <Typography variant="body2" fontWeight={600}>
                {dayNumber}
              </Typography>
              <Typography variant="caption" color={color} fontWeight={700}>
                {pnl == null ? "—" : pnl.toFixed(2)}
              </Typography>
            </Box>
          );

          return pnl == null ? (
            <Box key={date}>{content}</Box>
          ) : (
            <Tooltip key={date} title={`P/L: ${pnl.toFixed(2)}`}>
              <span>{content}</span>
            </Tooltip>
          );
        })}
      </Box>
    </Paper>
  );
}
