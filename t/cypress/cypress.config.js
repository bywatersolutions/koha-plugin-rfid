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
    //
    // Specs build their own Koha data ( instead of a separate seed script ) via
    // these tasks: cy.task("query") for direct SQL ( sysprefs, item flags, item
    // type checkin messages, fines ) and cy.task("apiGet"/"apiPost"/...) for the
    // REST API ( patrons, items, biblios, holds, checkouts, recalls ).
    setupNodeEvents(on, config) {
      const { query } = require("./plugins/db");
      const { apiGet, apiPost, apiPut, apiDelete } = require("./plugins/api");

      const baseUrl = config.baseUrl;
      const user = config.env.apiUser || config.env.kohaUser;
      const pass = config.env.apiPass || config.env.kohaPass;
      const withAuth = fn => args => fn({ ...args, baseUrl, user, pass });

      on("task", {
        query,
        apiGet: withAuth(apiGet),
        apiPost: withAuth(apiPost),
        apiPut: withAuth(apiPut),
        apiDelete: withAuth(apiDelete),
      });

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

    // The port the circit emulator runs on during testing ( the real reader
    // uses privileged port 80 ). The runner sets this per vendor; specs write
    // it to the RFIDCircitPort syspref so the plugin probes the emulator.
    circitPort: "8090",

    // Identifiers for the deterministic test patron and items the specs build.
    patronCardnumber: "RFIDTESTPATRON",
    itemBarcodes: ["RFIDTEST001", "RFIDTEST002", "RFIDTEST003"],
  },
});
