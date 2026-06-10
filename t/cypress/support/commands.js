// Custom commands for driving Koha + the RFID emulator from Cypress, and for
// building the Koha data each spec needs.
//
// The emulator control API is identical across all three vendor emulators
// ( mksolutions, bibliotheca, circit ), so the pad helpers don't care which one
// is running -- they talk to whatever emulator is listening on
// Cypress.env("emulatorUrl"). Only one emulator runs at a time because the
// plugin auto-detects the live vendor by probing each in turn.
//
// Test data is built from the spec ( there is no separate seed script ): SQL
// via cy.sql for state the REST API does not expose, and the REST API via
// cy.api* for patrons, biblios, items, holds, checkouts and recalls.

const RFID_LOCALSTORAGE_KEYS = [
  "koha_plugin_rfid_enabled",
  "koha_plugin_rfid_vendor",
  "koha_plugin_rfid_previous_action",
  "koha_plugin_rfid_unprocessed_barcodes",
  "koha_plugin_rfid_processed_barcodes",
  "koha_plugin_rfid_show_reset_box",
  "koha_plugin_rfid_show_barcode_box",
];

const marcxmlFor = title =>
  '<record xmlns="http://www.loc.gov/MARC21/slim">' +
  "<leader>00000nam a2200000 a 4500</leader>" +
  '<datafield tag="245" ind1="0" ind2="0"><subfield code="a">' +
  title +
  "</subfield></datafield></record>";

// --- RFID plugin / emulator helpers ---

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

// --- Low-level data access ---

// Run a parameterized SQL query against the Koha database.
Cypress.Commands.add("sql", (sql, values = []) =>
  cy.task("query", { sql, values })
);

Cypress.Commands.add("apiGet", endpoint => cy.task("apiGet", { endpoint }));
Cypress.Commands.add("apiPost", (endpoint, body, contentType) =>
  cy.task("apiPost", { endpoint, body, contentType })
);
Cypress.Commands.add("apiPut", (endpoint, body) =>
  cy.task("apiPut", { endpoint, body })
);
Cypress.Commands.add("apiDelete", endpoint =>
  cy.task("apiDelete", { endpoint })
);

// Upsert a system preference.
Cypress.Commands.add("setPref", (name, value) =>
  cy.sql(
    "INSERT INTO systempreferences (variable, value) VALUES (?, ?) " +
      "ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [name, String(value)]
  )
);

// --- Koha object builders ( idempotent where it matters ) ---

// The library / patron category / item type the test data lives in. Looked up
// once from the sample data and cached for the run.
Cypress.Commands.add("testDefaults", () => {
  const cached = Cypress.env("testDefaults");
  if (cached) return cy.wrap(cached, { log: false });
  return cy
    .sql(
      "SELECT " +
        "(SELECT branchcode FROM branches LIMIT 1) AS branch, " +
        "(SELECT categorycode FROM categories WHERE category_type <> 'S' LIMIT 1) AS category, " +
        "(SELECT itemtype FROM itemtypes LIMIT 1) AS itemtype"
    )
    .then(rows => {
      const defaults = rows[0];
      Cypress.env("testDefaults", defaults);
      return defaults;
    });
});

// Create a biblio from a minimal MARCXML record; returns its biblionumber.
Cypress.Commands.add("createBiblio", title =>
  cy
    .apiPost("/api/v1/biblios", marcxmlFor(title), "application/marcxml+xml")
    .then(res => res.id)
);

