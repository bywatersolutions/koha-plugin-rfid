// The plugin can be disabled per branch. When the current branch is disabled,
// intranet_js injects nothing, so rfid.js never loads and none of its UI
// appears.

const PLUGIN_CLASS = "Koha::Plugin::Com::ByWaterSolutions::RFID";

describe("RFID disabled per branch", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  afterEach(() => {
    // Re-enable everywhere so other specs are unaffected.
    cy.sql(
      "DELETE FROM plugin_data WHERE plugin_class = ? " +
        "AND plugin_key LIKE 'rfid_disabled_branchcode_%'",
      [PLUGIN_CLASS]
    );
  });

  it("does not inject the plugin when the branch is disabled", () => {
    // Disable every branch so the current one is certainly disabled.
    cy.sql("SELECT branchcode FROM branches").then(rows => {
      rows.forEach(r =>
        cy.sql(
          "INSERT INTO plugin_data (plugin_class, plugin_key, plugin_value) " +
            "VALUES (?, ?, '1') ON DUPLICATE KEY UPDATE plugin_value = '1'",
          [PLUGIN_CLASS, "rfid_disabled_branchcode_" + r.branchcode]
        )
      );
    });

    cy.visitBatchCheckout();

    // Give the page time to run any JS, then confirm the plugin is absent.
    cy.wait(3000);
    cy.get("#rfid-reset-box").should("not.exist");
    cy.window().then(win => {
      expect(win.koha_plugin_rfid).to.be.undefined;
    });
  });
});
