// Builders that put an item / patron into a particular state so a spec can
// trigger a specific Koha checkout or checkin interruption. They use the REST
// API for objects ( holds, checkouts ) and SQL for state the API does not
// expose ( hold "waiting" status, item flags ).

// itemnumber + biblionumber for a barcode.
Cypress.Commands.add("itemInfo", barcode =>
  cy
    .sql(
      "SELECT itemnumber, biblionumber FROM items WHERE barcode = ? LIMIT 1",
      [barcode]
    )
    .then(rows => rows[0])
);

// A second patron, distinct from the test patron, for "another patron"
// scenarios. Returns its borrowernumber.
Cypress.Commands.add("ensureOtherPatron", () => cy.ensurePatron("RFIDTESTOTHER"));

// Place an item-level hold on the barcode for the given patron.
Cypress.Commands.add("placeHold", (barcode, borrowernumber) =>
  cy.itemInfo(barcode).then(info =>
    cy.testDefaults().then(d =>
      cy.apiPost("/api/v1/holds", {
        patron_id: borrowernumber,
        biblio_id: info.biblionumber,
        item_id: info.itemnumber,
        pickup_library_id: d.branch,
      })
    )
  )
);

// Place a hold and mark it waiting at the pickup library.
Cypress.Commands.add("placeHoldWaiting", (barcode, borrowernumber) =>
  cy.placeHold(barcode, borrowernumber).then(() =>
    cy.sql(
      "UPDATE reserves SET found = 'W', waitingdate = CURDATE() " +
        "WHERE borrowernumber = ? AND itemnumber = " +
        "( SELECT itemnumber FROM items WHERE barcode = ? )",
      [borrowernumber, barcode]
    )
  )
);

// Check the barcode out to the given patron.
Cypress.Commands.add("checkoutTo", (barcode, borrowernumber) =>
  cy.itemInfo(barcode).then(info =>
    cy.apiPost("/api/v1/checkouts", {
      item_id: info.itemnumber,
      patron_id: borrowernumber,
    })
  )
);

// Set an item flag column ( e.g. withdrawn, notforloan, itemlost ).
Cypress.Commands.add("setItemFlag", (barcode, column, value) =>
  cy.sql(`UPDATE items SET ${column} = ? WHERE barcode = ?`, [value, barcode])
);

const PLUGIN_CLASS = "Koha::Plugin::Com::ByWaterSolutions::RFID";

// Set ( or clear ) the global halt setting for an optional condition, the same
// way the configuration page does, so the server injects it into the page. This
// exercises the real config pipeline ( plugin_data -> intranet_js -> rfid.js )
// rather than faking the injected object.
Cypress.Commands.add("setHaltGlobal", (key, halt) =>
  cy.sql(
    "INSERT INTO plugin_data (plugin_class, plugin_key, plugin_value) " +
      "VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE plugin_value = VALUES(plugin_value)",
    [PLUGIN_CLASS, "rfid_halt_" + key, halt ? "1" : "0"]
  )
);

// Remove a stored halt setting so the condition reverts to its catalog default.
Cypress.Commands.add("clearHaltSetting", key =>
  cy.sql(
    "DELETE FROM plugin_data WHERE plugin_class = ? AND plugin_key = ?",
    [PLUGIN_CLASS, "rfid_halt_" + key]
  )
);
