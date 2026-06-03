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
# suite overrides it via the RFIDCircitPort system preference set in seed.pl;
# this value MUST match the CIRCIT_PORT seed.pl writes.
CIRCIT_TEST_PORT="${CIRCIT_TEST_PORT:-8090}"

# Resolve the plugin repo root ( two levels up from this script )
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGIN_NAME="$(basename "$PLUGIN_DIR")"
KTD="$KTD_HOME/bin/ktd"

# Per-vendor emulator script. circit normally uses privileged port 80; the
# suite runs it on CIRCIT_TEST_PORT instead ( see seed.pl, which points the
# plugin at that port via the RFIDCircitPort system preference ).
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
echo ">> Seeding test data in ktd instance '$KTD_NAME'"
mkdir -p "$SCRIPT_DIR/fixtures"
SEED_JSON="$("$KTD" --name "$KTD_NAME" --shell --run \
    "perl /kohadevbox/plugins/$PLUGIN_NAME/t/cypress/seed.pl" 2>/dev/null | tail -1)"
if ! echo "$SEED_JSON" | grep -q borrowernumber; then
    echo "!! Seeding failed; got: $SEED_JSON" >&2
    exit 1
fi
echo "$SEED_JSON" > "$SCRIPT_DIR/fixtures/seed.json"
echo "   seed.json: $SEED_JSON"

OVERALL_RC=0
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

    if ! CYPRESS_baseUrl="$BASE_URL" CYPRESS_emulatorUrl="$url" \
        npx cypress run --project "$SCRIPT_DIR"; then
        echo "!! Suite FAILED for vendor $vendor" >&2
        OVERALL_RC=1
    fi

    stop_emulator
done

exit "$OVERALL_RC"
