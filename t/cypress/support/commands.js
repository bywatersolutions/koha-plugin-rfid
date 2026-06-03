// Custom commands for driving Koha + the RFID emulator from Cypress.
//
// The emulator control API is identical across all three vendor emulators
// ( mksolutions, bibliotheca, circit ), so these helpers don't care which one
// is running -- they just talk to whatever emulator is listening on
// Cypress.env("emulatorUrl"). Only one emulator runs at a time because the
// plugin auto-detects the live vendor by probing each in turn.

const RFID_LOCALSTORAGE_KEYS = [
  "koha_plugin_rfid_enabled",
  "koha_plugin_rfid_vendor",
  "koha_plugin_rfid_previous_action",
  "koha_plugin_rfid_unprocessed_barcodes",
  "koha_plugin_rfid_processed_barcodes",
  "koha_plugin_rfid_show_reset_box",
  "koha_plugin_rfid_show_barcode_box",
];

// Wipe the plugin's localStorage so each test starts from a known state.
Cypress.Commands.add("clearRfidLocalStorage", () => {
  cy.window({ log: false }).then(win => {
    RFID_LOCALSTORAGE_KEYS.forEach(key => win.localStorage.removeItem(key));
  });
});

// Set the items "on the pad". Accepts a string or an array of barcodes.
Cypress.Commands.add("setPad", barcodes => {
  const list = Array.isArray(barcodes) ? barcodes.join(" ") : barcodes;
  cy.request({
    method: "POST",
    url: `${Cypress.env("emulatorUrl")}/api/barcodes`,
    body: { barcodes: list },
  });
});

// Clear the pad ( no items present ).
Cypress.Commands.add("resetPad", () => {
  cy.setPad("");
});

// Log in to the staff client once and reuse the session across tests.
Cypress.Commands.add("loginToKoha", () => {
  cy.session("koha-staff", () => {
    cy.visit("/cgi-bin/koha/mainpage.pl");
    cy.get("#userid").type(Cypress.env("kohaUser"));
    cy.get("#password").type(`${Cypress.env("kohaPass")}{enter}`);
    // On a successful login the username field is gone from the page.
    cy.get("#userid").should("not.exist");
  });
});

// Visit the batch checkout page for the seeded test patron. Reads the
// borrowernumber written by seed.pl into the seed.json fixture. Any options
// ( e.g. onBeforeLoad ) are passed straight through to cy.visit.
Cypress.Commands.add("visitBatchCheckout", (options = {}) => {
  cy.fixture("seed.json").then(seed => {
    cy.visit(
      `/cgi-bin/koha/circ/circulation.pl?borrowernumber=${seed.borrowernumber}&batch=1`,
      options
    );
    cy.contains("h1", "Batch check out").should("be.visible");
  });
});
