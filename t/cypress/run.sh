#!/bin/bash
#
# Run the RFID Cypress suite once per vendor emulator.
#
# The plugin auto-detects the live RFID reader by probing each vendor in turn,
# so only ONE emulator may run at a time. This script starts each emulator,
# runs the full suite against it, then moves on to the next -- the same specs
# must pass for every vendor.
#
# Prerequisites:
#   - A ktd instance running with the plugin mounted and installed, e.g.
#       SYNC_REPO=/path/to/koha \
#         ktd --proxy --name rfidtest \
#             --single-plugin "$(pwd)" up -d
#       ktd --name rfidtest --wait-ready 300
#       ktd --name rfidtest --shell --run "perl misc/devel/install_plugins.pl"
#   - The rfid-emulators repo checked out ( bibliotheca.pl, mksolutions_emulator.pl, ... )
#   - Cypress installed ( npm install )
#
# Configurable via environment:
#   KTD_NAME        ktd instance name           ( default: rfidtest )
#   KTD_HOME        koha-testing-docker checkout ( default: ~/repos/koha-testing-docker )
#   BASE_URL        Koha staff client URL        ( default: http://rfidtest-intra.localhost )
#   EMULATORS_DIR   rfid-emulators checkout      ( default: ~/repos/rfid-emulators )
#   VENDORS         space-separated vendor list  ( default: "mksolutions bibliotheca" )
#
# Usage:
#   t/cypress/run.sh                 # run all default vendors
#   VENDORS=bibliotheca t/cypress/run.sh
set -euo pipefail

KTD_NAME="${KTD_NAME:-rfidtest}"
KTD_HOME="${KTD_HOME:-$HOME/repos/koha-testing-docker}"
BASE_URL="${BASE_URL:-http://${KTD_NAME}-intra.localhost}"
EMULATORS_DIR="${EMULATORS_DIR:-$HOME/repos/rfid-emulators}"
VENDORS="${VENDORS:-mksolutions bibliotheca circit}"

# Port the circit emulator + plugin use during testing. The real reader uses
# privileged port 80 ( which also collides with the ktd Traefik proxy ), so the
# suite runs the emulator on this port and passes it to the specs ( as
# CYPRESS_circitPort ), which point the plugin at it via the RFIDCircitPort
# system preference. This is the single source of truth for the circit test port.
CIRCIT_TEST_PORT="${CIRCIT_TEST_PORT:-8090}"

# Resolve the plugin repo root ( two levels up from this script )
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGIN_NAME="$(basename "$PLUGIN_DIR")"
KTD="$KTD_HOME/bin/ktd"

# Per-vendor emulator script. circit normally uses privileged port 80; the
# suite runs it on CIRCIT_TEST_PORT instead ( the specs point the plugin at that
# port via the RFIDCircitPort system preference ).
emulator_script() {
    case "$1" in
        mksolutions) echo "mksolutions_emulator.pl" ;;
        bibliotheca) echo "bibliotheca.pl" ;;
        circit)      echo "circit_emulator.pl" ;;
        *) echo "unknown vendor: $1" >&2; return 1 ;;
    esac
}
emulator_port() {
    case "$1" in
        mksolutions) echo "4039" ;;
        bibliotheca) echo "21645" ;;
        circit)      echo "$CIRCIT_TEST_PORT" ;;
        *) echo "unknown vendor: $1" >&2; return 1 ;;
    esac
}

EMULATOR_PID=""
stop_emulator() {
    if [ -n "$EMULATOR_PID" ]; then
        kill "$EMULATOR_PID" 2>/dev/null || true
        wait "$EMULATOR_PID" 2>/dev/null || true
        EMULATOR_PID=""
    fi
}
trap stop_emulator EXIT

# Seed deterministic test data ( patron + items ) and capture the fixture.
# The specs build their own Koha data ( see t/cypress/support ), so there is no
# separate seed step. Setup reaches the database directly via cy.task("query"),
# so the ktd instance must expose MySQL to the host -- bring it up with
# --local-db. Defaults below match such an instance; override for other setups.
echo ">> Test data is built by the specs ( no seed step )"
export DB_HOSTNAME="${DB_HOSTNAME:-127.0.0.1}"
export DB_PORT="${DB_PORT:-3306}"
export DB_USER="${DB_USER:-koha_kohadev}"
export DB_PASSWORD="${DB_PASSWORD:-password}"
export DB_NAME="${DB_NAME:-koha_kohadev}"

# Most of the suite is pure DOM-probing halt logic that behaves identically for
# every vendor, so it runs once ( on the first vendor ). Only the genuinely
# vendor-specific specs -- reader detection and the security-bit round-trip --
# re-run for each subsequent vendor.
PER_VENDOR_SPECS="$SCRIPT_DIR/integration/smoke.cy.js,$SCRIPT_DIR/integration/checkout/plain_checkout.cy.js,$SCRIPT_DIR/integration/checkin/plain_checkin.cy.js"

OVERALL_RC=0
first_vendor=1
for vendor in $VENDORS; do
    script="$(emulator_script "$vendor")"
    port="$(emulator_port "$vendor")"
    url="http://127.0.0.1:${port}"

    echo
    echo "============================================================"
    echo ">> Vendor: $vendor  (emulator $script on $url)"
    echo "============================================================"

    # Listen on both loopback addresses: the bibliotheca / circit vendors use
    # the host "localhost", which Chromium often resolves to ::1 first, so an
    # IPv4-only emulator would never be reached by the plugin. Bind the
    # specific loopback addresses ( 127.0.0.1 and [::1] ) rather than the
    # wildcards "*" and "[::]" -- on Linux "[::]" is dual-stack and also grabs
    # 0.0.0.0, which collides with "*" and makes the emulator fail to start.
    stop_emulator
    ( cd "$EMULATORS_DIR" && exec perl "$script" daemon \
        -l "http://127.0.0.1:${port}" -l "http://[::1]:${port}" ) &
    EMULATOR_PID=$!

    # Wait for the emulator to answer
    emulator_up=""
    for _ in $(seq 1 20); do
        if curl -fs -o /dev/null "${url}/getitems"; then emulator_up=1; break; fi
        sleep 0.5
    done

    if [ -z "$emulator_up" ]; then
        echo "!! Emulator for $vendor never came up on $url -- skipping" >&2
        OVERALL_RC=1
        stop_emulator
        continue
    fi

    if [ "$first_vendor" -eq 1 ]; then
        echo "   ( running the full suite )"
        run_specs=""
    else
        echo "   ( running the vendor-specific subset )"
        run_specs="--spec $PER_VENDOR_SPECS"
    fi

    if ! CYPRESS_baseUrl="$BASE_URL" CYPRESS_emulatorUrl="$url" \
        CYPRESS_circitPort="$CIRCIT_TEST_PORT" \
        npx cypress run --project "$SCRIPT_DIR" $run_specs; then
        echo "!! Suite FAILED for vendor $vendor" >&2
        OVERALL_RC=1
    fi

    stop_emulator
    first_vendor=0
done

exit "$OVERALL_RC"
