// Smoke test: confirms the plugin loaded and detected whichever single RFID
// emulator is currently running. This is the test that proves the harness is
// wired up for the vendor under test before the behavioural specs run.

describe("RFID plugin smoke test", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("injects the plugin and detects the running RFID reader", () => {
    cy.setPad(Cypress.env("itemBarcodes"));
    cy.visitBatchCheckout();

    // intranet_js injected rfid.js, which builds the floating "RFID
    // Controls" box once a vendor has been detected.
    cy.get("#rfid-reset-box", { timeout: 20000 }).should("be.visible");
    cy.contains("#rfid-reset-box", "RFID Controls").should("be.visible");

    // The plugin caches the detected vendor in localStorage. If detection
    // succeeded this is set to the emulator that's currently running.
    cy.window()
      .its("localStorage")
      .invoke("getItem", "koha_plugin_rfid_vendor")
      .should("be.oneOf", ["mksolutions", "bibliotheca", "circit"]);
  });
});
