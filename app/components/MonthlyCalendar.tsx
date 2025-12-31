import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import {
  Box,
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
  readOnly?: boolean;
  holidays?: string[];
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

const pad2 = (value: number) => String(value).padStart(2, "0");

const toIsoDate = (date: Date) =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;

const observedDate = (year: number, monthIndex: number, day: number) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const dow = date.getUTCDay();
  if (dow === 6) {
    date.setUTCDate(day - 1);
  } else if (dow === 0) {
    date.setUTCDate(day + 1);
  }
  return date;
};

const nthWeekdayOfMonth = (year: number, monthIndex: number, weekday: number, nth: number) => {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + offset + 7 * (nth - 1)));
};

const lastWeekdayOfMonth = (year: number, monthIndex: number, weekday: number) => {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, monthIndex + 1, 0 - offset));
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
};

const goodFriday = (year: number) => {
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() - 2);
  return easter;
};

const holidayCache = new Map<number, Set<string>>();
const getUsMarketHolidays = (year: number) => {
  if (holidayCache.has(year)) return holidayCache.get(year)!;

  const holidays = [
    observedDate(year, 0, 1), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // Martin Luther King Jr. Day (3rd Monday Jan)
    nthWeekdayOfMonth(year, 1, 1, 3), // Presidents Day (3rd Monday Feb)
    goodFriday(year),
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day (last Monday May)
    observedDate(year, 5, 19), // Juneteenth
    observedDate(year, 6, 4), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day (1st Monday Sept)
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving (4th Thursday Nov)
    observedDate(year, 11, 25), // Christmas Day
  ];

  const set = new Set(holidays.map(toIsoDate));
  holidayCache.set(year, set);
  return set;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthlyCalendar({
  daily,
  initialMonth,
  month,
  onMonthChange,
  selectedDate,
  onDateSelect,
  readOnly = false,
  holidays,
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

  const holidaySet = useMemo(() => {
    if (holidays && holidays.length > 0) {
      return new Set(holidays.map((h) => h.slice(0, 10)));
    }
    return getUsMarketHolidays(activeMonth.getFullYear());
  }, [activeMonth, holidays]);

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
    if (readOnly) return;
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
          {!readOnly && (
            <IconButton
              size="small"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
            >
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="subtitle1" fontWeight={700}>
            {monthLabel}
          </Typography>
          {!readOnly && (
            <IconButton
              size="small"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
            >
              <ArrowForwardIosIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          P/L per day
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: { xs: 0.25, sm: 0.5 },
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
          gap: { xs: 0.25, sm: 0.5 },
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
          const isHoliday = holidaySet.has(date);
          const isSelected = selectedDate === date;
          const color =
            pnl == null || isHoliday
              ? isPastNoTrade
                ? "text.disabled"
                : "text.secondary"
              : pnl > 0
                ? "success.main"
                : pnl < 0
                  ? "error.main"
                  : "text.primary";
          const backgroundColor = (theme: Theme) => {
            if (isHoliday) {
              return theme.palette.action.disabledBackground;
            }
            if (pnl == null) {
              if (isPastNoTrade) return theme.palette.action.disabledBackground;
              return "transparent";
            }
            if (pnl > 0) return alpha(theme.palette.success.main, 0.12);
            if (pnl < 0) return alpha(theme.palette.error.main, 0.12);
            return alpha(theme.palette.text.primary, 0.06);
          };

          const selectable = onDateSelect && !readOnly && !isHoliday;
          const displayValue =
            isHoliday ? "Closed" : pnl == null ? "—" : pnl.toFixed(2);

          const content = (
            <Box
              component={selectable ? "button" : "div"}
              type={selectable ? "button" : undefined}
              onClick={selectable ? () => onDateSelect?.(date) : undefined}
              aria-label={selectable ? `Select ${date}` : undefined}
              aria-pressed={selectable ? isSelected : undefined}
              sx={{
                borderRadius: 1,
                p: { xs: 0.5, sm: 0.75 },
                border: "1px solid",
                borderColor: isSelected ? "primary.main" : "divider",
                textAlign: "center",
                backgroundColor,
                width: "100%",
                cursor: selectable ? "pointer" : "default",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                boxShadow: isSelected ? (theme) => `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}` : "none",
                backgroundClip: "padding-box",
                appearance: "none",
                outline: "none",
                opacity: isHoliday ? 0.75 : 1,
              }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ fontSize: { xs: "0.85rem", sm: "0.95rem" } }}>
                {dayNumber}
              </Typography>
              <Typography
                variant="caption"
                color={color}
                fontWeight={700}
                sx={{ fontSize: { xs: "0.7rem", sm: "0.75rem" }, display: "block", whiteSpace: "nowrap" }}
              >
                {displayValue}
              </Typography>
            </Box>
          );

          return pnl == null || isHoliday ? (
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
