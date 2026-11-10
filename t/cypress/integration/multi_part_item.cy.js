// A multi-part item ( e.g. a DVD case and its disc ) has one RFID tag per
// part, and every tag must have its security bit set, or the item is left
// "partial" and sets off the security gates. Bibliotheca sets security per tag,
// the other vendors set it per barcode and treat the item as a single tag, so
// this spec is run for every vendor.

describe("RFID multi-part item security", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  // This spec runs once per vendor, and the test patron's checkout limit would
  // be reached if these items stayed checked out
  afterEach(() => {
    ["RFIDCO_MULTI", "RFIDCI_MULTI", "RFIDRN_MULTI"].forEach(barcode =>
      cy.resetItem(barcode)
    );
  });

  it("disables the security bit on every tag at checkout", () => {
    const barcode = "RFIDCO_MULTI";
    cy.ensureItem(barcode);
    cy.setPad(barcode, { [barcode]: 2 });

    cy.visitCheckout();

    cy.contains(barcode, { timeout: 20000 }).should("exist");
    cy.assertSecurity(barcode, false);
  });

  it("enables the security bit on every tag at checkin", () => {
    const barcode = "RFIDCI_MULTI";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));
    cy.setPad(barcode, { [barcode]: 2 });
    cy.setPadSecurity(barcode, false);

    cy.visitCheckin();

    cy.contains(barcode, { timeout: 20000 }).should("exist");
    cy.assertSecurity(barcode, true);
  });

  it("disables the security bit on every tag at renewal", () => {
    const barcode = "RFIDRN_MULTI";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));
    cy.setPad(barcode, { [barcode]: 2 });

    cy.visit("/cgi-bin/koha/circ/renew.pl");

    cy.contains("h1", "Item renewed", { timeout: 20000 }).should("exist");
    cy.assertSecurity(barcode, false);
  });
});
