import { describe, expect, it } from "vitest";
import { computeClosingMonthMarginFee } from "../utils/tradeMath";

// $1,000 notional at 36.5% accrues $1.00 of margin per day.
const marginTrade = {
  entryPrice: 100,
  quantity: 10,
  assetType: "STOCK" as const,
  marginRate: 36.5,
};

describe("computeClosingMonthMarginFee", () => {
  it("returns only the margin accrued in the closing month", () => {
    expect(computeClosingMonthMarginFee({ ...marginTrade, openedAt: "2024-01-15", closedAt: "2024-03-10" })).toBe(9);
  });

  it("returns the full margin when the trade opens in its closing month", () => {
    expect(computeClosingMonthMarginFee({ ...marginTrade, openedAt: "2024-03-01", closedAt: "2024-03-10" })).toBe(9);
  });

  it("returns zero when the trade closes on the first of a month", () => {
    expect(computeClosingMonthMarginFee({ ...marginTrade, openedAt: "2024-01-21", closedAt: "2024-02-01" })).toBe(0);
  });

  it("returns zero without a margin rate", () => {
    expect(
      computeClosingMonthMarginFee({ ...marginTrade, marginRate: 0, openedAt: "2024-01-01", closedAt: "2024-03-10" })
    ).toBe(0);
  });
});
