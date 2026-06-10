# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional checkin/checkout halt conditions are now configurable per library. Each informational condition can be set to halt RFID auto-processing or be ignored, with a global default and an optional per-branch override. Conditions that require librarian interaction (holds, confirmations, transfers) always halt and are not configurable.
- The CircIT reader port can be overridden via the `KOHA_RFID_CIRCIT_PORT` environment variable or the `RFIDCircitPort` system preference (defaults to port 80 under `/Temporary_Listen_Addresses`)

### Fixed

- The plugin now halts on checkin confirmation and recall modals it previously missed in current Koha: the trapped-hold confirmation (`#hold-found-modal`), the recall modals (`#recalled`, `#recalledwaiting`), and the bundle contents confirmation (`#bundle-needsconfirmation-modal`). Stale selectors that no longer exist in Koha (`#hold-found2`, `ret_ispermenant`) were removed.
- Checkout now halts on hard blockers (the `#circ_impossible` alert), so the librarian notices when an item could not be checked out instead of the plugin silently moving on.
- Checkout now halts on the "needs confirmation" alert for an available item that has an untrapped hold. The confirmation on the checkout page uses the `#circ_needsconfirmation` id, not the `#circ-needsconfirmation-modal` id used on the checkin page, so the plugin no longer recognized it and could skip past the held item without the librarian acting on it.
- Batch checkout no longer cycles endlessly when already-processed items are left on the pad; the page stops resubmitting and waits for a new stack of items ([#9](https://github.com/bywatersolutions/koha-plugin-rfid/issues/9))

## [0.4.0-beta] - 2026-03-17

### Added

- Browser-level toggle to enable/disable RFID plugin functionality, stored in localStorage
- Per-branch enable/disable configuration via plugin settings
- Bootstrap 5 tabbed configuration interface (Branch Settings, Tech Logic)

## [0.3.0-alpha] - 2026-02-26

### Added

- Bibliotheca staffConnect link RFID reader support

### Fixed

- MK Solutions: Don't error on fail, fail may indicate there are no items on the reader

## [0.2.0-beta] - 2026-01-22

### Fixed

- Fixed bugs found in testing with RFID emulator

## [0.1.4-beta] - 2025-11-18

### Fixed

- Improved item reporting speed and fixed item ID polling issues

## [0.1.3-beta] - 2025-11-14

### Changed

- GitHub Actions: Updated package-lock.json

## [0.1.2-beta] - 2025-11-14

### Changed

- GitHub Actions: Removed package-lock.json from artifact

## [0.1.1-beta] - 2025-11-14

### Changed

- Updated GitHub Actions configuration

## [0.1.0-beta] - 2025-11-05

### Added

- Multi-vendor RFID abstraction layer supporting Tech Logic CircIT, MK Solutions, and Bibliotheca
- Floating RFID Controls box with reset button and drag support
- Floating RFID Barcodes box with unprocessed/processed tabs
- Tab visibility detection to pause/resume RFID scanning
- Batch item modification support for multiple stacks of items
- Checkin alert skipping for non-essential messages
- Hold dialog handling for Koha 24.05+

### Changed

- Restyled reset button
- Tidied code with Prettier
