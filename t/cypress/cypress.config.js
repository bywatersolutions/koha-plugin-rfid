const { defineConfig } = require("cypress");

// All values can be overridden from the environment with the CYPRESS_ prefix,
// e.g. CYPRESS_baseUrl=http://rfidtest-intra.localhost
//      CYPRESS_emulatorUrl=http://127.0.0.1:21645
module.exports = defineConfig({
  // The plugin polls the RFID reader on a 500ms interval, so a single user
  // action can take several seconds of polling before the UI settles. Give
  // assertions a generous default so we wait for the poll loop rather than
  // racing it.
  defaultCommandTimeout: 15000,
  video: false,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: "http://localhost:8081",
    specPattern: "integration/**/*.cy.js",
    supportFile: "support/e2e.js",
    fixturesFolder: "fixtures",
    screenshotsFolder: "screenshots",
    // We talk to the RFID emulator from a different origin than Koha. The
    // plugin's own XHR is allowed by the emulator's CORS headers, and our
    // helper drives the emulator over cy.request ( which is not subject to
    // same-origin ), so we don't need chromeWebSecurity disabled.
    setupNodeEvents(on, config) {
      return config;
    },
  },
  env: {
    // Koha staff login ( ktd default superlibrarian )
    kohaUser: "koha",
    kohaPass: "koha",

    // The control API of whichever single emulator is currently running.
    // The runner sets this per vendor; mksolutions is the default.
    emulatorUrl: "http://127.0.0.1:4039",

    // Deterministic fixtures created by t/cypress/seed.pl
    patronCardnumber: "RFIDTESTPATRON",
    itemBarcodes: ["RFIDTEST001", "RFIDTEST002", "RFIDTEST003"],
  },
});
