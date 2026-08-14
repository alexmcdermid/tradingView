import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradesTable } from "../TradesTable";

describe("TradesTable", () => {
  it("shows a zero range when pagination has no results", () => {
    render(
      <TradesTable
        trades={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        page={0}
        pageSize={20}
        totalElements={0}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    );

    expect(screen.getByText("0-0 of 0")).toBeInTheDocument();
    expect(screen.queryByText("1-0 of 0")).not.toBeInTheDocument();
  });
});
