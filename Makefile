UUID = cursor-wrap@friscic.github.io
ZIP = $(UUID).shell-extension.zip
SCHEMA = schemas/org.gnome.shell.extensions.cursor-wrap.gschema.xml
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

# Integration tests: container tool, GNOME version for test-container, and
# where logs, results and the tested zip end up.
CONTAINER ?= docker
GNOME ?= 51
TEST_LOGS ?= $(CURDIR)/test-logs

# Supported GNOME versions come from shell-version in metadata.json, read by
# tests/supported-versions.sh, so this list and the published metadata cannot
# drift apart. CI reads the same script to build its test matrix.
GNOME_VERSIONS := $(shell tests/supported-versions.sh)

# The next GNOME version, tested by the canary target against a rolling image
# before a stable distribution ships it.
GNOME_NEXT := $(shell tests/supported-versions.sh --next)

# Distribution image whose GNOME Shell each version is tested on. The canary
# (GNOME_NEXT) rides Fedora Rawhide, which carries GNOME betas and .0 releases
# earliest. Add a pinned base below when a version becomes supported.
gnome_base_48 = debian:trixie
gnome_base_49 = fedora:43
gnome_base_50 = ubuntu:26.04
gnome_base_51 = fedora:45
gnome_base_$(GNOME_NEXT) ?= fedora:rawhide

.PHONY: all pack install link uninstall schemas clean lint shellcheck check-versions print-base test test-container test-canary test-all

all: pack

# Build the zip that is uploaded to extensions.gnome.org and attached to
# releases. Only extension.js, prefs.js, metadata.json and the schema go in.
pack: $(ZIP)

$(ZIP): extension.js prefs.js metadata.json $(SCHEMA)
	gnome-extensions pack --force --schema=$(SCHEMA) .

# Install the zip the same way end users do. A symlink from `make link` is
# removed first: `gnome-extensions install --force` would otherwise delete the
# files the link points to, i.e. this source tree.
install: pack
	@if [ -L "$(EXTDIR)" ]; then rm "$(EXTDIR)" && echo "Removed development symlink $(EXTDIR)"; fi
	gnome-extensions install --force $(ZIP)
	@echo "Installed. Log out and back in, then run: gnome-extensions enable $(UUID)"

# Compile the schema in-tree (needed when running from a symlink).
schemas:
	glib-compile-schemas --strict schemas/

# Symlink the source dir for in-place development.
link: schemas
	@if [ -e "$(EXTDIR)" ] && [ ! -L "$(EXTDIR)" ]; then \
		echo "$(EXTDIR) is an installed copy. Run 'make uninstall' first."; exit 1; fi
	mkdir -p $(dir $(EXTDIR))
	ln -sfn $(CURDIR) $(EXTDIR)
	@echo "Linked $(CURDIR) -> $(EXTDIR). Log out and back in, then enable it."

# Removes an installed copy, or only the symlink after `make link`.
uninstall:
	rm -rf $(EXTDIR)
	@echo "Removed $(EXTDIR). Log out and back in to unload it."

clean:
	rm -f schemas/gschemas.compiled $(ZIP)
	rm -rf $(TEST_LOGS)

node_modules: package.json package-lock.json
	npm ci
	@touch $@

# Lint all JavaScript with ESLint (needs Node.js and npm).
lint: node_modules
	npx eslint .

# Check the test scripts with ShellCheck, run from its pinned container image
# so local runs and CI use the same version.
SHELLCHECK_IMAGE = koalaman/shellcheck:v0.11.0
SHELL_SCRIPTS = tests/run.sh tests/supported-versions.sh tests/containers/entrypoint.sh
shellcheck:
	$(CONTAINER) run --rm -v $(CURDIR):/mnt:ro -w /mnt $(SHELLCHECK_IMAGE) $(SHELL_SCRIPTS)

# Run the integration tests on the GNOME Shell installed here. This is safe in
# a logged-in session: every test runs its own headless shell on a private bus.
test:
	CW_LOG_DIR=$(TEST_LOGS)/local tests/run.sh

# Run the integration tests in a container with GNOME $(GNOME).
test-container:
	@if [ -z "$(gnome_base_$(GNOME))" ]; then \
		echo "No test image for GNOME $(GNOME); supported: $(GNOME_VERSIONS), canary: $(GNOME_NEXT)"; exit 1; fi
	$(CONTAINER) build --build-arg BASE=$(gnome_base_$(GNOME)) \
		-f tests/containers/Containerfile -t cursor-wrap-test:gnome$(GNOME) tests/containers
	rm -rf $(TEST_LOGS)/gnome$(GNOME)
	mkdir -p $(TEST_LOGS)/gnome$(GNOME)
	$(CONTAINER) run --rm -v $(CURDIR):/src:ro -v $(TEST_LOGS)/gnome$(GNOME):/logs \
		-e CW_LOG_DIR=/logs -e CW_IGNORE_SHELL_VERSION=$(CW_IGNORE_SHELL_VERSION) \
		cursor-wrap-test:gnome$(GNOME)

# Run the integration tests on every supported GNOME version.
test-all:
	@failed=; for v in $(GNOME_VERSIONS); do \
		$(MAKE) --no-print-directory test-container GNOME=$$v || failed="$$failed $$v"; \
	done; \
	if [ -n "$$failed" ]; then echo "Failed on GNOME:$$failed"; exit 1; fi; \
	echo "All GNOME versions passed: $(GNOME_VERSIONS)"

# Test against the next, not-yet-supported GNOME on a rolling image. Run on a
# schedule to catch breakage from a new GNOME release early. A failure here is
# an early warning, not a regression in a supported version. The shell-version
# check is switched off, since metadata.json does not list this version yet.
test-canary:
	@echo "Canary: testing against the next GNOME ($(GNOME_NEXT)) on $(gnome_base_$(GNOME_NEXT))"
	$(MAKE) --no-print-directory test-container GNOME=$(GNOME_NEXT) CW_IGNORE_SHELL_VERSION=1

# Show the supported GNOME versions (from shell-version in metadata.json) and
# the next version the canary probes.
check-versions:
	@echo "Supported GNOME versions (from metadata.json): $(GNOME_VERSIONS)"
	@echo "Next version probed by the canary: $(GNOME_NEXT)"

# Print the container base image for GNOME=<v>, or nothing if none is defined.
# CI uses this to assert that every supported version has a test image.
print-base:
	@echo "$(gnome_base_$(GNOME))"
