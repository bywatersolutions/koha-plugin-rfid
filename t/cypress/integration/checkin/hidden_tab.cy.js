// A hidden tab must leave the pad alone, the librarian is working in another tab
// or window. Every return to the tab used to start another poller without
// stopping the last one, and hiding the tab only stopped the newest, so the
// others kept checking items in from the background.

describe("RFID hidden tab", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("does not check in items while the tab is hidden", () => {
    const barcode = "RFIDCI_HIDDEN";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));

    cy.visitCheckin();
    cy.get("#rfid-reset-box", { timeout: 20000 }).should("exist");

    // Come back to the tab twice, then hide it
    cy.document().then(doc => {
      doc.dispatchEvent(new Event("visibilitychange"));
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    cy.wait(1000);
    cy.document().then(doc => {
      Object.defineProperty(doc, "hidden", { configurable: true, get: () => true });
      doc.dispatchEvent(new Event("visibilitychange"));
    });

    cy.rfidLoadCounter().then(counter => {
      cy.setPad(barcode);

      cy.wait(4000).then(() => {
        expect(counter.count, "a hidden tab should not check the item in").to.equal(0);
      });
    });

    // Once the tab is visible again it picks the item up
    cy.document().then(doc => {
      Object.defineProperty(doc, "hidden", { configurable: true, get: () => false });
      doc.dispatchEvent(new Event("visibilitychange"));
    });
    cy.get("#checkedintable", { timeout: 20000 }).should("contain", barcode);
  });
});
