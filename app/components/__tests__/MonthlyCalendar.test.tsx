// @ts-nocheck
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MonthlyCalendar } from "../MonthlyCalendar";

describe("MonthlyCalendar", () => {
  const daily = [
    { period: "2024-05-02", pnl: 10, trades: 1 },
    { period: "2024-05-03", pnl: -5, trades: 2 },
  ];

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
});