// Ensure an item with the given barcode exists, and reset it to a clean,
// available state. Returns the itemnumber. Each item gets its own biblio so
// scenarios never collide on per-record rules ( e.g. holds per record ).
Cypress.Commands.add("ensureItem", barcode => {
  return cy.sql("SELECT itemnumber FROM items WHERE barcode = ? LIMIT 1", [
    barcode,
  ]).then(rows => {
    if (rows.length) {
      return cy.resetItem(barcode).then(() => rows[0].itemnumber);
    }
    return cy.createBiblio(`RFID Test ${barcode}`).then(biblioId =>
      cy.testDefaults().then(d =>
        cy
          .apiPost(`/api/v1/biblios/${biblioId}/items`, {
            external_id: barcode,
            home_library_id: d.branch,
            holding_library_id: d.branch,
            item_type_id: d.itemtype,
          })
          .then(item => item.item_id)
      )
    );
  });
});

// Return an item to a clean, available state: not checked out, no holds /
// recalls / transfers, and all status flags cleared.
Cypress.Commands.add("resetItem", barcode => {
  return cy.sql("SELECT itemnumber FROM items WHERE barcode = ? LIMIT 1", [
    barcode,
  ]).then(rows => {
    if (!rows.length) return;
    const itemnumber = rows[0].itemnumber;
    cy.sql("DELETE FROM issues WHERE itemnumber = ?", [itemnumber]);
    cy.sql("DELETE FROM reserves WHERE itemnumber = ?", [itemnumber]);
    cy.sql("DELETE FROM recalls WHERE item_id = ?", [itemnumber]);
    cy.sql("DELETE FROM branchtransfers WHERE itemnumber = ? AND datearrived IS NULL", [
      itemnumber,
    ]);
    cy.sql(
      "UPDATE items SET notforloan = 0, withdrawn = 0, itemlost = 0, " +
        "damaged = 0, onloan = NULL, restricted = 0 WHERE itemnumber = ?",
      [itemnumber]
    );
  });
});

// Ensure a patron exists; returns the borrowernumber.
Cypress.Commands.add("ensurePatron", cardnumber => {
  return cy.sql(
    "SELECT borrowernumber FROM borrowers WHERE cardnumber = ? LIMIT 1",
    [cardnumber]
  ).then(rows => {
    if (rows.length) return rows[0].borrowernumber;
    return cy.testDefaults().then(d =>
      cy
        .apiPost("/api/v1/patrons", {
          surname: "RFIDTest",
          firstname: cardnumber,
          cardnumber: cardnumber,
          library_id: d.branch,
          category_id: d.category,
        })
        .then(patron => patron.patron_id)
    );
  });
});

// Set up the base data every spec relies on: the relevant sysprefs, the test
// patron, and the default pool of items. Stashes the patron's borrowernumber in
// Cypress.env("borrowernumber").
Cypress.Commands.add("ensureBaseData", () => {
  cy.setPref("BatchCheckouts", "1");
  cy.sql("SELECT GROUP_CONCAT(categorycode) AS cats FROM categories").then(r =>
    cy.setPref("BatchCheckoutsValidCategories", r[0].cats || "")
  );
  cy.setPref("RFIDCircitPort", Cypress.env("circitPort"));

  cy.ensurePatron(Cypress.env("patronCardnumber")).then(bn =>
    Cypress.env("borrowernumber", bn)
  );
  Cypress.env("itemBarcodes").forEach(bc => cy.ensureItem(bc));
});

// Visit the batch checkout page for the test patron.
Cypress.Commands.add("visitBatchCheckout", (options = {}) => {
  cy.visit(
    `/cgi-bin/koha/circ/circulation.pl?borrowernumber=${Cypress.env(
      "borrowernumber"
    )}&batch=1`,
    options
  );
  cy.contains("h1", "Batch check out").should("be.visible");
});

// Visit the one-at-a-time checkout page for the test patron.
Cypress.Commands.add("visitCheckout", (options = {}) => {
  cy.visit(
    `/cgi-bin/koha/circ/circulation.pl?borrowernumber=${Cypress.env(
      "borrowernumber"
    )}`,
    options
  );
});

// Visit the checkin ( returns ) page.
Cypress.Commands.add("visitCheckin", (options = {}) => {
  cy.visit("/cgi-bin/koha/circ/returns.pl", options);
});
