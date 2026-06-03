import "./commands";

// The plugin stores quite a bit of state in localStorage ( the detected
// vendor, the previous action, and the unprocessed / processed barcode
// lists ). Leftover state from a previous test would change how the plugin
// behaves on the next page load, so start every test from a clean slate.
beforeEach(() => {
  cy.clearRfidLocalStorage();
  cy.resetPad();
});

// Don't let an exception thrown by unrelated Koha page JS fail an RFID test.
Cypress.on("uncaught:exception", () => false);
