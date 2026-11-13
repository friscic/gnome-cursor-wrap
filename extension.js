// SPDX-License-Identifier: GPL-3.0-or-later

/*
 * Cursor Wrap: moves the pointer to the opposite outer edge of the monitor
 * layout when it reaches the far left/right (and optionally top/bottom) edge.
 *
 * GNOME Shell is the Wayland compositor, so it may warp the pointer with
 * Clutter.Seat.warp_pointer(); a regular Wayland client cannot.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Width in pixels of the band along an outer edge that triggers a wrap. The
// compositor clamps the pointer to the outermost pixel when it is pushed
// against the edge, so one pixel is enough.
const EDGE_ZONE = 1;

// Distance in pixels from the destination monitor's edges where the pointer
// lands. It must be larger than EDGE_ZONE so the landing spot can never
// trigger another wrap.
const LANDING_INSET = 3;

// Polling interval for X11 sessions (GNOME 48/49 only), where the cursor
// tracker does not report pointer motion to extensions.
const X11_POLL_INTERVAL_MS = 10;
const DWELL_DELAY_MS = 200;

const WRAP_MODIFIERS = [
    Clutter.ModifierType.SHIFT_MASK,
    Clutter.ModifierType.MOD1_MASK,
    Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK,
];

const BUTTONS_MASK =
    Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK |
    Clutter.ModifierType.BUTTON4_MASK |
    Clutter.ModifierType.BUTTON5_MASK;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Distance from value to the closest point of the range [start, end].
function distanceToRange(value, start, end) {
    return Math.max(start - value, 0, value - end);
}

function findClosest(monitors, distanceOf) {
    let closest = null;
    let closestDistance = Infinity;
    for (const monitor of monitors) {
        const distance = distanceOf(monitor);
        if (distance < closestDistance) {
            closest = monitor;
            closestDistance = distance;
        }
    }
    return closest;
}

function containsPoint(monitor, x, y) {
    return x >= monitor.x && x < monitor.x + monitor.width &&
        y >= monitor.y && y < monitor.y + monitor.height;
}

// Returns the integer in [min, max] closest to preferred that is outside all
// blocked [start, end] ranges, or null if there is none.
function findClearValue(preferred, min, max, blockedRanges) {
    const isClear = value => value >= min && value <= max &&
        !blockedRanges.some(([start, end]) => value >= start && value <= end);
    const candidates = [
        clamp(Math.round(preferred), min, max), min, max,
        ...blockedRanges.flatMap(([start, end]) => [start - 1, end + 1]),
    ];

    let best = null;
    for (const value of candidates.filter(isClear)) {
        if (best === null || Math.abs(value - preferred) < Math.abs(best - preferred))
            best = value;
    }
    return best;
}

// The seam between two monitors that share part of an edge, or null. A seam
// between side-by-side monitors is crossed along a row in [start, end); one
// between monitors above each other along a column.
function getSeam(a, b) {
    if (a.x + a.width === b.x || b.x + b.width === a.x) {
        const start = Math.max(a.y, b.y);
        const end = Math.min(a.y + a.height, b.y + b.height);
        if (end > start)
            return {crossedBy: 'row', start, end};
    }
    if (a.y + a.height === b.y || b.y + b.height === a.y) {
        const start = Math.max(a.x, b.x);
        const end = Math.min(a.x + a.width, b.x + b.width);
        if (end > start)
            return {crossedBy: 'column', start, end};
    }
    return null;
}

function insetInto(monitor, x, y) {
    return {
        monitor,
        x: clamp(x, monitor.x + LANDING_INSET,
            monitor.x + monitor.width - 1 - LANDING_INSET),
        y: clamp(y, monitor.y + LANDING_INSET,
            monitor.y + monitor.height - 1 - LANDING_INSET),
    };
}

export default class CursorWrapExtension extends Extension {
    enable() {
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._seat = global.stage.get_context().get_backend().get_default_seat();
        // Meta.is_wayland_compositor() only exists up to GNOME 49. GNOME 50
        // removed X11 sessions, so a missing function means Wayland.
        this._isX11 = Meta.is_wayland_compositor?.() === false;
        this._armed = true;

        Main.layoutManager.connectObject('monitors-changed',
            () => this._updateMonitors(), this);
        this._updateMonitors();

        this._settings = this.getSettings();
        this._settings.connectObject('changed',
            () => this._updateSettings(), this);
        this._updateSettings();
    }

    disable() {
        this._stopTracking();

        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);

        this._settings = null;
        this._cursorTracker = null;
        this._seat = null;
        this._monitors = null;
        this._bounds = null;
    }

    _updateSettings() {
        const horizontal = this._settings.get_boolean('wrap-horizontal');
        const vertical = this._settings.get_boolean('wrap-vertical');
        this._wrapLeft = horizontal && this._settings.get_boolean('wrap-left');
        this._wrapRight = horizontal && this._settings.get_boolean('wrap-right');
        this._wrapTop = vertical && this._settings.get_boolean('wrap-top');
        this._wrapBottom = vertical && this._settings.get_boolean('wrap-bottom');
        this._modifierMask = this._settings.get_boolean('require-modifier')
            ? WRAP_MODIFIERS[this._settings.get_uint('wrap-modifier')]
            : 0;
        this._dwellEnabled = this._settings.get_boolean('enable-dwell');

        this._stopTracking();
        if (this._wrapLeft || this._wrapRight || this._wrapTop || this._wrapBottom)
            this._startTracking();
    }

    _updateMonitors() {
        this._cancelDwell();
        this._monitors = Main.layoutManager.monitors.map(
            ({x, y, width, height}) => ({x, y, width, height}));

        if (this._monitors.length === 0) {
            this._bounds = null;
            return;
        }

        // Bounding box of the whole layout. right and bottom are exclusive.
        this._bounds = {
            left: Math.min(...this._monitors.map(m => m.x)),
            top: Math.min(...this._monitors.map(m => m.y)),
            right: Math.max(...this._monitors.map(m => m.x + m.width)),
            bottom: Math.max(...this._monitors.map(m => m.y + m.height)),
        };
    }

    _startTracking() {
        if (this._isX11) {
            this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                X11_POLL_INTERVAL_MS, () => {
                    this._checkPointer();
                    return GLib.SOURCE_CONTINUE;
                });
        } else {
            this._cursorTracker.connectObject('position-invalidated',
                () => this._queueCheck(), this);
        }
    }

    _stopTracking() {
        this._cursorTracker.disconnectObject(this);
        this._cancelDwell();

        if (this._pollId) {
            GLib.Source.remove(this._pollId);
            this._pollId = 0;
        }

        if (this._laterId) {
            global.compositor.get_laters().remove(this._laterId);
            this._laterId = 0;
        }
    }

    _cancelDwell() {
        if (this._dwellId) {
            GLib.Source.remove(this._dwellId);
            this._dwellId = 0;
        }
        this._dwellEdge = null;
    }

    // position-invalidated fires for every motion event (up to 1000 times a
    // second with some mice), so check at most once per frame.
    _queueCheck() {
        if (this._laterId)
            return;

        this._laterId = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._laterId = 0;
                this._checkPointer();
                return GLib.SOURCE_REMOVE;
            });
    }

    _checkPointer(expectedEdge = null) {
        const [coords, mods] = this._cursorTracker.get_pointer();
        const target = this._getWrapTarget(coords.x, coords.y);

        // Wrap only once per visit to an edge. This prevents repeated warps
        // when the warp is blocked (e.g. by a game confining the pointer) or
        // when the pointer is still reported at the old edge after a warp.
        if (!target) {
            this._cancelDwell();
            this._armed = true;
            return;
        }

        // Never wrap while a button is held: dragging a window to an edge to
        // tile it, drag and drop, or selecting text must keep working. The
        // pointer has to leave the edge after the drag before it wraps.
        if (mods & BUTTONS_MASK) {
            this._cancelDwell();
            this._armed = false;
            return;
        }

        if (!this._armed)
            return;

        if (this._modifierMask && !(mods & this._modifierMask)) {
            this._cancelDwell();
            return;
        }

        if (this._dwellEnabled && target.edge !== expectedEdge) {
            if (this._dwellEdge !== target.edge) {
                this._cancelDwell();
                this._dwellEdge = target.edge;
                this._dwellId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    DWELL_DELAY_MS, () => {
                        this._dwellId = 0;
                        this._dwellEdge = null;
                        this._checkPointer(target.edge);
                        return GLib.SOURCE_REMOVE;
                    });
            }
            return;
        }

        this._cancelDwell();
        this._armed = false;
        this._warp(coords.x, coords.y, target);
    }

    _warp(fromX, fromY, target) {
        let last = {x: Math.round(fromX), y: Math.round(fromY)};
        for (const point of this._getWarpPath(fromX, fromY, target)) {
            const x = Math.round(point.x);
            const y = Math.round(point.y);
            if (x !== last.x || y !== last.y)
                this._seat.warp_pointer(x, y);
            last = {x, y};
        }
    }

    // Mutter applies pointer barriers to warps. A one-way barrier stops any
    // motion that crosses it unless every direction component of the motion
    // is allowed, so a diagonal warp stops at GNOME Shell's hot corner and top
    // bar barriers. Those barriers all lie on monitor edges: vertical ones
    // within the top bar's height of a monitor's top edge (hot corners, the
    // end of the top bar), and horizontal ones along a top edge within that
    // distance of a corner (hot corners). Motion inside one monitor never
    // meets them. So walk the shortest chain of adjacent monitors from the
    // source to the destination, cross each seam straight along a row or
    // column clear of those bands, and move freely within each monitor:
    // first along the edge the pointer is on, last within the destination.
    _getWarpPath(fromX, fromY, target) {
        const source = this._monitors.find(m => containsPoint(m, fromX, fromY));
        const crossings = source &&
            this._findCrossings(source, target.monitor, fromX, fromY, target);
        if (!crossings)
            return [target];

        const path = [];
        let x = fromX;
        let y = fromY;
        crossings.forEach(({monitor, row, column}, i) => {
            const next = crossings[i + 1];
            if (row !== undefined) {
                path.push({x, y: row});
                y = row;
                x = next?.column ?? (next ? insetInto(monitor, target.x, y).x : target.x);
            } else {
                path.push({x: column, y});
                x = column;
                y = next?.row ?? (next ? insetInto(monitor, x, target.y).y : target.y);
            }
            path.push({x, y});
        });
        path.push({x, y: target.y}, target);
        return path;
    }

    // Returns where the warp path crosses into each monitor along the
    // shortest chain of adjacent monitors from source to destination, as
    // {monitor, row} or {monitor, column}, or null if there is no such chain.
    // The first crossing stays close to the pointer, later ones to the target.
    _findCrossings(source, destination, fromX, fromY, target) {
        const band = Main.layoutManager.panelBox.height + 1;
        const blockedRows = this._monitors.map(m => [m.y - 1, m.y + band]);
        const blockedColumns = this._monitors.flatMap(m => [
            [m.x - 1, m.x + band],
            [m.x + m.width - 1 - band, m.x + m.width],
        ]);

        const cross = (from, to, preferredX, preferredY) => {
            const seam = getSeam(from, to);
            if (!seam)
                return null;
            const min = seam.start + LANDING_INSET;
            const max = seam.end - 1 - LANDING_INSET;
            if (seam.crossedBy === 'row') {
                const row = findClearValue(preferredY, min, max, blockedRows);
                return row === null ? null : {monitor: to, row};
            }
            const column = findClearValue(preferredX, min, max, blockedColumns);
            return column === null ? null : {monitor: to, column};
        };

        // Breadth-first search over monitors joined by a crossable seam.
        const previous = new Map([[source, null]]);
        const queue = [source];
        while (queue.length > 0 && !previous.has(destination)) {
            const current = queue.shift();
            for (const monitor of this._monitors) {
                if (!previous.has(monitor) && cross(current, monitor, 0, 0)) {
                    previous.set(monitor, current);
                    queue.push(monitor);
                }
            }
        }
        if (!previous.has(destination))
            return null;

        const chain = [];
        for (let m = destination; m; m = previous.get(m))
            chain.unshift(m);

        return chain.slice(1).map((monitor, i) => i === 0
            ? cross(chain[i], monitor, fromX, fromY)
            : cross(chain[i], monitor, target.x, target.y));
    }

    // Returns the point to warp to when (x, y) is on an outer edge of the
    // layout, or null otherwise. Seams between adjacent monitors never wrap.
    _getWrapTarget(x, y) {
        const bounds = this._bounds;
        if (!bounds)
            return null;

        if (this._wrapLeft && x < bounds.left + EDGE_ZONE)
            return this._landInColumn(bounds.right - 1 - LANDING_INSET, y, 'left');
        if (this._wrapRight && x >= bounds.right - EDGE_ZONE)
            return this._landInColumn(bounds.left + LANDING_INSET, y, 'right');

        if (this._wrapTop || this._wrapBottom)
            return this._getVerticalWrapTarget(x, y);

        return null;
    }

    // Vertical wrapping works per column, so it also works on monitors that
    // do not reach the top or bottom of the layout, as in a row of monitors
    // with different heights. A top edge with nothing above it wraps to the
    // bottom of the lowest monitor in that column, often the same monitor,
    // and a bottom edge with nothing below it to the top of the highest one.
    // x never changes.
    _getVerticalWrapTarget(x, y) {
        const column = this._monitors.filter(m => x >= m.x && x < m.x + m.width);
        const monitor = column.find(m => y >= m.y && y < m.y + m.height);
        if (!monitor)
            return null;

        const isOpen = edgeY => !column.some(m => edgeY >= m.y && edgeY < m.y + m.height);
        const bottomOf = m => m.y + m.height;

        if (this._wrapTop && y < monitor.y + EDGE_ZONE && isOpen(monitor.y - 1)) {
            const lowest = column.reduce((a, b) => bottomOf(b) > bottomOf(a) ? b : a);
            return {
                ...insetInto(lowest, x, bottomOf(lowest) - 1 - LANDING_INSET),
                edge: `top:${monitor.x}:${monitor.y}`,
            };
        }
        if (this._wrapBottom && y >= bottomOf(monitor) - EDGE_ZONE && isOpen(bottomOf(monitor))) {
            const highest = column.reduce((a, b) => b.y < a.y ? b : a);
            return {
                ...insetInto(highest, x, highest.y + LANDING_INSET),
                edge: `bottom:${monitor.x}:${monitor.y}`,
            };
        }
        return null;
    }

    // Monitors in the destination column can have different vertical offsets
    // than the one the pointer leaves (e.g. an ultrawide next to a 1080p
    // screen). Keep y if a monitor in that column covers it, otherwise move it
    // onto the closest one.
    _landInColumn(x, y, edge) {
        const monitor = findClosest(
            this._monitors.filter(m => x >= m.x && x < m.x + m.width),
            m => distanceToRange(y, m.y, m.y + m.height - 1));
        return monitor ? {...insetInto(monitor, x, y), edge} : null;
    }
}
