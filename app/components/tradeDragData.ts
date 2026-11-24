// A dragged trade row carries the ids of every trade it moves: the whole selection when the row is
// selected, otherwise just that row. The plain-text copy is a fallback for browsers that drop custom types.
const TRADE_IDS_DRAG_MIME = "application/x-trade-ids";
const TRADE_IDS_TEXT_PREFIX = "trades:";

export function writeTradeIdsToDataTransfer(dataTransfer: DataTransfer, tradeIds: string[]) {
  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(TRADE_IDS_DRAG_MIME, tradeIds.join(","));
  dataTransfer.setData("text/plain", `${TRADE_IDS_TEXT_PREFIX}${tradeIds.join(",")}`);
}

export function readTradeIdsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const byMime = dataTransfer.getData(TRADE_IDS_DRAG_MIME);
  const plain = dataTransfer.getData("text/plain");
  const joinedTradeIds =
    byMime || (plain.startsWith(TRADE_IDS_TEXT_PREFIX) ? plain.slice(TRADE_IDS_TEXT_PREFIX.length) : "");
  return joinedTradeIds.split(",").filter(Boolean);
}
