const symbol = "CYPR";

function isoDate(day: number) {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(value: string) {
  return value.replace(/-/g, "/");
}

function field(label: string) {
  return cy
    .contains("label", label)
    .invoke("attr", "for")
    .then((id) => {
      expect(id, `${label} input id`).to.be.a("string");
      return cy.get(`[id="${id}"]`);
    });
}

function setField(label: string, value: string) {
  field(label).clear().type(value);
}

describe("trade journal regression", () => {
  const openedAt = isoDate(8);
  const closedAt = isoDate(10);
  const movedTo = isoDate(12);

  beforeEach(() => {
    cy.visit("/");
    cy.contains("Day Trade Journal").should("be.visible");
    cy.contains("You're in guest mode").should("be.visible");
  });

  it("adds, edits, and moves a trade from the calendar", () => {
    cy.contains("button", "Log Trade").click();
    cy.contains("New Trade").should("be.visible");

    setField("Symbol", symbol);
    setField("Quantity", "10");
    setField("Entry Price", "100");
    setField("Exit Price", "110");
    setField("Fees", "1");
    setField("Opened", openedAt);
    setField("Closed", closedAt);
    setField("Notes", "created by cypress regression");
    cy.contains("button", /^Save$/).click();

    cy.contains("tr", symbol).as("tradeRow").should("contain", "110.00");
    cy.get("@tradeRow").should("contain", displayDate(closedAt));

    cy.get("@tradeRow").click();
    cy.contains("Edit Trade").should("be.visible");
    setField("Exit Price", "105");
    setField("Notes", "edited by cypress regression");
    cy.contains("button", /^Save$/).click();

    cy.contains("tr", symbol).as("editedTradeRow").should("contain", "105.00");
    cy.get("@editedTradeRow").should("contain", "edited by cypress regression");

    cy.window().then((win) => {
      const dataTransfer = new win.DataTransfer();
      cy.get("@editedTradeRow").trigger("dragstart", { dataTransfer });
      cy.get(`[data-calendar-date="${movedTo}"]`)
        .trigger("dragover", { dataTransfer })
        .trigger("drop", { dataTransfer });
      cy.get("@editedTradeRow").trigger("dragend");
    });

    cy.contains("tr", symbol).should("contain", displayDate(movedTo));
  });
});
