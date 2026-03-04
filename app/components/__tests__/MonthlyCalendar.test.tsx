// @ts-nocheck
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MonthlyCalendar } from "../MonthlyCalendar";
import { vi } from "vitest";

describe("MonthlyCalendar", () => {
  const daily = [
    { period: "2024-05-02", pnl: 10, trades: 1 },
    { period: "2024-05-03", pnl: -5, trades: 2 },
  ];

  afterEach(() => {
    cleanup();
  });

  it("renders daily P/L values for the month", () => {
    render(<MonthlyCalendar daily={daily} initialMonth="2024-05-01" />);

    expect(screen.getByText(/may 2024/i)).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("-5.00")).toBeInTheDocument();
  });

  it("navigates between months", async () => {
    render(<MonthlyCalendar daily={daily} initialMonth="2024-05-01" />);

    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByText(/june 2024/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByText(/may 2024/i)).toBeInTheDocument();
  });

  it("notifies when a date is selected", async () => {
    const onDateSelect = vi.fn();
    render(
      <MonthlyCalendar
        daily={daily}
        initialMonth="2024-05-01"
        onDateSelect={onDateSelect}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /select 2024-05-02/i }));
    expect(onDateSelect).toHaveBeenCalledWith("2024-05-02");
  });

  it("allows selecting holiday dates", async () => {
    const onDateSelect = vi.fn();
    render(
      <MonthlyCalendar
        daily={[]}
        initialMonth="2024-05-01"
        onDateSelect={onDateSelect}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /select 2024-05-27/i }));
    expect(onDateSelect).toHaveBeenCalledWith("2024-05-27");
    expect(screen.getByText(/holiday/i)).toBeInTheDocument();
  });

  it("keeps keyboard day navigation working after crossing months and rerendering", async () => {
    function Harness() {
      const [month, setMonth] = React.useState("2024-05");
      const [selectedDate, setSelectedDate] = React.useState("2024-05-31");
      const [dailyData, setDailyData] = React.useState([]);

      React.useEffect(() => {
        if (month !== "2024-06" || dailyData.length > 0) return;
        queueMicrotask(() => {
          setDailyData([{ period: "2024-06-01", pnl: 5, trades: 1 }]);
        });
      }, [month, dailyData.length]);

      return (
        <MonthlyCalendar
          daily={dailyData}
          month={month}
          onMonthChange={setMonth}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
        />
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    const may31 = screen.getByRole("button", { name: /select 2024-05-31/i });
    await user.click(may31);
    expect(document.activeElement).toBe(may31);

    await user.keyboard("{ArrowRight}");

    await waitFor(() => {
      expect(screen.getByText(/june 2024/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("5.00")).toBeInTheDocument();
    });

    const june1 = screen.getByRole("button", { name: /select 2024-06-01/i });
    expect(document.activeElement).toBe(june1);

    await user.keyboard("{ArrowRight}");
    const june2 = screen.getByRole("button", { name: /select 2024-06-02/i });
    expect(document.activeElement).toBe(june2);
  });

  it("supports swiping left and right to change months on mobile", () => {
    render(<MonthlyCalendar daily={daily} initialMonth="2024-05-01" />);

    const calendar = screen.getByTestId("monthly-calendar");
    expect(screen.getByText(/may 2024/i)).toBeInTheDocument();

    fireEvent.touchStart(calendar, {
      changedTouches: [{ clientX: 300, clientY: 120 }],
    });
    fireEvent.touchEnd(calendar, {
      changedTouches: [{ clientX: 160, clientY: 125 }],
    });
    expect(screen.getByText(/june 2024/i)).toBeInTheDocument();

    fireEvent.touchStart(calendar, {
      changedTouches: [{ clientX: 120, clientY: 120 }],
    });
    fireEvent.touchEnd(calendar, {
      changedTouches: [{ clientX: 260, clientY: 115 }],
    });
    expect(screen.getByText(/may 2024/i)).toBeInTheDocument();
  });

  it("supports dropping a trade onto a day cell", () => {
    const onTradeDrop = vi.fn();
    render(
      <MonthlyCalendar
        daily={daily}
        initialMonth="2024-05-01"
        onDateSelect={vi.fn()}
        draggingTradeId="trade-123"
        onTradeDrop={onTradeDrop}
      />
    );

    const day = screen.getByRole("button", { name: /select 2024-05-03/i });
    const dataTransfer = {
      getData: (_: string) => "",
      dropEffect: "none",
    };

    fireEvent.dragOver(day, { dataTransfer });
    expect(day).toHaveAttribute("data-drop-target", "true");
    fireEvent.drop(day, { dataTransfer });

    expect(onTradeDrop).toHaveBeenCalledWith("trade-123", "2024-05-03");
  });
});
