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

  it("can show net P/L, gross P/L, margin, or P/L with margin", () => {
    const marginDaily = [{ period: "2024-05-02", pnl: 10, trades: 1, marginFee: 1.25 }];
    const { rerender } = render(
      <MonthlyCalendar daily={marginDaily} initialMonth="2024-05-01" />
    );

    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.queryByText("M 1.25")).not.toBeInTheDocument();

    rerender(
      <MonthlyCalendar daily={marginDaily} initialMonth="2024-05-01" marginMode="pnl" />
    );
    expect(screen.getByText("11.25")).toBeInTheDocument();
    expect(screen.queryByText("M 1.25")).not.toBeInTheDocument();

    rerender(
      <MonthlyCalendar daily={marginDaily} initialMonth="2024-05-01" marginMode="margin" />
    );
    expect(screen.getByText("1.25")).toBeInTheDocument();
    expect(screen.queryByText("10.00")).not.toBeInTheDocument();

    rerender(
      <MonthlyCalendar daily={marginDaily} initialMonth="2024-05-01" marginMode="combined" />
    );
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("M 1.25")).toBeInTheDocument();
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

  it("lists country holiday labels and names the holiday in the tooltip", async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    render(
      <MonthlyCalendar
        daily={[]}
        initialMonth="2024-05-01"
        onDateSelect={onDateSelect}
      />
    );

    const memorialDay = screen.getByRole("button", {
      name: /select 2024-05-27/i,
    });
    expect(memorialDay).toHaveAccessibleDescription("Memorial Day");
    await user.click(memorialDay);
    expect(onDateSelect).toHaveBeenCalledWith("2024-05-27");
    expect(screen.getByText("US Holiday")).toBeInTheDocument();

    await user.hover(memorialDay);
    expect(await screen.findByText("Memorial Day")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /select 2024-05-20/i })).toHaveAccessibleDescription(
      "Victoria Day"
    );
    expect(screen.getByText("CA Holiday")).toBeInTheDocument();
  });

  it("identifies dates when both Canadian and U.S. markets are closed", async () => {
    const user = userEvent.setup();
    render(
      <MonthlyCalendar
        daily={[]}
        initialMonth="2024-03-01"
        onDateSelect={vi.fn()}
      />
    );

    const goodFriday = screen.getByRole("button", {
      name: /select 2024-03-29/i,
    });
    expect(goodFriday).toHaveAccessibleDescription("Good Friday");
    expect(screen.getByText("Holiday")).toBeInTheDocument();

    await user.hover(goodFriday);
    expect(await screen.findByText("Good Friday")).toBeInTheDocument();
  });

  it("does not observe a Saturday U.S. New Year's Day on the prior Friday", () => {
    render(
      <MonthlyCalendar
        daily={[]}
        initialMonth="2027-12-01"
        onDateSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /select 2027-12-31/i })).not.toHaveAttribute(
      "aria-description"
    );
  });

  it("treats holiday dates with trades as normal trading days", async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    render(
      <MonthlyCalendar
        daily={[{ period: "2024-05-27", pnl: 42, trades: 1 }]}
        initialMonth="2024-05-01"
        onDateSelect={onDateSelect}
      />
    );

    const memorialDayWithTrade = screen.getByRole("button", {
      name: "Select 2024-05-27",
    });
    expect(screen.getByText("42.00")).toBeInTheDocument();
    expect(screen.queryByText("Holiday")).not.toBeInTheDocument();

    await user.click(memorialDayWithTrade);
    expect(onDateSelect).toHaveBeenCalledWith("2024-05-27");

    await user.hover(memorialDayWithTrade);
    expect(await screen.findByText("P/L - margin: 42.00")).toBeInTheDocument();
    expect(screen.queryByText("Memorial Day")).not.toBeInTheDocument();
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
