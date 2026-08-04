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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import type { PnlBucket } from "../api/types";

interface MonthlyCalendarProps {
  daily: PnlBucket[];
  initialMonth?: string; // YYYY-MM or YYYY-MM-DD
  month?: string; // controlled month (YYYY-MM or YYYY-MM-DD)
  onMonthChange?: (month: string, options?: { preserveSelection?: boolean }) => void;
  selectedDate?: string | null;
  onDateSelect?: (date: string) => void;
  draggingTradeId?: string | null;
  onTradeDrop?: (tradeId: string, date: string) => void;
  readOnly?: boolean;
  holidays?: string[];
  valueMode?: "pnl" | "percent";
  marginMode?: "net" | "combined" | "pnl" | "margin";
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

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const observedUsMarketHoliday = (year: number, monthIndex: number, day: number) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const dow = date.getUTCDay();
  if (dow === 6) {
    date.setUTCDate(day - 1);
  } else if (dow === 0) {
    date.setUTCDate(day + 1);
  }
  return date;
};

const observedUsNewYearsDay = (year: number) => {
  const date = new Date(Date.UTC(year, 0, 1));
  if (date.getUTCDay() === 6) {
    return null;
  }
  if (date.getUTCDay() === 0) {
    date.setUTCDate(2);
  }
  return date;
};

const observedCanadianMarketHoliday = (year: number, monthIndex: number, day: number) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const dow = date.getUTCDay();
  if (dow === 6) {
    date.setUTCDate(day + 2);
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

const weekdayOnOrBefore = (year: number, monthIndex: number, day: number, weekday: number) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(day - offset);
  return date;
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

// Trades do not currently carry an exchange/MIC, so holidays are scoped to country-level
// equity market calendars instead of implying that a trade belongs to a specific venue.
type MarketHoliday = {
  date: Date;
  name: string;
  market: "CA" | "US";
};

type CalendarHoliday = {
  label: string;
  tooltip: string;
};

const canadianChristmasHolidays = (year: number): MarketHoliday[] => {
  const reservedDates = new Set<string>();
  const observedDateWithoutCollision = (monthIndex: number, day: number) => {
    const date = new Date(Date.UTC(year, monthIndex, day));
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6 || reservedDates.has(toIsoDate(date))) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    reservedDates.add(toIsoDate(date));
    return date;
  };

  return [
    {
      date: observedDateWithoutCollision(11, 25),
      name: "Christmas Day",
      market: "CA",
    },
    {
      date: observedDateWithoutCollision(11, 26),
      name: "Boxing Day",
      market: "CA",
    },
  ];
};

const holidayCache = new Map<number, Map<string, CalendarHoliday>>();
const getNorthAmericanMarketHolidays = (year: number) => {
  if (holidayCache.has(year)) return holidayCache.get(year)!;

  const usNewYearsHolidays: MarketHoliday[] = [year, year + 1].flatMap((holidayYear) => {
    const date = observedUsNewYearsDay(holidayYear);
    return date
      ? [{ date, name: "New Year's Day", market: "US" }]
      : [];
  });
  const holidays: MarketHoliday[] = [
    ...usNewYearsHolidays,
    {
      date: nthWeekdayOfMonth(year, 0, 1, 3),
      name: "Martin Luther King Jr. Day",
      market: "US",
    },
    {
      date: nthWeekdayOfMonth(year, 1, 1, 3),
      name: "Washington's Birthday",
      market: "US",
    },
    { date: goodFriday(year), name: "Good Friday", market: "US" },
    {
      date: lastWeekdayOfMonth(year, 4, 1),
      name: "Memorial Day",
      market: "US",
    },
    ...(year >= 2022
      ? [{
          date: observedUsMarketHoliday(year, 5, 19),
          name: "Juneteenth National Independence Day",
          market: "US" as const,
        }]
      : []),
    {
      date: observedUsMarketHoliday(year, 6, 4),
      name: "Independence Day",
      market: "US",
    },
    {
      date: nthWeekdayOfMonth(year, 8, 1, 1),
      name: "Labor Day",
      market: "US",
    },
    {
      date: nthWeekdayOfMonth(year, 10, 4, 4),
      name: "Thanksgiving Day",
      market: "US",
    },
    {
      date: observedUsMarketHoliday(year, 11, 25),
      name: "Christmas Day",
      market: "US",
    },
    {
      date: observedCanadianMarketHoliday(year, 0, 1),
      name: "New Year's Day",
      market: "CA",
    },
    {
      date: observedCanadianMarketHoliday(year + 1, 0, 1),
      name: "New Year's Day",
      market: "CA",
    },
    {
      date: nthWeekdayOfMonth(year, 1, 1, 3),
      name: "Family Day",
      market: "CA",
    },
    { date: goodFriday(year), name: "Good Friday", market: "CA" },
    {
      date: weekdayOnOrBefore(year, 4, 24, 1),
      name: "Victoria Day",
      market: "CA",
    },
    {
      date: observedCanadianMarketHoliday(year, 6, 1),
      name: "Canada Day",
      market: "CA",
    },
    {
      date: nthWeekdayOfMonth(year, 7, 1, 1),
      name: "Civic Holiday",
      market: "CA",
    },
    {
      date: nthWeekdayOfMonth(year, 8, 1, 1),
      name: "Labour Day",
      market: "CA",
    },
    {
      date: nthWeekdayOfMonth(year, 9, 1, 2),
      name: "Thanksgiving Day",
      market: "CA",
    },
    ...canadianChristmasHolidays(year),
  ];

  const holidaysByDate = new Map<string, MarketHoliday[]>();
  holidays
    .filter((holiday) => holiday.date.getUTCFullYear() === year)
    .forEach((holiday) => {
      const date = toIsoDate(holiday.date);
      holidaysByDate.set(date, [...(holidaysByDate.get(date) ?? []), holiday]);
    });

  const map = new Map<string, CalendarHoliday>();
  holidaysByDate.forEach((dateHolidays, date) => {
    const orderedHolidays = dateHolidays.sort((a, b) =>
      a.market === b.market ? 0 : a.market === "CA" ? -1 : 1
    );
    const markets = orderedHolidays.map((holiday) => holiday.market);
    const holidayNames = [...new Set(orderedHolidays.map((holiday) => holiday.name))];
    const marketLabel = markets.length === 2 ? "CA/US Holiday" : `${markets[0]} Holiday`;
    map.set(date, {
      label: markets.length === 2 ? "Holiday" : `${markets[0]} Holiday`,
      tooltip: `${marketLabel} — ${holidayNames.join(" · ")}`,
    });
  });
  holidayCache.set(year, map);
  return map;
};

