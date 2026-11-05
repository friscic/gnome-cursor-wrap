# Cursor Wrap

A GNOME Shell extension that wraps the mouse pointer around the outer edges of
your monitor layout. Push the cursor off the far-left edge and it reappears on
the far-right edge (and vice versa). Optional vertical wrapping too.

It works **natively on Wayland**. Classic tools like `encircle` rely on
`XWarpPointer`, which Wayland blocks for security; this extension runs inside
GNOME Shell (the compositor), which is allowed to move the pointer.

## Features

- Horizontal wrap (far-left ⟷ far-right outer edge), on by default.
- Optional vertical wrap (top ⟷ bottom outer edge).
- Works with one or more monitors and adapts when you rearrange, add, or
  remove displays.
- Only the **outer** edges of the whole layout wrap. Seams between adjacent
  monitors behave normally.
- Monitors with different sizes or vertical offsets are handled: the pointer
  keeps its height when the opposite side has a monitor there, otherwise it
  lands on the closest point of the monitor on that side.
- No wrapping while a mouse button is held, so dragging a window to a screen
  edge to tile it, drag and drop, and text selection keep working.
- No polling on Wayland: the extension only does work when the pointer moves.

## Requirements

- GNOME Shell 48, 49, 50, or 51.
- A Wayland session. X11 sessions (only GNOME 48 and 49 still have one) are
  supported with a fallback that polls the pointer position every 10 ms.

## Install

### From a release zip

Download `cursor-wrap@friscic.github.io.shell-extension.zip` from the
[Releases page](https://github.com/friscic/gnome-cursor-wrap/releases), then:

```bash
gnome-extensions install --force cursor-wrap@friscic.github.io.shell-extension.zip
```

Log out and back in (on Wayland, GNOME Shell only picks up newly installed
extensions at login), then enable it:

```bash
gnome-extensions enable cursor-wrap@friscic.github.io
```

You can also enable it in the Extensions app or Extension Manager.

### From source

Requires `git` and `make`; `gnome-extensions` ships with GNOME Shell.

```bash
git clone https://github.com/friscic/gnome-cursor-wrap.git
cd gnome-cursor-wrap
make install
```

`make install` builds the same zip as a release and installs it with
`gnome-extensions install`. Then log out and back in and enable it as above.

## Settings

Open the preferences window:

```bash
gnome-extensions prefs cursor-wrap@friscic.github.io
```

There are two switches: **Wrap horizontally** (on by default) and **Wrap
vertically** (off by default). Changes apply immediately.

## Known limitations

- Anything you reach by pushing the pointer against a wrapping edge gets
  harder to hit, because overshooting now sends the pointer to the other side.
  Examples: a dock on the left or right edge, scrollbars of maximized windows
  on the far right, and the Activities hot corner (top left; Ubuntu turns hot
  corners off by default). Moving the dock to the bottom avoids this with
  horizontal wrapping.
- Only edges on the outer bounding box of the layout wrap. In staggered or
  L-shaped layouts, a monitor edge that faces empty space but is not on the
  bounding box does not wrap.
- Pointer barriers from other extensions can stop a wrap partway, for example
  a dock set to auto-hide with "push to reveal" on the side of a monitor in the
  middle of the layout. The pointer then stops at that monitor's edge. GNOME
  Shell's own barriers (hot corners, end of the top bar) are routed around.
- Games that confine the pointer to their window keep it there: the compositor
  applies the confinement to the warp as well.

## Troubleshooting

- **Not listed after installing:** log out and back in.
- **Check that it is running:** `gnome-extensions info cursor-wrap@friscic.github.io`
  should show `State: ACTIVE`.
- **Look for errors:**

  ```bash
  journalctl --user -b -o cat _COMM=gnome-shell | grep -i -A5 cursor-wrap
  ```

When reporting a problem, include the output of `gnome-shell --version`,
`echo $XDG_SESSION_TYPE`, your monitor arrangement, and any log lines.

## Uninstall

```bash
gnome-extensions uninstall cursor-wrap@friscic.github.io
```

## How it works

The extension listens to Mutter's cursor tracker, which reports every pointer
motion, and checks once per frame whether the pointer is on the outermost pixel
of the layout's bounding box. If so, it moves the pointer with
`Clutter.Seat.warp_pointer()` to a spot 3 px inside the opposite edge, on a
monitor that covers that edge. Each visit to an edge wraps at most once, so a
blocked warp is not retried in a loop.

Mutter applies pointer barriers to warps, and GNOME Shell puts barriers near
the top of each monitor (hot corners, and the right end of the top bar on the
primary monitor). A straight warp through that area stops at the barrier, so
the extension moves the pointer in short straight steps along a row below
those barriers.

## Development

`make link` symlinks this directory into the extensions folder instead of
copying it, so changes are picked up at the next login:

```bash
make link
```

With a linked install, remove it with `make uninstall`, and switch to a normal
install with `make install`. Do not run `gnome-extensions uninstall` or
`gnome-extensions install --force` on top of the link: they follow it and
delete the files in this directory, including `.git`.

`make pack` builds `cursor-wrap@friscic.github.io.shell-extension.zip`, which
contains only `extension.js`, `prefs.js`, `metadata.json`, and the schema.
That is the file to upload to extensions.gnome.org or attach to a GitHub
release.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
