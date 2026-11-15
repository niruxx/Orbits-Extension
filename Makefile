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
	@command -v gjs >/dev/null || { echo "gjs is required for make check"; exit 1; }
	glib-compile-schemas --strict --dry-run $(SRC)/schemas
	gjs -m tests/checkSyntax.js $(SRC)/*.js tests/*.js
	gjs -m tests/windowInteractions.js
	gjs -m tests/dockFeatures.js
	gjs -m tests/desktopFeatures.js
	gjs -m tests/taskbarFeatures.js
	gjs -m tests/launcherNavigation.js
	gjs -m tests/launcherFeatures.js
	gjs -m tests/sessionActions.js

# Zip for extensions.gnome.org or `gnome-extensions install`.
zip:
	cd $(SRC) && gnome-extensions pack --force \
	  $(foreach f,$(filter-out extension.js prefs.js,$(notdir $(wildcard $(SRC)/*.js))),--extra-source=$(f)) \
	  --out-dir=../..

# Source tarball (used by packaging/arch/PKGBUILD).
dist:
	tar --exclude=gschemas.compiled --transform 's,^,$(DIST)/,' \
	    -czf packaging/arch/$(DIST).tar.gz extension tests README.md roadmap.md LICENSE Makefile

# Build the Arch package (packaging/arch/gnome-shell-extension-orbit-*.pkg.tar.zst).
pkg-arch: dist
	cd packaging/arch && makepkg -f --cleanbuild
