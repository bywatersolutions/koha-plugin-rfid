// The happy path: a clean, available item is checked out without interruption,
// and the plugin disables its security bit. The security-bit round-trip is the
// one genuinely vendor-specific behaviour, so this spec is run for every vendor.

describe("RFID checkout happy path", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("checks the item out and disables its security bit", () => {
    const barcode = "RFIDCO_PLAIN";
    cy.ensureItem(barcode);
    cy.setPad(barcode);

    cy.visitCheckout();

    // No interruption, and the item is checked out to the patron ( its barcode
    // shows up in the checkouts table ).
    cy.get("#circ_needsconfirmation").should("not.exist");
    cy.get("#circ_impossible").should("not.exist");
    cy.contains(barcode, { timeout: 20000 }).should("exist");

    // Checkout disables the security bit.
    cy.assertSecurity(barcode, false);
  });
});
