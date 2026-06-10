// The happy path for checkin: a checked-out item is returned without
// interruption, and the plugin enables its security bit. The security-bit
// round-trip is vendor-specific, so this spec is run for every vendor.

describe("RFID checkin happy path", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("checks the item in and enables its security bit", () => {
    const barcode = "RFIDCI_PLAIN";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));
    cy.setPad(barcode);

    cy.visitCheckin();

    // The item is returned ( its barcode shows up in the checked-in table ) and
    // no interruption appears.
    cy.contains(barcode, { timeout: 20000 }).should("exist");

    // Checkin enables the security bit.
    cy.assertSecurity(barcode, true);
  });
});
