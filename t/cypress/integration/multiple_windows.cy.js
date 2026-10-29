// Every visible Koha window with RFID active processes the items placed on the
// pad, so two windows side by side would both act on them. Windows announce
// themselves over a BroadcastChannel and the plugin warns while another active
// one is around. BroadcastChannel delivers to every other channel object with
// the same name, even in the same window, so the spec stands in for the other
// window with a channel of its own.

describe("RFID multiple windows warning", () => {
  let other_window;

  beforeEach(() => {
    cy.loginToKoha();
    cy.visitCheckin();
    cy.get("#rfid-reset-box", { timeout: 20000 }).should("exist");
    cy.window().then(win => {
      other_window = new win.BroadcastChannel("koha_plugin_rfid_windows");
    });
  });

  afterEach(() => {
    other_window.close();
  });

  it("warns while another window has RFID active", () => {
    cy.then(() => {
      other_window.postMessage({ type: "heartbeat", id: "other-window", active: true });
    });
    cy.get("#rfid-multiple-windows-warning").should("be.visible");

    // The other window was closed
    cy.then(() => {
      other_window.postMessage({ type: "goodbye", id: "other-window" });
    });
    cy.get("#rfid-multiple-windows-warning").should("not.be.visible");
  });

  it("does not warn about another window that is hidden or not using RFID", () => {
    cy.then(() => {
      other_window.postMessage({ type: "heartbeat", id: "other-window", active: false });
    });
    cy.wait(1000);
    cy.get("#rfid-multiple-windows-warning").should("not.exist");
  });

  it("answers a new window so it can warn right away", () => {
    const heartbeats = [];
    cy.then(() => {
      other_window.onmessage = event => heartbeats.push(event.data);
      other_window.postMessage({ type: "heartbeat", id: "other-window", active: true });
    });
    cy.wrap(heartbeats, { timeout: 1000 }).should(list => {
      expect(list.some(message => message.type === "heartbeat" && message.active)).to.be.true;
    });
  });
});
