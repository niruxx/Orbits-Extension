# Orbit Shell — GNOME Shell extension.

UUID     = orbit-dock@niruxx.github.io
SRC      = extension/$(UUID)
EXTDIR   = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
VERSION  = $(shell python3 -c "import json;print(json.load(open('$(SRC)/metadata.json'))['version-name'])")
DIST     = orbit-shell-$(VERSION)

.PHONY: all install uninstall prefs check zip dist pkg-arch

all:
	@echo "Targets: install, uninstall, prefs, check, zip, dist, pkg-arch"

# Install for the current user (log out and back in once on Wayland).
install:
	rm -rf $(EXTDIR) && install -d $(EXTDIR)
	cp -r $(SRC)/. $(EXTDIR)/
	glib-compile-schemas $(EXTDIR)/schemas
	@echo "Installed. Log out and back in, then: gnome-extensions enable $(UUID)"

uninstall:
	rm -rf $(EXTDIR)

prefs:
	gnome-extensions prefs $(UUID)

check:
	glib-compile-schemas --strict --dry-run $(SRC)/schemas
	@for f in $(SRC)/*.js; do gjs -m $$f 2>&1 | grep -q SyntaxError && { echo "Syntax error in $$f"; gjs -m $$f; exit 1; }; done; echo "JS syntax OK"

# Zip for extensions.gnome.org or `gnome-extensions install`.
zip:
	cd $(SRC) && gnome-extensions pack --force \
	  $(foreach f,$(filter-out extension.js prefs.js,$(notdir $(wildcard $(SRC)/*.js))),--extra-source=$(f)) \
	  --out-dir=../..

# Source tarball (used by packaging/arch/PKGBUILD).
dist:
	tar --exclude=gschemas.compiled --transform 's,^,$(DIST)/,' \
	    -czf packaging/arch/$(DIST).tar.gz extension README.md LICENSE Makefile

# Build the Arch package (packaging/arch/gnome-shell-extension-orbit-*.pkg.tar.zst).
pkg-arch: dist
	cd packaging/arch && makepkg -f --cleanbuild
