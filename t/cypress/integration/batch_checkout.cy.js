// Behavioural specs for batch checkout, including the regression test for
// issue #9 ( batch checkout cycling endlessly through already-processed items ).
//
// These are vendor-agnostic: they drive whatever emulator is running via the
// pad helpers and assert on Koha's behaviour.

describe("RFID batch checkout", () => {
  const barcodes = Cypress.env("itemBarcodes");

  beforeEach(() => {
    cy.loginToKoha();
  });

  it("adds items on the pad to the batch checkout", () => {
    cy.setPad(barcodes);
    cy.visitBatchCheckout();

    // The plugin picks the items off the pad, drops them in the barcode
    // textarea, and submits the form. The resulting batch checkout view
    // lists each item, so its barcode appears on the page.
    barcodes.forEach(barcode => {
      cy.contains(barcode, { timeout: 20000 }).should("exist");
    });
  });

  it("does not keep cycling when the pad items are already processed (issue #9)", () => {
    // Reproduce the reported condition: the items on the pad have already
    // been processed and are "in the plugin's memory" ( its
    // processed_barcodes list ). Seed that state before the page loads.
    cy.setPad(barcodes);

    // Count every page (re)load of the batch checkout page. Before the fix
    // the plugin resubmitted the ( empty ) form on every poll, so the page
    // reloaded over and over -- "the screen keeps jumping". After the fix
    // it must stay on the entry form and never resubmit.
    let loadCount = 0;
    cy.on("window:before:load", () => {
      loadCount += 1;
    });

    cy.visitBatchCheckout({
      onBeforeLoad(win) {
        win.localStorage.setItem(
          "koha_plugin_rfid_processed_barcodes",
          JSON.stringify(barcodes)
        );
        // Same action as last time, so the plugin keeps its memory
        // instead of clearing it on an action change.
        win.localStorage.setItem(
          "koha_plugin_rfid_previous_action",
          "batch_checkout"
        );
      },
    });

    // The entry form ( with #barcodelist ) should still be on screen --
    // the plugin should not have submitted anything, because nothing on
    // the pad is new.
    cy.get("#barcodelist").should("exist");

    // Let many poll cycles run ( the plugin polls every 500ms ). Capture
    // the load count once things have had time to settle, then confirm it
    // stops growing. With the bug, loadCount keeps climbing here.
    cy.wait(3000);
    cy.then(() => {
      const settled = loadCount;
      cy.wait(5000);
      cy.then(() => {
        expect(
          loadCount,
          "batch checkout should stop reloading once all pad items are already processed"
        ).to.equal(settled);
      });
    });

    // And we should still be on the entry form, not stuck reloading.
    cy.get("#barcodelist").should("exist");
  });
});
