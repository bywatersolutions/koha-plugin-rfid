// Checkin conditions that require librarian interaction must always halt. When
// a checked-out copy is returned and fills a hold, Koha shows the #hold-found-modal
// confirmation -- to wait at this branch, or to transfer to the pickup branch.
// The plugin must not bypass it. This is mandatory and not configurable. ( The
// modal carries its own buttons, so the plugin has no "Continue processing"
// button to add; we assert it simply does not navigate past the modal. )

describe("RFID checkin halts on trapped holds", () => {
  beforeEach(() => {
    cy.loginToKoha();
  });

  it("halts on a hold to fill at this branch", () => {
    const barcode = "RFIDCI_HOLDWAIT";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));
    cy.ensureOtherPatron().then(other => cy.placeHold(barcode, other));
    cy.setPad(barcode);

    cy.rfidLoadCounter().then(counter => {
      cy.visitCheckin();
      cy.get("#hold-found-modal", { timeout: 20000 }).should("exist");
      cy.assertStableLoads(counter);
      cy.get("#hold-found-modal").should("exist");
    });
  });

  it("halts on a hold to transfer to another branch", () => {
    const barcode = "RFIDCI_HOLDXFER";
    cy.ensureItem(barcode);
    cy.checkoutTo(barcode, Cypress.env("borrowernumber"));
    cy.ensureOtherPatron().then(other =>
      cy.itemInfo(barcode).then(info =>
        cy.testDefaults().then(d =>
          cy
            .sql("SELECT branchcode FROM branches WHERE branchcode <> ? LIMIT 1", [
              d.branch,
            ])
            .then(rows =>
              cy.apiPost("/api/v1/holds", {
                patron_id: other,
                biblio_id: info.biblionumber,
                item_id: info.itemnumber,
                pickup_library_id: rows[0].branchcode,
              })
            )
        )
      )
    );
    cy.setPad(barcode);

    cy.rfidLoadCounter().then(counter => {
      cy.visitCheckin();
      cy.get("#hold-found-modal", { timeout: 20000 }).should("exist");
      cy.assertStableLoads(counter);
      cy.get("#hold-found-modal").should("exist");
    });
  });
});