const parseHolidayString = (holiday: string) => {
  const date = holiday.slice(0, 10);
  const remainder = holiday.slice(10).trim();
  const name = remainder.startsWith("T") ? "" : remainder.replace(/^[:\s-]+/, "").trim();
  return [
    date,
    { label: "Holiday", tooltip: name || "Trading holiday" } satisfies CalendarHoliday,
  ] as const;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SWIPE_MIN_DISTANCE_PX = 48;
const TRADE_DRAG_MIME = "application/x-trade-id";
const TRADE_DRAG_PREFIX = "trade:";

export function MonthlyCalendar({
  daily,
  initialMonth,
  month,
  onMonthChange,
  selectedDate,
  onDateSelect,
  draggingTradeId,
  onTradeDrop,
  readOnly = false,
  holidays,
  valueMode = "pnl",
  marginMode = "net",
}: MonthlyCalendarProps) {
  const [activeMonth, setActiveMonth] = useState<Date>(() => toDate(month || initialMonth));
  const pendingFocusDateRef = useRef<string | null>(null);
  const keyboardFocusDateRef = useRef<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);

  useEffect(() => {
    if (month) {
      setActiveMonth(toDate(month));
    }
  }, [month]);

  useEffect(() => {
    const pendingTargetDate = pendingFocusDateRef.current;
    const retainedKeyboardTarget =
      keyboardFocusDateRef.current && selectedDate === keyboardFocusDateRef.current
        ? keyboardFocusDateRef.current
        : null;
    const targetDate = pendingTargetDate || retainedKeyboardTarget;
    if (!targetDate || typeof document === "undefined") {
      return;
    }
    const button = document.querySelector<HTMLButtonElement>(
      `button[data-calendar-date="${targetDate}"]`
    );
    if (button) {
      button.focus();
      if (pendingTargetDate === targetDate) {
        pendingFocusDateRef.current = null;
      }
    }
  }, [activeMonth, selectedDate, daily]);

  useEffect(() => {
    if (!draggingTradeId) {
      setDropTargetDate(null);
    }
  }, [draggingTradeId]);

  const bucketByDate = useMemo(() => {
    const map = new Map<string, PnlBucket>();
    daily.forEach((bucket) => {
      const dayKey = bucket.period.slice(0, 10);
      map.set(dayKey, bucket);
    });
    return map;
  }, [daily]);

  const holidayByDate = useMemo(() => {
    if (holidays && holidays.length > 0) {
      return new Map(holidays.map(parseHolidayString));
    }
    return getNorthAmericanMarketHolidays(activeMonth.getFullYear());
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

  const setVisibleMonthForDate = (date: Date) => {
    const next = new Date(date.getFullYear(), date.getMonth(), 1);
    setActiveMonth(next);
    if (onMonthChange) {
      onMonthChange(`${next.getFullYear()}-${pad2(next.getMonth() + 1)}`, {
        preserveSelection: true,
      });
    }
  };

  const handleDayKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentDate: string
  ) => {
    if (!onDateSelect || readOnly) return;

    const deltaByKey: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltaByKey[event.key];
    if (!delta) {
      return;
    }

    event.preventDefault();
    const nextDate = toDay(currentDate);
    nextDate.setDate(nextDate.getDate() + delta);
    const nextDateIso = toLocalIsoDate(nextDate);
    const nextMonthKey = `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}`;
    const currentMonthKey = `${activeMonth.getFullYear()}-${pad2(activeMonth.getMonth() + 1)}`;

    pendingFocusDateRef.current = nextDateIso;
    keyboardFocusDateRef.current = nextDateIso;
    if (nextMonthKey !== currentMonthKey) {
      setVisibleMonthForDate(nextDate);
    }
    onDateSelect(nextDateIso);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (readOnly || event.changedTouches.length === 0) {
      return;
    }
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (readOnly || event.changedTouches.length === 0) {
      touchStartRef.current = null;
      return;
    }

    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    changeMonth(deltaX < 0 ? 1 : -1);
  };

  const parseTradeIdFromDrop = (event: DragEvent<HTMLElement>) => {
    const byMime = event.dataTransfer.getData(TRADE_DRAG_MIME);
    if (byMime) {
      return byMime;
    }
    const plain = event.dataTransfer.getData("text/plain");
    if (!plain) {
      return null;
    }
    return plain.startsWith(TRADE_DRAG_PREFIX) ? plain.slice(TRADE_DRAG_PREFIX.length) : null;
  };

  return (
    <Paper
      variant="outlined"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-testid="monthly-calendar"
      sx={{ p: 2 }}
    >
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
          {marginMode === "margin"
            ? "Margin per day"
            : marginMode === "combined"
              ? `${valueMode === "percent" ? "Return %" : "P/L"} + margin per day`
              : marginMode === "net"
                ? `${valueMode === "percent" ? "Return %" : "P/L"} - margin per day`
              : valueMode === "percent"
                ? "Return % per day"
                : "P/L per day"}
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
          const bucket = bucketByDate.get(date);
          const netPnl = bucket
            ? valueMode === "percent"
              ? bucket.pnlPercent ?? null
              : bucket.pnl
            : null;
          const marginFee = bucket?.marginFee ?? 0;
          const grossPnl =
            bucket && valueMode === "pnl" ? Number((bucket.pnl + marginFee).toFixed(2)) : netPnl;
          const activePnl = marginMode === "pnl" ? grossPnl : netPnl;
          const cellDate = toDay(date);
          const today = new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const hasTrade = Boolean(bucket);
          const isPastNoTrade = !hasTrade && cellDate < todayStart;
          const holiday = hasTrade ? undefined : holidayByDate.get(date);
          const isHoliday = Boolean(holiday);
          const showHolidayLabel = isHoliday;
          const isSelected = selectedDate === date;
          const color =
            marginMode === "margin" && hasTrade
              ? marginFee > 0
                ? "warning.main"
                : "text.primary"
              : !hasTrade || activePnl == null
              ? showHolidayLabel || isPastNoTrade
                ? "text.disabled"
                : "text.secondary"
              : activePnl > 0
                ? "success.main"
                : activePnl < 0
                  ? "error.main"
                  : "text.primary";
          const backgroundColor = (theme: Theme) => {
            if (showHolidayLabel) {
              return theme.palette.action.disabledBackground;
            }
            if (!hasTrade) {
              if (isPastNoTrade) return theme.palette.action.disabledBackground;
              return "transparent";
            }
            if (marginMode === "margin") {
              return marginFee > 0
                ? alpha(theme.palette.warning.main, 0.14)
                : alpha(theme.palette.text.primary, 0.06);
            }
            if (activePnl == null) {
              return alpha(theme.palette.text.primary, 0.06);
            }
            if (activePnl > 0) return alpha(theme.palette.success.main, 0.12);
            if (activePnl < 0) return alpha(theme.palette.error.main, 0.12);
            return alpha(theme.palette.text.primary, 0.06);
          };

          const selectable = onDateSelect && !readOnly;
          const dropEnabled = Boolean(onTradeDrop) && !readOnly;
          const isDropTarget = dropEnabled && dropTargetDate === date && Boolean(draggingTradeId);
          const formatPnlValue = (value: number | null) =>
            value == null
              ? "—"
              : valueMode === "percent"
                ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
                : value.toFixed(2);
          const netPnlDisplayValue =
            showHolidayLabel
              ? holiday!.label
              : !hasTrade
                ? "—"
                : formatPnlValue(netPnl);
          const pnlOnlyDisplayValue =
            showHolidayLabel
              ? holiday!.label
              : !hasTrade
                ? "—"
                : formatPnlValue(grossPnl);
          const marginDisplayValue = showHolidayLabel ? holiday!.label : !hasTrade ? "—" : marginFee.toFixed(2);
          const displayValue =
            marginMode === "margin"
              ? marginDisplayValue
              : marginMode === "pnl"
                ? pnlOnlyDisplayValue
                : netPnlDisplayValue;
          const holidayDisplayValue =
            holiday && holiday.label !== "Holiday" ? (
              <>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                  Holiday
                </Box>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  {holiday.label}
                </Box>
              </>
            ) : (
              displayValue
            );
          const showMarginLine = marginMode === "combined" && hasTrade && !showHolidayLabel;
          const tradeTooltipTitle =
            marginMode === "margin"
              ? `Margin: ${marginDisplayValue}`
              : marginMode === "combined"
                ? `${valueMode === "percent" ? "Return" : "P/L"}: ${netPnlDisplayValue} / Margin: ${marginDisplayValue}`
                : marginMode === "net"
                  ? `${valueMode === "percent" ? "Return" : "P/L"} - margin: ${netPnlDisplayValue}`
                  : valueMode === "percent"
                    ? `Return: ${pnlOnlyDisplayValue}`
                    : `P/L: ${pnlOnlyDisplayValue}`;
          const tooltipTitle = holiday
            ? holiday.tooltip
            : hasTrade
              ? tradeTooltipTitle
              : "";

          const content = (
            <Box
              component={selectable ? "button" : "div"}
              type={selectable ? "button" : undefined}
              onClick={selectable ? () => onDateSelect?.(date) : undefined}
              onKeyDown={
                selectable
                  ? (event: KeyboardEvent<HTMLButtonElement>) => handleDayKeyDown(event, date)
                  : undefined
              }
              onDragOver={
                dropEnabled
                  ? (event: DragEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (draggingTradeId && dropTargetDate !== date) {
                        setDropTargetDate(date);
                      }
                    }
                  : undefined
              }
              onDragLeave={
                dropEnabled
                  ? () => {
                      if (dropTargetDate === date) {
                        setDropTargetDate(null);
                      }
                    }
                  : undefined
              }
              onDrop={
                dropEnabled
                  ? (event: DragEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      const tradeId = parseTradeIdFromDrop(event) || draggingTradeId;
                      setDropTargetDate(null);
                      if (!tradeId) {
                        return;
                      }
                      onTradeDrop?.(tradeId, date);
                    }
                  : undefined
              }
              aria-label={
                selectable ? `Select ${date}` : undefined
              }
              aria-description={holiday?.tooltip}
              aria-pressed={selectable ? isSelected : undefined}
              data-calendar-date={selectable ? date : undefined}
              data-drop-target={isDropTarget ? "true" : undefined}
              sx={{
                borderRadius: 1,
                p: { xs: 0.5, sm: 0.75 },
                border: "1px solid",
                borderColor: isDropTarget ? "secondary.main" : isSelected ? "primary.main" : "divider",
                textAlign: "center",
                backgroundColor,
                width: "100%",
                cursor: selectable ? "pointer" : "default",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                boxShadow: isDropTarget
                  ? (theme) => `0 0 0 2px ${alpha(theme.palette.secondary.main, 0.25)}`
                  : isSelected
                    ? (theme) => `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
                    : "none",
                backgroundClip: "padding-box",
                appearance: "none",
                outline: "none",
                opacity: showHolidayLabel ? 0.75 : 1,
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
                {holidayDisplayValue}
              </Typography>
              {showMarginLine && (
                <Typography
                  variant="caption"
                  color={marginFee > 0 ? "warning.main" : "text.secondary"}
                  fontWeight={700}
                  sx={{ fontSize: { xs: "0.66rem", sm: "0.7rem" }, display: "block", whiteSpace: "nowrap" }}
                >
                  M {marginDisplayValue}
                </Typography>
              )}
            </Box>
          );

          if (!tooltipTitle) {
            return <Box key={date}>{content}</Box>;
          }

          return (
            <Tooltip
              key={date}
              title={tooltipTitle}
              describeChild
            >
              <span>{content}</span>
            </Tooltip>
          );
        })}
      </Box>
    </Paper>
  );
}
