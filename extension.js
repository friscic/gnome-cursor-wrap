/*
 * Cursor Wrap — GNOME Shell extension
 *
 * Wraps the mouse pointer around the outer edges of the combined monitor
 * layout. When the pointer reaches the far-left edge of the leftmost monitor
 * it is warped to the far-right edge of the rightmost monitor (and vice
 * versa); likewise for the top/bottom outer edges when enabled.
 *
 * Why this exists: classic X11 tools (e.g. encircle) warp the pointer with
 * XWarpPointer, which Wayland forbids for security. Inside GNOME Shell we run
 * as part of the compositor, so we may move the pointer through Meta/Clutter
 * APIs. That is the Wayland-legal path this extension uses.
 *
 * Design notes:
 *  - We read the live monitor geometry from Meta every time we need it, so the
 *    extension keeps working when displays are rearranged, added, or removed.
 *  - Edge detection is cheap and only acts when the pointer is within a 1px
 *    band of an OUTER edge of the union of all monitors. Interior edges
 *    between adjacent monitors are never touched, so normal monitor-to-monitor
 *    movement is unaffected.
 *  - After warping we set a short cooldown so the pointer landing near the
 *    opposite edge cannot immediately re-trigger a wrap back.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

// Pixels inside the outer edge at which a wrap triggers. 1px is enough because
// the compositor clamps the pointer to the edge; a tiny band avoids missing
// fast flicks.
const EDGE_THRESHOLD = 2;

// Where to place the pointer after wrapping, measured inward from the opposite
// outer edge, so it lands clearly on-screen rather than exactly on the border
// (which could immediately re-detect).
const LANDING_INSET = 3;

// Minimum time between wraps (ms): prevents a just-warped pointer from
// bouncing straight back when the user keeps pushing in the same direction.
const WRAP_COOLDOWN_MS = 150;

// Pointer sampling interval (ms). GNOME Shell's PointerWatcher polls
// global.get_pointer() rather than relying on captured stage events (which do
// not fire for free pointer motion over windows). 10ms (~100Hz) is responsive
// enough to catch the pointer pinned at an edge without measurable cost.
const POLL_INTERVAL_MS = 10;

export default class CursorWrapExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._seat = Clutter.get_default_backend().get_default_seat();
        this._lastWrapTime = 0;

        // Poll the pointer via GNOME Shell's PointerWatcher. This is the
        // approach the magnifier/zoom uses: captured stage events do NOT fire
        // for free pointer motion over windows, so an event hook silently sees
        // nothing. Polling global.get_pointer() always reflects the real
        // position regardless of what is under the cursor.
        this._pointerWatcher = PointerWatcher.getPointerWatcher();
        this._watch = this._pointerWatcher.addWatch(
            POLL_INTERVAL_MS,
            this._onPointerMoved.bind(this)
        );
    }

    disable() {
        if (this._watch && this._pointerWatcher) {
            // The watch is removed through the watcher, matching how GNOME
            // Shell's own consumers (e.g. ubuntu-dock) tear theirs down.
            this._pointerWatcher._removeWatch(this._watch);
        }
        this._watch = null;
        this._pointerWatcher = null;
        this._seat = null;
        this._settings = null;
    }

    _onPointerMoved(x, y) {
        const now = GLib.get_monotonic_time() / 1000; // us -> ms
        if (now - this._lastWrapTime < WRAP_COOLDOWN_MS)
            return;

        const target = this._computeWrapTarget(x, y);
        if (target) {
            this._lastWrapTime = now;
            this._warpPointer(target.x, target.y);
        }
    }

    /*
     * Given the current pointer position, return {x, y} to warp to if the
     * pointer is sitting on an OUTER edge of the monitor union, else null.
     *
     * The union bounding box is computed from all monitors. We only wrap on an
     * edge that is the extreme edge of the whole layout (e.g. the left side of
     * the leftmost monitor), never on a seam between two monitors.
     */
    _computeWrapTarget(x, y) {
        const wrapHorizontal = this._settings.get_boolean('wrap-horizontal');
        const wrapVertical = this._settings.get_boolean('wrap-vertical');

        const monitors = this._getMonitorRects();
        if (monitors.length === 0)
            return null;

        // Union bounding box of all monitors (in global/stage coordinates).
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of monitors) {
            minX = Math.min(minX, m.x);
            minY = Math.min(minY, m.y);
            maxX = Math.max(maxX, m.x + m.width);
            maxY = Math.max(maxY, m.y + m.height);
        }

        // Horizontal wrap: left outer edge <-> right outer edge.
        if (wrapHorizontal) {
            if (x <= minX + EDGE_THRESHOLD) {
                // At far-left: jump to far-right, keeping y clamped onto a real
                // monitor at the destination column.
                const destX = maxX - LANDING_INSET;
                return { x: destX, y: this._clampYToMonitorAt(destX, y, monitors) };
            }
            if (x >= maxX - EDGE_THRESHOLD - 1) {
                const destX = minX + LANDING_INSET;
                return { x: destX, y: this._clampYToMonitorAt(destX, y, monitors) };
            }
        }

        // Vertical wrap: top outer edge <-> bottom outer edge.
        if (wrapVertical) {
            if (y <= minY + EDGE_THRESHOLD) {
                const destY = maxY - LANDING_INSET;
                return { x: this._clampXToMonitorAt(destY, x, monitors), y: destY };
            }
            if (y >= maxY - EDGE_THRESHOLD - 1) {
                const destY = minY + LANDING_INSET;
                return { x: this._clampXToMonitorAt(destY, x, monitors), y: destY };
            }
        }

        return null;
    }

    /*
     * When wrapping horizontally, the destination column (destX) may cross
     * monitors whose vertical extent differs from where the pointer currently
     * is. Clamp y so it lands inside a monitor that actually covers destX,
     * picking the monitor whose vertical range is closest to the current y.
     */
    _clampYToMonitorAt(destX, y, monitors) {
        const covering = monitors.filter(
            m => destX >= m.x && destX < m.x + m.width
        );
        if (covering.length === 0)
            return y;

        // Prefer a monitor that already contains y; otherwise clamp into the
        // nearest one vertically.
        for (const m of covering) {
            if (y >= m.y && y < m.y + m.height)
                return y;
        }
        // Clamp into the covering monitor whose range is nearest to y.
        let best = covering[0];
        let bestDist = Infinity;
        for (const m of covering) {
            const cy = Math.max(m.y, Math.min(y, m.y + m.height - 1));
            const d = Math.abs(cy - y);
            if (d < bestDist) {
                bestDist = d;
                best = m;
            }
        }
        return Math.max(best.y + 1, Math.min(y, best.y + best.height - 2));
    }

    // Mirror of _clampYToMonitorAt for vertical wraps.
    _clampXToMonitorAt(destY, x, monitors) {
        const covering = monitors.filter(
            m => destY >= m.y && destY < m.y + m.height
        );
        if (covering.length === 0)
            return x;

        for (const m of covering) {
            if (x >= m.x && x < m.x + m.width)
                return x;
        }
        let best = covering[0];
        let bestDist = Infinity;
        for (const m of covering) {
            const cx = Math.max(m.x, Math.min(x, m.x + m.width - 1));
            const d = Math.abs(cx - x);
            if (d < bestDist) {
                bestDist = d;
                best = m;
            }
        }
        return Math.max(best.x + 1, Math.min(x, best.x + best.width - 2));
    }

    /*
     * Read current monitor rectangles from Meta in global coordinates.
     * Using the display's monitor geometry keeps us correct across hotplug and
     * rearrangement without any hardcoded layout.
     */
    _getMonitorRects() {
        const display = global.display;
        const n = display.get_n_monitors();
        const rects = [];
        for (let i = 0; i < n; i++) {
            const r = display.get_monitor_geometry(i);
            rects.push({ x: r.x, y: r.y, width: r.width, height: r.height });
        }
        return rects;
    }

    // Warp the pointer. Clutter.Seat exposes warp_pointer (clutter_seat_warp_
    // pointer in mutter-18), which the compositor is allowed to call on Wayland.
    _warpPointer(x, y) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (this._seat && this._seat.warp_pointer) {
            this._seat.warp_pointer(ix, iy);
        } else {
            // Fallback for older API: Clutter global backend seat.
            const seat = Clutter.get_default_backend().get_default_seat();
            seat.warp_pointer(ix, iy);
        }
    }
}
