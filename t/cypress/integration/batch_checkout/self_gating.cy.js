// Batch checkout is self-gating: when an item needs confirmation, Koha shows a
// "Batch checkout confirmation" screen with its own "Checkout or renew" button.
// The plugin only fills the barcode list and submits once to reach that screen;
// it must not click the confirm button. So unlike one-at-a-time checkout, the
// plugin needs no halt logic here -- the confirmation is built into the flow.
// This proves the plugin reaches but does not bypass it.

describe("RFID batch checkout does not bypass the confirmation screen", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("reaches the batch confirmation but does not auto-confirm a held item", () => {
    const barcode = "RFIDBATCH_HOLD";
    cy.ensureItem(barcode);
    cy.ensureOtherPatron().then(other => cy.placeHold(barcode, other));
    cy.setPad(barcode);

    cy.rfidLoadCounter().then(counter => {
      cy.visitBatchCheckout();

      // The plugin submits the list; Koha shows the confirmation screen...
      cy.contains("Batch checkout confirmation", { timeout: 20000 }).should(
        "exist"
      );
      cy.get("#checkoutrenew").should("exist");

      // ...and the plugin does not click "Checkout or renew".
      cy.assertStableLoads(counter);
      cy.get("#checkoutrenew").should("exist");
    });

    // The held item was not checked out.
    cy.sql(
      "SELECT i.issue_id FROM issues i JOIN items it ON it.itemnumber = i.itemnumber " +
        "WHERE it.barcode = ?",
      [barcode]
    ).then(rows => {
      expect(rows.length, "held item should not be checked out").to.equal(0);
    });
  });
});
