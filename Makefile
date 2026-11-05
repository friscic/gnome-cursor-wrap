UUID = cursor-wrap@friscic.github.io
ZIP = $(UUID).shell-extension.zip
SCHEMA = schemas/org.gnome.shell.extensions.cursor-wrap.gschema.xml
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all pack install link uninstall schemas clean

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
