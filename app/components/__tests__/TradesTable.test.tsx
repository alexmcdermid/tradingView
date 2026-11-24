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

  it("shows the total margin with the viewed month's share beneath", () => {
    const marginTrade: Trade = {
      ...trade,
      marginRate: 36.5,
      openedAt: "2024-01-15",
      closedAt: "2024-03-10",
    };

    render(
      <TradesTable trades={[marginTrade]} showClosingMonthMargin onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText("55.00")).toBeInTheDocument();
    expect(screen.getByText("9.00 this month")).toBeInTheDocument();
  });

  it("shows only the total margin when the trade is held within the viewed month", () => {
    const marginTrade: Trade = {
      ...trade,
      marginRate: 36.5,
      openedAt: "2024-03-01",
      closedAt: "2024-03-10",
    };

    render(
      <TradesTable trades={[marginTrade]} showClosingMonthMargin onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText("9.00")).toBeInTheDocument();
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
  });

  describe("row selection", () => {
    const secondTrade: Trade = { ...trade, id: "trade-2", symbol: "MSFT" };
    const thirdTrade: Trade = { ...trade, id: "trade-3", symbol: "NVDA" };

    const renderSelectableTable = () => {
      const handlers = { onEdit: vi.fn(), onTradeDragStart: vi.fn() };
      render(<TradesTable trades={[trade, secondTrade, thirdTrade]} onDelete={vi.fn()} {...handlers} />);
      const rowFor = (symbol: string) => screen.getByText(symbol).closest("tr") as HTMLElement;
      return { rowFor, ...handlers };
    };

    const recordingDataTransfer = () => {
      const data: Record<string, string> = {};
      const dataTransfer = {
        effectAllowed: "none",
        setData: (type: string, value: string) => {
          data[type] = value;
        },
        setDragImage: vi.fn(),
      };
      return { data, dataTransfer };
    };

    it("toggles rows with Cmd/Ctrl+click, then with plain clicks until the selection is empty", () => {
      const { rowFor, onEdit } = renderSelectableTable();

      fireEvent.click(rowFor("AAPL"), { metaKey: true });
      fireEvent.click(rowFor("NVDA"), { ctrlKey: true });
      expect(onEdit).not.toHaveBeenCalled();
      expect(rowFor("AAPL")).toHaveClass("Mui-selected");
      expect(rowFor("MSFT")).not.toHaveClass("Mui-selected");
      expect(rowFor("NVDA")).toHaveClass("Mui-selected");
      expect(screen.getByText(/^2 selected/)).toBeInTheDocument();

      fireEvent.click(rowFor("AAPL"), { metaKey: true });
      expect(rowFor("AAPL")).not.toHaveClass("Mui-selected");

      fireEvent.click(rowFor("MSFT"));
      expect(onEdit).not.toHaveBeenCalled();
      expect(rowFor("MSFT")).toHaveClass("Mui-selected");

      fireEvent.click(rowFor("MSFT"));
      fireEvent.click(rowFor("NVDA"));
      expect(screen.queryByText(/selected ·/)).not.toBeInTheDocument();
      fireEvent.click(rowFor("MSFT"));
      expect(onEdit).toHaveBeenCalledWith(secondTrade);
    });

    it("selects a range with Shift+click and clears it with Escape", () => {
      const { rowFor } = renderSelectableTable();

      fireEvent.click(rowFor("AAPL"), { metaKey: true });
      fireEvent.click(rowFor("NVDA"), { shiftKey: true });
      expect(screen.getByText(/^3 selected/)).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByText(/selected ·/)).not.toBeInTheDocument();
      expect(rowFor("MSFT")).not.toHaveClass("Mui-selected");
    });

    it("starts a fresh selection on Shift+click once the previous one was cleared", () => {
      const { rowFor } = renderSelectableTable();

      fireEvent.click(rowFor("AAPL"), { metaKey: true });
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      fireEvent.click(rowFor("NVDA"), { shiftKey: true });

      expect(screen.getByText(/^1 selected/)).toBeInTheDocument();
      expect(rowFor("NVDA")).toHaveClass("Mui-selected");
      expect(rowFor("AAPL")).not.toHaveClass("Mui-selected");
      expect(rowFor("MSFT")).not.toHaveClass("Mui-selected");
    });

    it("drags the whole selection from a selected row, and only the row itself otherwise", async () => {
      const { rowFor, onTradeDragStart } = renderSelectableTable();
      fireEvent.click(rowFor("NVDA"), { metaKey: true });
      fireEvent.click(rowFor("AAPL"), { metaKey: true });

      const selectedDrag = recordingDataTransfer();
      fireEvent.dragStart(rowFor("NVDA"), { dataTransfer: selectedDrag.dataTransfer });
      expect(onTradeDragStart).toHaveBeenLastCalledWith(["trade-1", "trade-3"]);
      expect(selectedDrag.data["application/x-trade-ids"]).toBe("trade-1,trade-3");
      const dragImage = selectedDrag.dataTransfer.setDragImage.mock.calls[0][0] as HTMLElement;
      expect(dragImage).toHaveTextContent("2 trades");
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(dragImage).not.toBeInTheDocument();

      const unselectedDrag = recordingDataTransfer();
      fireEvent.dragStart(rowFor("MSFT"), { dataTransfer: unselectedDrag.dataTransfer });
      expect(onTradeDragStart).toHaveBeenLastCalledWith(["trade-2"]);
      expect(unselectedDrag.data["application/x-trade-ids"]).toBe("trade-2");
      expect(unselectedDrag.dataTransfer.setDragImage).not.toHaveBeenCalled();
    });

    it("drops rows that leave the table from the selection", () => {
      const onTradeDragStart = vi.fn();
      const { rerender } = render(
        <TradesTable trades={[trade, secondTrade]} onEdit={vi.fn()} onDelete={vi.fn()} onTradeDragStart={onTradeDragStart} />
      );
      fireEvent.click(screen.getByText("AAPL").closest("tr") as HTMLElement, { metaKey: true });
      fireEvent.click(screen.getByText("MSFT").closest("tr") as HTMLElement, { metaKey: true });

      rerender(
        <TradesTable trades={[secondTrade]} onEdit={vi.fn()} onDelete={vi.fn()} onTradeDragStart={onTradeDragStart} />
      );
      expect(screen.getByText(/^1 selected/)).toBeInTheDocument();
    });

    it("doesn't select rows in a table that can't drag them", () => {
      const onEdit = vi.fn();
      render(<TradesTable trades={[trade]} onEdit={onEdit} onDelete={vi.fn()} />);

      fireEvent.click(screen.getByText("AAPL").closest("tr") as HTMLElement, { metaKey: true });
      expect(onEdit).toHaveBeenCalledWith(trade);
      expect(screen.queryByText(/selected ·/)).not.toBeInTheDocument();
    });
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

    it("selects a row held still and released, toggles tapped rows, and drags the selection together", () => {
      const secondTrade: Trade = { ...trade, id: "trade-2", symbol: "MSFT" };
      const handlers = {
        onEdit: vi.fn(),
        onTradeDragStart: vi.fn(),
        onTradeDragEnd: vi.fn(),
        onTradeTouchDropTargetChange: vi.fn(),
        onTradeTouchDrop: vi.fn(),
      };
      render(<TradesTable trades={[trade, secondTrade]} onDelete={vi.fn()} {...handlers} />);
      const firstRow = screen.getByText("AAPL").closest("tr") as HTMLElement;
      const secondRow = screen.getByText("MSFT").closest("tr") as HTMLElement;

      fireEvent.touchStart(firstRow, { touches: touchAt(50, 300) });
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      const release = createEvent.touchEnd(firstRow, { changedTouches: touchAt(52, 302) });
      fireEvent(firstRow, release);
      expect(release.defaultPrevented).toBe(true);
      expect(handlers.onTradeTouchDrop).not.toHaveBeenCalled();
      expect(firstRow).toHaveClass("Mui-selected");
      expect(screen.getByText(/^1 selected/)).toBeInTheDocument();

      fireEvent.click(secondRow);
      expect(handlers.onEdit).not.toHaveBeenCalled();
      expect(secondRow).toHaveClass("Mui-selected");

      fireEvent.touchStart(secondRow, { touches: touchAt(50, 320) });
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      expect(handlers.onTradeDragStart).toHaveBeenLastCalledWith(["trade-1", "trade-2"]);
      expect(screen.getByText("2 trades")).toBeInTheDocument();
      fireEvent.touchMove(secondRow, { changedTouches: touchAt(50, 40) });
      fireEvent.touchEnd(secondRow, { changedTouches: touchAt(50, 40) });
      expect(handlers.onTradeTouchDrop).toHaveBeenCalledWith(["trade-1", "trade-2"], "2024-05-03");
    });

    it("doesn't select a row that was dragged away and released off the calendar", () => {
      const { row, onTradeTouchDrop } = renderTable();

      fireEvent.touchStart(row, { touches: touchAt(50, 300) });
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      fireEvent.touchMove(row, { changedTouches: touchAt(50, 400) });
      fireEvent.touchEnd(row, { changedTouches: touchAt(50, 300) });

      expect(onTradeTouchDrop).not.toHaveBeenCalled();
      expect(row).not.toHaveClass("Mui-selected");
    });

    it("drops a long-pressed row onto the day under the finger", () => {
      const { row, onEdit, onTradeDragStart, onTradeDragEnd, onTradeTouchDropTargetChange, onTradeTouchDrop } =
        renderTable();

      fireEvent.touchStart(row, { touches: touchAt(50, 300) });
      act(() => {
        vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS);
      });
      expect(onTradeDragStart).toHaveBeenCalledWith(["trade-1"]);
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
      expect(onTradeTouchDrop).toHaveBeenCalledWith(["trade-1"], "2024-05-03");
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
        expect(onTradeTouchDrop).toHaveBeenCalledWith(["trade-1"], "2024-05-03");
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
