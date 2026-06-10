// Helpers for asserting whether the plugin halted on a dialog or proceeded
// through it, reading the emulator security bit, and injecting the halt config.
//
// Two halt signals are used, depending on the dialog:
//   * Dialogs with no buttons of their own ( checkout "needs confirmation" )
//     are detected by "the page does not navigate" -- if the plugin bypassed
//     the dialog it would submit a form and reload. Use a load counter.
//   * Dialogs the plugin annotates with its own "Continue processing" button
//     ( hold found, optional checkin messages ) are detected by the presence of
//     that button; its absence means the plugin proceeded / ignored.

// Count every page (re)load. Returns a plain object whose .count the listener
// keeps current; pass it to assertStableLoads. Register before the cy.visit.
Cypress.Commands.add("rfidLoadCounter", () => {
  const state = { count: 0 };
  cy.on("window:before:load", () => {
    state.count += 1;
  });
  return cy.wrap(state, { log: false });
});

// Confirm the page does not navigate across several poll cycles ( the plugin
// polls every 500ms ): measure, wait, and assert the count did not grow.
Cypress.Commands.add("assertStableLoads", counter => {
  let settled;
  cy.wait(3000).then(() => {
    settled = counter.count;
  });
  cy.wait(4000).then(() => {
    expect(counter.count, "the plugin should not navigate while halted").to.equal(
      settled
    );
  });
});

// The plugin's "Continue processing" button: present when it halted on a
// button-annotated dialog, absent when it proceeded.
Cypress.Commands.add("assertHaltButton", () => {
  cy.get("button.rfid-continue", { timeout: 20000 }).should("exist");
});

Cypress.Commands.add("assertNoHaltButton", () => {
  // Give the poll loop time to run, then confirm no halt button was added.
  cy.wait(4000);
  cy.get("button.rfid-continue").should("not.exist");
});

// Click the plugin's own "Continue processing" button.
Cypress.Commands.add("continueRfid", () => {
  cy.get("button.rfid-continue", { timeout: 20000 }).click();
});

// Visit a page with a per-condition halt config injected the same way RFID.pm
// injects it ( window.koha_plugin_rfid.halt_conditions ), so a spec can drive
// halt-vs-ignore without reconfiguring the plugin.
Cypress.Commands.add("visitWithHaltConfig", (url, haltConditions, extra = {}) => {
  cy.visit(url, {
    ...extra,
    onBeforeLoad(win) {
      win.koha_plugin_rfid = win.koha_plugin_rfid || {};
      win.koha_plugin_rfid.halt_conditions = haltConditions;
      if (extra.onBeforeLoad) extra.onBeforeLoad(win);
    },
  });
});

// Read an item's security bit back from the running emulator.
Cypress.Commands.add("rfidSecurity", barcode =>
  cy.request(`${Cypress.env("emulatorUrl")}/getitems`).then(res => {
    const items = (res.body && res.body.items) || [];
    const found = items.find(i => i.barcode === barcode);
    return found ? found.security : undefined;
  })
);

// Assert an item's security bit, retrying so the plugin's async setSecurityBit
// has time to land.
Cypress.Commands.add("assertSecurity", (barcode, expected) => {
  const attempt = n =>
    cy.rfidSecurity(barcode).then(value => {
      if (value === expected || n >= 8) {
        expect(value, `security bit for ${barcode}`).to.equal(expected);
        return;
      }
      cy.wait(500);
      attempt(n + 1);
    });
  attempt(0);
});
