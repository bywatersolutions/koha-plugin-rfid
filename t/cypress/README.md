# RFID plugin Cypress tests

End-to-end tests for the RFID plugin. They drive a real Koha staff client in a
browser and a real RFID reader emulator, exercising the plugin the same way a
librarian's workstation does.

## How it fits together

```
  Cypress (browser on host)
        |  visits Koha staff client            -> ktd Koha (staff client)
        |  plugin JS polls the RFID reader     -> RFID emulator (host, one vendor)
        |  cy.request sets items "on the pad"   -> RFID emulator control API
```

- The plugin auto-detects the live RFID reader by probing each vendor in turn,
  so **only one emulator may run at a time**. The suite is vendor-agnostic and
  is run once per emulator; the same specs must pass for every vendor.
- All three vendor emulators expose the same control API
  (`POST /api/barcodes`, `GET /getitems`), so the `setPad` / `resetPad` helpers
  work regardless of which vendor is running. The runner points them at the
  live emulator via `CYPRESS_emulatorUrl`.

## Layout

| Path | Purpose |
|------|---------|
| `cypress.config.js` | Config + env defaults; registers the `query` / `api*` tasks |
| `plugins/db.js` | `cy.task("query")` — direct SQL ( sysprefs, item flags, fines ) |
| `plugins/api.js` | `cy.task("apiGet"/"apiPost"/...)` — Koha REST API |
| `support/commands.js` | `loginToKoha`, `setPad`, data builders (`ensureItem`, `ensurePatron`, `ensureBaseData`, ...) |
| `support/halt.js` | Halt / proceed assertions, security-bit readback, halt-config injection |
| `support/e2e.js` | Builds base data once per spec; per-test reset of plugin localStorage + the pad |
| `integration/**` | The specs ( checkout, checkin, batch_checkout, config ) |
| `run.sh` | Runs the whole suite once per vendor emulator |

The specs build their own Koha data ( patron, items, holds, checkouts, recalls,
sysprefs ) from the spec itself — there is no separate seed script. This mirrors
Koha's own Cypress framework: the REST API for objects, direct SQL for state the
API does not expose.

## Prerequisites

1. The **rfid-emulators** repo checked out (private:
   `git@github.com:bywatersolutions/rfid-emulators.git`), with Perl +
   Mojolicious available to run them.
2. A **ktd** instance with the plugin mounted, installed, and **enabled**.
3. Node + the plugin's dev dependencies (`npm install`, which installs Cypress).

### One-time ktd setup

```sh
# From the plugin repo root. Use --proxy locally so it doesn't fight other ktd
# instances for ports 8080/8081; the staff client is then at
# http://<name>-intra.localhost. --local-db publishes MySQL to the host so the
# specs can reach it via cy.task("query").
SYNC_REPO=/path/to/koha \
  ktd --proxy --name rfidtest --single-plugin "$(pwd)" --local-db up -d
ktd --name rfidtest --wait-ready 300

# Install AND enable the plugin, then restart so its API/static routes mount
ktd --name rfidtest --shell --run "perl misc/devel/install_plugins.pl"
ktd --name rfidtest --shell --run \
  "echo \"INSERT INTO plugin_data (plugin_class,plugin_key,plugin_value) \
    VALUES ('Koha::Plugin::Com::ByWaterSolutions::RFID','__ENABLED__','1') \
    ON DUPLICATE KEY UPDATE plugin_value='1';\" | koha-mysql kohadev"
ktd --name rfidtest --shell --run "sudo koha-plack --restart kohadev; flush_memcached"
```

## Running

The runner starts each emulator, runs the suite, then stops it:

```sh
KTD_NAME=rfidtest \
BASE_URL=http://rfidtest-intra.localhost \
EMULATORS_DIR=/path/to/rfid-emulators \
VENDORS="mksolutions bibliotheca" \
  bash t/cypress/run.sh
```

Or via npm scripts (against a single, already-running emulator):

```sh
CYPRESS_baseUrl=http://rfidtest-intra.localhost \
CYPRESS_emulatorUrl=http://127.0.0.1:4039 \
  npm run cypress:open      # interactive
```

## Notes / gotchas

- **One emulator at a time** (see above).
- Emulators must listen on **both IPv4 and IPv6** — the bibliotheca/circit
  vendors use the host `localhost`, which Chromium often resolves to `::1`
  first. The runner launches them bound to both loopback addresses
  (`-l http://127.0.0.1:PORT -l http://[::1]:PORT`). Note: don't use the
  wildcards `*` and `[::]` together — on Linux `[::]` is dual-stack and also
  grabs `0.0.0.0`, colliding with `*` so the emulator fails to start.
- **circit** runs on an unprivileged port during testing. The real reader uses
  port 80 under the `/Temporary_Listen_Addresses` path (which also collides with
  the ktd Traefik proxy), so the specs set the `RFIDCircitPort` system
  preference to point the plugin at `CIRCIT_TEST_PORT` (default 8090, passed in
  as `CYPRESS_circitPort`) and the runner starts the emulator there. The
  plugin's CircIT port can be overridden in production too, via the
  `KOHA_RFID_CIRCIT_PORT` environment variable or the `RFIDCircitPort` system
  preference.
- The issue #9 regression test seeds the plugin's `processed_barcodes`
  localStorage and asserts the batch checkout page never reloads — reproducing
  "the screen keeps jumping" and proving the fix.
