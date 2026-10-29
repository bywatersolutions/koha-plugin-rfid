// Switching to another window and back fires visibilitychange, which runs the
// plugin's halt checks again. Each run used to add another "Continue processing
// RFID tags" button ( and click handler ) to the halted dialog.

describe("RFID checkin continue button", () => {
  const barcode = "RFIDCI_CONTINUE";

  beforeEach(() => {
    cy.loginToKoha();
    cy.ensureItem(barcode);
    cy.setItemFlag(barcode, "withdrawn", 1);
    cy.setPad(barcode);
  });

  it("is not added again each time the tab becomes visible", () => {
    cy.visitCheckin();
    cy.get("p.problem.ret_withdrawn", { timeout: 20000 }).should("exist");
    cy.assertHaltButton();

    cy.get("button.rfid-continue")
      .its("length")
      .then(count => {
        cy.document().then(doc => {
          doc.dispatchEvent(new Event("visibilitychange"));
          doc.dispatchEvent(new Event("visibilitychange"));
        });

        // The halt checks run after a read from the pad, give them time
        cy.wait(3000);
        cy.get("button.rfid-continue").should("have.length", count);
      });
  });
});
