// Checkout hard blockers ( the #circ_impossible alert ) are items Koha refuses
// to issue. The plugin previously did not recognize them at all; it now treats
// circ_impossible as an optional condition that halts by default, so the
// librarian notices the item was not checked out.

const SCENARIOS = [
  {
    name: "WITHDRAWN ( item is withdrawn )",
    barcode: "RFIDCO_WITHDRAWN",
    setup: bc => cy.setItemFlag(bc, "withdrawn", 1),
  },
  {
    name: "NOT_FOR_LOAN ( item is not for loan )",
    barcode: "RFIDCO_NFL",
    setup: bc => cy.setItemFlag(bc, "notforloan", 1),
  },
];

describe("RFID checkout halts on hard blockers", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  SCENARIOS.forEach(scenario => {
    it(`halts on ${scenario.name}`, () => {
      cy.ensureItem(scenario.barcode);
      scenario.setup(scenario.barcode);
      cy.setPad(scenario.barcode);

      cy.visitCheckout();

      // The item cannot be issued, and the plugin halts ( default ) by adding
      // its "Continue processing" button rather than moving on silently.
      cy.get("#circ_impossible", { timeout: 20000 }).should("exist");
      cy.assertHaltButton();
    });
  });
});
