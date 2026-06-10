// Checkout conditions that require librarian interaction ( the
// #circ_needsconfirmation alert ) must always halt the plugin -- it must never
// silently check out an item the librarian needs to confirm. These are
// mandatory and not configurable.

const SCENARIOS = [
  {
    name: "RESERVED ( item has a hold for another patron )",
    barcode: "RFIDCO_RESERVED",
    selector: "#circ_needsconfirmation li.needsconfirm.reserved",
    setup: bc => cy.ensureOtherPatron().then(other => cy.placeHold(bc, other)),
  },
  {
    name: "RESERVE_WAITING ( hold waiting for another patron )",
    barcode: "RFIDCO_RESWAIT",
    selector: "#circ_needsconfirmation li.needsconfirm.reserve_waiting",
    setup: bc =>
      cy.ensureOtherPatron().then(other => cy.placeHoldWaiting(bc, other)),
  },
  {
    name: "ISSUED_TO_ANOTHER ( checked out to another patron )",
    barcode: "RFIDCO_ISSUED",
    selector: "#circ_needsconfirmation li.needsconfirm.issued_to_another",
    setup: bc => cy.ensureOtherPatron().then(other => cy.checkoutTo(bc, other)),
  },
  {
    name: "RENEW_ISSUE ( already checked out to this patron )",
    barcode: "RFIDCO_RENEW",
    selector: "#circ_needsconfirmation li.needsconfirm.renew_issue",
    setup: bc => cy.checkoutTo(bc, Cypress.env("borrowernumber")),
  },
];

describe("RFID checkout halts on needs-confirmation conditions", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  SCENARIOS.forEach(scenario => {
    it(`halts on ${scenario.name}`, () => {
      cy.ensureItem(scenario.barcode);
      scenario.setup(scenario.barcode);
      cy.setPad(scenario.barcode);

      cy.rfidLoadCounter().then(counter => {
        cy.visitCheckout();

        // The confirmation appears...
        cy.get("#circ_needsconfirmation", { timeout: 20000 }).should("exist");
        cy.get(scenario.selector).should("exist");

        // ...and the plugin does not bypass it ( no auto-confirm / navigation ).
        cy.assertStableLoads(counter);
        cy.get("#circ_needsconfirmation").should("exist");
      });
    });
  });
});
