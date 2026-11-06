UUID = cursor-wrap@friscic.github.io
ZIP = $(UUID).shell-extension.zip
SCHEMA = schemas/org.gnome.shell.extensions.cursor-wrap.gschema.xml
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

# Integration tests: container tool, GNOME version for test-container, and
# where logs, results and the tested zip end up.
CONTAINER ?= docker
GNOME ?= 51
TEST_LOGS ?= $(CURDIR)/test-logs

# Distribution image whose GNOME Shell each supported version is tested on.
GNOME_VERSIONS = 48 49 50 51
gnome_base_48 = debian:trixie
gnome_base_49 = fedora:43
gnome_base_50 = ubuntu:26.04
gnome_base_51 = fedora:45

.PHONY: all pack install link uninstall schemas clean lint test test-container test-all

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

# Run the integration tests on the GNOME Shell installed here. This is safe in
# a logged-in session: every test runs its own headless shell on a private bus.
test:
	CW_LOG_DIR=$(TEST_LOGS)/local tests/run.sh

# Run the integration tests in a container with GNOME $(GNOME).
test-container:
	@if [ -z "$(gnome_base_$(GNOME))" ]; then \
		echo "No test image for GNOME $(GNOME); supported: $(GNOME_VERSIONS)"; exit 1; fi
	$(CONTAINER) build --build-arg BASE=$(gnome_base_$(GNOME)) \
		-f tests/containers/Containerfile -t cursor-wrap-test:gnome$(GNOME) tests/containers
	rm -rf $(TEST_LOGS)/gnome$(GNOME)
	mkdir -p $(TEST_LOGS)/gnome$(GNOME)
	$(CONTAINER) run --rm -v $(CURDIR):/src:ro -v $(TEST_LOGS)/gnome$(GNOME):/logs \
		-e CW_LOG_DIR=/logs cursor-wrap-test:gnome$(GNOME)

# Run the integration tests on every supported GNOME version.
test-all:
	@failed=; for v in $(GNOME_VERSIONS); do \
		$(MAKE) --no-print-directory test-container GNOME=$$v || failed="$$failed $$v"; \
	done; \
	if [ -n "$$failed" ]; then echo "Failed on GNOME:$$failed"; exit 1; fi; \
	echo "All GNOME versions passed: $(GNOME_VERSIONS)"
