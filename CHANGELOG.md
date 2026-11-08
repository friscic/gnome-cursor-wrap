# Changelog

All notable changes to Cursor Wrap are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
date-free version headings that match `version-name` in `metadata.json`.

## [Unreleased]

### Changed

- Maintenance tooling: the supported GNOME versions now come from a single
  source (`shell-version` in `metadata.json`, read by
  `tests/supported-versions.sh`), so the CI test matrix, the Makefile, and the
  published metadata can no longer drift apart.
- The release job publishes the zip tested on the newest supported GNOME,
  determined from `metadata.json` instead of a hard-coded version.

### Added

- Monthly CI canary job that runs the integration tests against the next,
  not-yet-supported GNOME on a rolling image, as an early warning for API
  changes in a new GNOME release. It never gates pushes or releases.
- CI check that every supported GNOME version has a test container image.
- `make test-canary`, `make check-versions`, and `make print-base` targets.
- `CW_IGNORE_SHELL_VERSION=1` for `tests/run.sh`, which lets the canary load
  the extension on a GNOME version not yet listed in `shell-version`.
- `CHANGELOG.md` and `RELEASING.md`.

## [1.2]

- Baseline for this changelog. Earlier history is in the git log and the
  GitHub releases.

[Unreleased]: https://github.com/friscic/gnome-cursor-wrap/compare/v1.2...HEAD
[1.2]: https://github.com/friscic/gnome-cursor-wrap/releases/tag/v1.2
