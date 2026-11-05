# Cursor Wrap

A GNOME Shell extension that wraps the mouse pointer around the outer edges of
your monitor layout. Push the cursor off the far-left edge and it reappears on
the far-right edge (and vice versa). Optional vertical wrapping too.

It works **natively on Wayland** as well as X11. Classic tools like `encircle`
rely on `XWarpPointer`, which Wayland blocks for security; this extension runs
inside GNOME Shell (the compositor) and warps the pointer through Meta/Clutter,
which is permitted.

## Features

- Horizontal wrap (far-left ⟷ far-right outer edge), on by default.
- Optional vertical wrap (top ⟷ bottom outer edge).
- Multi-monitor aware: it reads live monitor geometry, so it keeps working when
  you rearrange, add, or remove displays — no hardcoded layout.
- Only acts on the **outer** edges of the whole layout. Seams between adjacent
  monitors behave normally.
- A short cooldown prevents the just-warped pointer from bouncing back.

## Requirements

- GNOME Shell 48, 49, or 50 (developed and tested against 50 on Ubuntu 26.04).
- A Wayland or X11 GNOME session.

## Install (from source)

```bash
make install     # copies into ~/.local/share/gnome-shell/extensions and compiles the schema
```

Then log out and back in (Wayland requires a fresh login to load a newly
installed extension), and enable it:

```bash
gnome-extensions enable cursor-wrap@friscic.github.io
```

Open settings (horizontal/vertical toggles):

```bash
gnome-extensions prefs cursor-wrap@friscic.github.io
```

### Develop in place

`make link` symlinks this source directory into the extensions folder instead
of copying, so edits here are picked up on the next login.

```bash
make link
glib-compile-schemas schemas/
```

## Uninstall

```bash
make uninstall
```

## How it works

The extension connects to the stage's `captured-event` signal, watches pointer
motion, and when the pointer lands within a couple of pixels of an outer edge
of the monitor union it computes the mirrored position on the opposite edge and
calls `Clutter.Seat.warp_pointer`. The destination coordinate is clamped so it
always lands on a real monitor, even when monitors have different vertical
offsets (as in a mixed ultrawide + 1080p row).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
