// Optional checkin conditions are configurable: a library can make them halt or
// ignore. This drives the real config pipeline ( the global halt setting is
// stored in plugin_data, injected by intranet_js, and read by rfid.js ) and
// proves both behaviours, using a withdrawn item ( p.problem.ret_withdrawn ).

describe("RFID checkin optional condition is configurable", () => {
  const barcode = "RFIDCI_WITHDRAWN";
  const key = "ret_withdrawn";

  beforeEach(() => {
    cy.loginToKoha();
    cy.ensureItem(barcode);
    cy.setItemFlag(barcode, "withdrawn", 1);
    cy.setPad(barcode);
  });

  afterEach(() => {
    // Revert to the catalog default so other specs are unaffected.
    cy.clearHaltSetting(key);
  });

  it("halts on a withdrawn item when configured to halt", () => {
    cy.setHaltGlobal(key, true);

    cy.visitCheckin();

    cy.get("p.problem.ret_withdrawn", { timeout: 20000 }).should("exist");
    cy.assertHaltButton();
  });

  it("ignores a withdrawn item when configured to ignore", () => {
    cy.setHaltGlobal(key, false);

    cy.visitCheckin();

    // The message still shows, but the plugin does not halt: no continue button,
    // and it still enabled the security bit on its way through.
    cy.get("p.problem.ret_withdrawn", { timeout: 20000 }).should("exist");
    cy.assertNoHaltButton();
    cy.assertSecurity(barcode, true);
  });
});
