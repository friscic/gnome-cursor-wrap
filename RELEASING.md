# Releasing

Checklist for cutting a Cursor Wrap release. CI does the building and
publishing; these are the human steps.

## Steps

1. **Update the changelog.** Move the entries under `## [Unreleased]` in
   [`CHANGELOG.md`](CHANGELOG.md) into a new version section, and refresh the
   comparison links at the bottom.

2. **Bump the version.** Set `version-name` in
   [`metadata.json`](metadata.json) to the new version, for example `"1.3"`.
   Commit both files.

3. **Tag and push.** The tag must be `v` plus the exact `version-name`
   (CI fails the release if they disagree):

   ```bash
   git tag v1.3
   git push origin v1.3
   ```

4. **Let CI run.** On the tag, CI lints, runs the integration tests on every
   supported GNOME version, and, if everything passes, attaches the zip tested
   on the newest supported GNOME to the `v1.3` GitHub release (creating the
   release if needed).

5. **Upload to extensions.gnome.org.** Download that same zip from the GitHub
   release and submit it on <https://extensions.gnome.org>. This step is
   manual; EGO review is out of this repository's control.

## Supporting a new GNOME version

The supported versions live in one place: the `shell-version` array in
[`metadata.json`](metadata.json). The CI test matrix, the canary job, and the
Makefile all read it through `tests/supported-versions.sh`.

When the monthly **canary** job (or `make test-canary`) passes on a new GNOME:

1. Add the version to `shell-version` in `metadata.json`.
2. Add a `gnome_base_<version>` entry in the [`Makefile`](Makefile) pointing at
   a distribution image that ships that GNOME. CI fails the lint job if a
   supported version has no container base, so this cannot be forgotten.
3. Update the version table in [`README.md`](README.md).
4. Release as above.

If the canary job **fails**, a new GNOME likely moved an API the extension
uses. The harness error messages name the renamed internals
(`tests/lib/harness.js`), and the guarded calls in `extension.js` are the
usual suspects. Fix, then adopt the version as above. Rawhide can also break
for packaging reasons unrelated to GNOME, so read the log before assuming an
API change.

The canary runs with `CW_IGNORE_SHELL_VERSION=1`, which turns off GNOME
Shell's shell-version check; without it the not-yet-listed version would
refuse to load the extension. Rawhide only picks up a new GNOME some months
into its cycle; until then the canary tests the current version again. Each
result file records the GNOME version that actually ran.

Things to know about the monthly schedule:

- GitHub sends the failure email for a scheduled run to the user who last
  edited the `cron` line in `ci.yml`.
- In a public repository, GitHub disables scheduled workflows after 60 days
  without repository activity. If the project has been quiet, check the
  Actions tab and re-enable the workflow, or run it by hand with
  "Run workflow".

## Dependency notes

`eslint-config-gnome` in [`package.json`](package.json) is pinned to a specific
commit on GNOME's GitLab (`git+https://gitlab.gnome.org/...#<sha>`), not a
version range, so Dependabot cannot bump it automatically. To update it, pick a
newer commit from
<https://gitlab.gnome.org/World/javascript/eslint-config-gnome>, replace the
SHA after `#`, run `npm install` to refresh `package-lock.json`, and confirm
`make lint` still passes.
