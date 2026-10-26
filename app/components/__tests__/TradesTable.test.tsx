import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "../../api/types";
import { TradesTable } from "../TradesTable";
import { TOUCH_DRAG_DELAY_MS } from "../useTouchTradeDrag";

const trade: Trade = {
  id: "trade-1",
  symbol: "AAPL",
  currency: "USD",
  assetType: "STOCK",
  direction: "LONG",
  quantity: 10,
  entryPrice: 100,
  exitPrice: 110,
  fees: 0,
  openedAt: "2024-05-01",
  closedAt: "2024-05-01",
  realizedPnl: 100,
  createdAt: "2024-05-01T10:00:00Z",
  updatedAt: "2024-05-01T10:00:00Z",
};

function touchAt(clientX: number, clientY: number) {
  return [{ identifier: 1, clientX, clientY }];
}

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

  describe("touch drag", () => {
    const originalElementFromPoint = document.elementFromPoint;
    let dropTarget: HTMLElement;

    beforeEach(() => {
      vi.useFakeTimers();
      dropTarget = document.createElement("button");
      dropTarget.setAttribute("data-trade-drop-date", "2024-05-03");
      document.body.appendChild(dropTarget);
      // Anything above y=100 is the calendar day; below it is the table.
      document.elementFromPoint = vi.fn((_x: number, y: number) =>
        y < 100 ? dropTarget : document.body
      );
    });

    afterEach(() => {
      vi.useRealTimers();
      dropTarget.remove();
      document.elementFromPoint = originalElementFromPoint;
    });

    const renderTable = () => {
      const handlers = {
        onEdit: vi.fn(),
        onTradeDragStart: vi.fn(),
        onTradeDragEnd: vi.fn(),
        onTradeTouchDropTargetChange: vi.fn(),
        onTradeTouchDrop: vi.fn(),
      };
      render(<TradesTable trades={[trade]} onDelete={vi.fn()} {...handlers} />);
      const row = screen.getByText("AAPL").closest("tr") as HTMLElement;
      return { row, ...handlers };
    };

    it("drops a long-pressed row onto the day under the finger", () => {
      const { row, onEdit, onTradeDragStart, onTradeDragEnd, onTradeTouchDropTargetChange, onTradeTouchDrop } =
        renderTable();

      fireEvent.touchStart(row, { touches: touchAt(50, 300) });
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      expect(onTradeDragStart).toHaveBeenCalledWith("trade-1");
      expect(row).toHaveClass("Mui-selected");
      const ghostChip = screen.getAllByText("AAPL").find((el) => el.closest("[aria-hidden]"));
      expect(ghostChip?.closest(".MuiChip-root")).toHaveClass("MuiChip-colorSuccess");
      expect(ghostChip?.closest(".MuiChip-root")).toHaveTextContent("10 · 100.00 USD · 2024/05/01");

      const move = createEvent.touchMove(row, { changedTouches: touchAt(50, 40) });
      fireEvent(row, move);
      expect(move.defaultPrevented).toBe(true);
      expect(onTradeTouchDropTargetChange).toHaveBeenLastCalledWith("2024-05-03");

      const end = createEvent.touchEnd(row, { changedTouches: touchAt(50, 40) });
      fireEvent(row, end);
      expect(end.defaultPrevented).toBe(true);
      expect(onTradeTouchDrop).toHaveBeenCalledWith("trade-1", "2024-05-03");
      expect(onTradeTouchDropTargetChange).toHaveBeenLastCalledWith(null);
      expect(onTradeDragEnd).toHaveBeenCalled();
      expect(onEdit).not.toHaveBeenCalled();
    });

    it("lets the page scroll when the finger moves before the long-press", () => {
      const { row, onTradeDragStart, onTradeTouchDrop } = renderTable();

      fireEvent.touchStart(row, { touches: touchAt(50, 300) });
      const move = createEvent.touchMove(row, { changedTouches: touchAt(50, 250) });
      fireEvent(row, move);
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      fireEvent.touchEnd(row, { changedTouches: touchAt(50, 40) });

      expect(move.defaultPrevented).toBe(false);
      expect(onTradeDragStart).not.toHaveBeenCalled();
      expect(onTradeTouchDrop).not.toHaveBeenCalled();
    });

    it("scrolls toward the edge the finger is held at and retargets the day under it", () => {
      const { row, onTradeTouchDropTargetChange, onTradeTouchDrop } = renderTable();
      let scrolledIntoView = false;
      const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {
        scrolledIntoView = true;
      });
      document.elementFromPoint = vi.fn(() => (scrolledIntoView ? dropTarget : document.body));

      try {
        fireEvent.touchStart(row, { touches: touchAt(50, 300) });
        act(() => {
          vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
        });
        fireEvent.touchMove(row, { changedTouches: touchAt(50, 10) });
        expect(onTradeTouchDropTargetChange).not.toHaveBeenCalledWith("2024-05-03");

        act(() => {
          vi.advanceTimersByTime(50);
        });
        expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number));
        expect(scrollBy.mock.calls[0][1]).toBeLessThan(0);
        expect(onTradeTouchDropTargetChange).toHaveBeenLastCalledWith("2024-05-03");

        fireEvent.touchEnd(row, { changedTouches: touchAt(50, 10) });
        expect(onTradeTouchDrop).toHaveBeenCalledWith("trade-1", "2024-05-03");
        const callsAtDrop = scrollBy.mock.calls.length;
        act(() => {
          vi.advanceTimersByTime(100);
        });
        expect(scrollBy).toHaveBeenCalledTimes(callsAtDrop);
      } finally {
        scrollBy.mockRestore();
      }
    });

    it("doesn't scroll when a row near the bottom edge is picked up", () => {
      const { row } = renderTable();
      const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
      const nearBottom = window.innerHeight - 10;

      try {
        fireEvent.touchStart(row, { touches: touchAt(50, nearBottom) });
        act(() => {
          vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS + 100);
        });
        fireEvent.touchMove(row, { changedTouches: touchAt(50, nearBottom - 20) });
        act(() => {
          vi.advanceTimersByTime(100);
        });
        expect(scrollBy).not.toHaveBeenCalled();
      } finally {
        scrollBy.mockRestore();
      }
    });

    it("cancels the browser's native drag while a finger is on the row", () => {
      const { row, onTradeDragStart } = renderTable();
      const dataTransfer = { setData: vi.fn(), effectAllowed: "none" };

      fireEvent.touchStart(row, { touches: touchAt(50, 300) });
      const dragStart = createEvent.dragStart(row, { dataTransfer });
      fireEvent(row, dragStart);

      expect(dragStart.defaultPrevented).toBe(true);
      expect(dataTransfer.setData).not.toHaveBeenCalled();
      expect(onTradeDragStart).not.toHaveBeenCalled();
    });
  });
});
