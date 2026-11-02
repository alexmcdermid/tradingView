import { describe, expect, it } from "vitest";
import { computeMarginFee, computeMonthlyMarginCharges, sumMarginCharges } from "../utils/tradeMath";

// $1,000 notional at 36.5% accrues $1.00 of margin per day.
const marginTrade = {
  entryPrice: 100,
  quantity: 10,
  assetType: "STOCK" as const,
  marginRate: 36.5,
};

describe("computeMonthlyMarginCharges", () => {
  it("charges each month's share at month end and the last share on the close date", () => {
    const charges = computeMonthlyMarginCharges({
      ...marginTrade,
      openedAt: "2024-01-15",
      closedAt: "2024-03-10",
    });

    expect(charges).toEqual([
      { chargedOn: "2024-01-31", amount: 17 },
      { chargedOn: "2024-02-29", amount: 29 },
      { chargedOn: "2024-03-10", amount: 9 },
    ]);
    expect(sumMarginCharges(charges, "2024-02")).toBe(29);
    expect(sumMarginCharges(charges, "2024")).toBe(55);
  });

  it("charges the prior month when the trade closes on the first of a month", () => {
    expect(
      computeMonthlyMarginCharges({ ...marginTrade, openedAt: "2024-01-21", closedAt: "2024-02-01" })
    ).toEqual([{ chargedOn: "2024-01-31", amount: 11 }]);
  });

  it("adds up to the trade's margin fee when shares round", () => {
    const trade = { ...marginTrade, marginRate: 7.13, openedAt: "2024-01-03", closedAt: "2024-06-17" };

    const charged = computeMonthlyMarginCharges(trade).reduce((total, charge) => total + charge.amount, 0);

    expect(Number(charged.toFixed(2))).toBe(computeMarginFee(trade));
  });

  it("returns no charges without a margin rate", () => {
    expect(
      computeMonthlyMarginCharges({ ...marginTrade, marginRate: 0, openedAt: "2024-01-01", closedAt: "2024-03-01" })
    ).toEqual([]);
  });
});
