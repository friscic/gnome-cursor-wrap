UUID = cursor-wrap@friscic.github.io
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
FILES = extension.js prefs.js metadata.json

.PHONY: all install link uninstall schemas pack clean

all: schemas

# Compile the GSettings schema in-tree (needed to run from source / symlink).
schemas:
	glib-compile-schemas schemas/

# Copy the extension into the user extensions dir and compile its schema.
install: 
	mkdir -p $(EXTDIR)/schemas
	cp $(FILES) $(EXTDIR)/
	cp schemas/*.gschema.xml $(EXTDIR)/schemas/
	glib-compile-schemas $(EXTDIR)/schemas/
	@echo "Installed. Log out/in (Wayland), then: gnome-extensions enable $(UUID)"

# Symlink the source dir for in-place development.
link: schemas
	mkdir -p $(dir $(EXTDIR))
	ln -sfn $(CURDIR) $(EXTDIR)
	@echo "Linked $(CURDIR) -> $(EXTDIR). Log out/in (Wayland), then enable."

uninstall:
	rm -rf $(EXTDIR)
	@echo "Removed $(EXTDIR)"

# Build a distributable zip via the official tool.
pack: schemas
	gnome-extensions pack --force \
		--extra-source=prefs.js \
		--schema=schemas/org.gnome.shell.extensions.cursor-wrap.gschema.xml
	@echo "Built $(UUID).shell-extension.zip"

clean:
	rm -f schemas/gschemas.compiled *.zip *.shell-extension.zip
