// Slip popups and other Koha tabs run the plugin too, and a page with no RFID
// action resets the plugin's state. That state used to live in localStorage,
// shared by every tab, so the reset wiped the checkout page's processed list
// and an item still on the pad was checked out again ( Koha then asks to renew
// it ). The state is per tab now, so a reset from elsewhere must not matter.

describe("RFID checkout state is per tab", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("does not check out an item again when another tab resets its state", () => {
    const barcode = "RFIDCO_OTHERTAB";
    cy.ensureItem(barcode);
    cy.setPad(barcode);

    cy.visitCheckout();
    // Koha only fills the checkouts table on demand, the "Checked out" message shows the checkout went through
    cy.get("div.lastchecked", { timeout: 20000 }).should("contain", barcode);

    cy.rfidLoadCounter().then(counter => {
      // What handle_action_change() in another tab did to the shared storage
      cy.window().then(win => {
        win.localStorage.setItem("koha_plugin_rfid_previous_action", "");
        win.localStorage.setItem("koha_plugin_rfid_unprocessed_barcodes", "[]");
        win.localStorage.setItem("koha_plugin_rfid_processed_barcodes", "[]");
      });

      // The item is still on the pad, give the poll loop time to pick it up again
      cy.wait(5000).then(() => {
        expect(counter.count, "the item should not be submitted again").to.equal(0);
      });
    });

    cy.get("#circ_needsconfirmation").should("not.exist");
  });
});
