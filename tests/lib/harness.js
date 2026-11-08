// SPDX-License-Identifier: GPL-3.0-or-later

// Test harness for Cursor Wrap. tests/run.sh starts an isolated, headless
// GNOME Shell with --automation-script pointing at a test file; the test then
// runs inside the Shell process and drives a virtual mouse through Mutter's
// real input handling (edge clamping, pointer barriers, button state).
//
// A test file looks like this:
//
//     // @monitors 1920x1080 1280x1024
//     import {defineTest} from './lib/harness.js';
//
//     export const {init, run} = defineTest(async t => {
//         await t.moveTo(100, 500);
//         t.push(-5000, 0);
//         await t.expectPointer('left edge wraps', 3196, 500);
//     });
//
// Some helpers use GNOME Shell internals (marked below). If a new GNOME
// version renames them, the harness fails with a message naming them.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const UUID = 'cursor-wrap@friscic.github.io';

const LOG_PREFIX = '[cursor-wrap-test]';
const POLL_MS = 10;
const TIMEOUT_MS = 3000;
// How long the pointer must stay put for "nothing happens" checks.
const SETTLE_MS = 250;
const BUTTON_PRIMARY = 1;

export function log(message) {
    printerr(`${LOG_PREFIX} ${message}`);
}

export function sleep(ms) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

export async function waitFor(condition, timeoutMs = TIMEOUT_MS) {
    const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
    while (!condition()) {
        if (GLib.get_monotonic_time() > deadline)
            return false;
        await sleep(POLL_MS);
    }
    return true;
}

function getPointer() {
    const [x, y, mods] = global.get_pointer();
    return {x, y, mods};
}

function nextFrame() {
    return new Promise(resolve => {
        global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

// global.get_pointer() reports the input thread's position, which can be
// ahead of the events GNOME Shell has handled. The extension samples the
// pointer once per frame, so wait until a few frames have passed.
async function waitForShellToCatchUp() {
    await sleep(30);
    await nextFrame();
    await nextFrame();
}

// GNOME Shell internal: LayoutManager has no public API to remove its hot
// corner and top bar barriers.
function getBarrierInternals() {
    const lm = Main.layoutManager;
    const names = ['_destroyHotCorners', '_updateHotCorners', '_destroyPanelBarrier', '_updatePanelBarrier'];
    const missing = names.filter(name => typeof lm[name] !== 'function');
    if (missing.length > 0)
        throw new Error(`harness: LayoutManager no longer has ${missing.join(', ')}; update tests/lib/harness.js`);
    return lm;
}

function callDisplayConfig(method, params) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig',
            method, params, null, Gio.DBusCallFlags.NONE, -1, null,
            (connection, res) => {
                try {
                    resolve(connection.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

const sameRect = (a, b) =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

class TestContext {
    constructor(extension, device, result) {
        this.extension = extension;
        this._device = device;
        this._result = result;
    }

    // The extension's GSettings.
    get settings() {
        return this.extension.stateObj.getSettings();
    }

    // The running CursorWrapExtension instance.
    get instance() {
        return this.extension.stateObj;
    }

    log(message) {
        log(`INFO ${message}`);
    }

    pointer() {
        return getPointer();
    }

    check(name, ok, detail = '') {
        if (ok) {
            this._result.passed++;
            log(`PASS ${name}`);
        } else {
            this._result.failed.push(`${name}: ${detail}`);
            log(`FAIL ${name}: ${detail}`);
        }
        return ok;
    }

    // Waits until the pointer is at (x, y). With stays, it must then remain
    // there for that many milliseconds (catches unwanted wraps and bounces).
    async expectPointer(name, x, y, {stays = 0} = {}) {
        const isThere = () => {
            const p = getPointer();
            return p.x === x && p.y === y;
        };
        if (await waitFor(isThere) && stays > 0)
            await sleep(stays);
        const p = getPointer();
        return this.check(name, isThere(), `expected (${x}, ${y}), got (${p.x}, ${p.y})`);
    }

    // The pointer reaches (x, y) and nothing moves it afterwards.
    expectPointerStays(name, x, y) {
        return this.expectPointer(name, x, y, {stays: SETTLE_MS});
    }

    // Waits until predicate(pointer) is true.
    async expectPointerWhere(name, predicate, description) {
        await waitFor(() => predicate(getPointer()));
        const p = getPointer();
        return this.check(name, predicate(p), `expected ${description}, got (${p.x}, ${p.y})`);
    }

    // Puts the pointer at (x, y). GNOME Shell's barriers are removed during
    // the move so that test setup is never bent by them; the wraps under test
    // still run with all barriers in place.
    async moveTo(x, y) {
        const lm = getBarrierInternals();
        lm._destroyHotCorners();
        lm._destroyPanelBarrier();
        try {
            this._device.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
            const placed = await waitFor(() => {
                const p = getPointer();
                return p.x === x && p.y === y;
            });
            if (!placed) {
                const p = getPointer();
                throw new Error(`harness: could not place the pointer at (${x}, ${y}), it is at (${p.x}, ${p.y})`);
            }
            await waitForShellToCatchUp();
        } finally {
            lm._updateHotCorners();
            lm._updatePanelBarrier();
        }
    }

    // One relative motion event, like a quick flick of the mouse. A large
    // delta runs into the edge, where the compositor clamps the pointer.
    push(dx, dy) {
        this._device.notify_relative_motion(GLib.get_monotonic_time(), dx, dy);
    }

    // Many small motion events, like a hand moving the mouse.
    async sweep(dx, dy, steps) {
        for (let i = 0; i < steps; i++) {
            this.push(dx, dy);
            await sleep(8);
        }
    }

    async setButton(pressed) {
        this._device.notify_button(GLib.get_monotonic_time(), BUTTON_PRIMARY,
            pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
        const isPressed = () => (getPointer().mods & Clutter.ModifierType.BUTTON1_MASK) !== 0;
        if (!await waitFor(() => isPressed() === pressed))
            throw new Error(`harness: button state did not change to ${pressed ? 'pressed' : 'released'}`);
    }

    // Disables or enables the extension, as on screen lock and unlock, and
    // waits for the new state (GNOME 51 finishes this asynchronously).
    async setExtensionEnabled(enabled) {
        if (enabled)
            await Main.extensionManager.enableExtension(UUID);
        else
            await Main.extensionManager.disableExtension(UUID);
        const wanted = enabled ? ExtensionState.ACTIVE : ExtensionState.INACTIVE;
        await waitFor(() => this.extension.state === wanted || !!this.extension.error);
        return this.check(`${enabled ? 'enables' : 'disables'} without errors`,
            this.extension.state === wanted && !this.extension.error,
            `state ${this.extension.state}, error ${this.extension.error ?? 'none'}`);
    }

    async setSetting(key, value) {
        this.settings.set_boolean(key, value);
        await sleep(100);
    }

    async setHotCorners(enabled) {
        new Gio.Settings({schema_id: 'org.gnome.desktop.interface'})
            .set_boolean('enable-hot-corners', enabled);
        await sleep(200);
    }

    // Arranges the virtual monitors. Each entry picks an unused monitor of
    // that size (its mode, in physical pixels); monitors not listed are
    // turned off. The first entry, or the one with primary: true, becomes the
    // primary monitor. An entry's scale defaults to 1.
    //
    // layoutMode 'logical' or 'physical' switches Mutter's layout mode, which
    // needs `// @mutter-features scale-monitor-framebuffer` in the test file.
    // In logical mode x and y are logical coordinates and a scaled monitor
    // takes up width / scale by height / scale; in physical mode everything is
    // in physical pixels.
    async applyLayout(layout, {layoutMode} = {}) {
        const [serial, monitors, , properties] =
            (await callDisplayConfig('GetCurrentState', null)).recursiveUnpack();
        const modeIds = {logical: 1, physical: 2};
        if (layoutMode && !(layoutMode in modeIds))
            throw new Error(`harness: unknown layout mode ${layoutMode}`);
        if (layoutMode && !properties['supports-changing-layout-mode'])
            throw new Error('harness: this shell cannot change the layout mode; add // @mutter-features scale-monitor-framebuffer');
        const logical = layoutMode
            ? layoutMode === 'logical'
            : properties['layout-mode'] === modeIds.logical;

        const used = new Set();
        const hasPrimary = layout.some(m => m.primary);
        const logicalMonitors = layout.map(({width, height, x, y, scale = 1, primary}, i) => {
            const index = monitors.findIndex(([, modes], j) =>
                !used.has(j) && modes.some(mode => mode[1] === width && mode[2] === height));
            if (index < 0)
                throw new Error(`harness: no unused ${width}x${height} virtual monitor; check the @monitors header`);
            used.add(index);
            const [[connector], modes] = monitors[index];
            const mode = modes.find(m => m[1] === width && m[2] === height);
            const isPrimary = hasPrimary ? !!primary : i === 0;
            return [x, y, scale, 0, isPrimary, [[connector, mode[0], {}]]];
        });

        const configProperties = layoutMode
            ? {'layout-mode': new GLib.Variant('u', modeIds[layoutMode])}
            : {};
        await callDisplayConfig('ApplyMonitorsConfig',
            new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, 1, logicalMonitors, configProperties]));

        const wanted = layout.map(({width, height, x, y, scale = 1}) => logical
            ? {x, y, width: Math.round(width / scale), height: Math.round(height / scale)}
            : {x, y, width, height});
        const applied = await waitFor(() => {
            const current = Main.layoutManager.monitors;
            return current.length === wanted.length &&
                wanted.every(w => current.some(c => sameRect(c, w)));
        }, 10000);
        if (!applied)
            throw new Error(`harness: monitor layout ${JSON.stringify(wanted)} was not applied`);
        // Let hot corners, the top bar barrier, and the extension catch up.
        await sleep(300);
        this.log(`layout ${JSON.stringify(wanted)}${layoutMode ? ` (${layoutMode})` : ''}, top bar ${Main.layoutManager.panelBox.height} px`);
    }
}

// Where a push with this delta ends up along one axis: the first or last
// pixel of the layout, or unchanged if the push does not move along it.
function edgeCoordinate(position, delta, start, end) {
    if (delta < 0)
        return start;
    if (delta > 0)
        return end - 1;
    return position;
}

// Pushes into the edge in direction (dx, dy) from (x, y) and checks that the
// pointer lands where the extension computes it should, i.e. that no barrier
// stops the wrap halfway. Exact landing spots are checked by the tests.
async function checkWrap(t, name, x, y, dx, dy) {
    await t.moveTo(x, y);
    const {left, top, right, bottom} = t.instance._bounds;
    const edgeX = edgeCoordinate(x, dx, left, right);
    const edgeY = edgeCoordinate(y, dy, top, bottom);
    const target = t.instance._getWrapTarget(edgeX, edgeY);
    if (!target) {
        t.check(`${name} from (${x}, ${y})`, false, `no wrap target for edge point (${edgeX}, ${edgeY})`);
        return;
    }
    t.push(dx, dy);
    await t.expectPointer(`${name} from (${x}, ${y})`, Math.round(target.x), Math.round(target.y));
}

// Pushes into every outer edge of the current layout, every stepX / stepY
// pixels, and checks each wrap with checkWrap(). Turn on vertical wrapping
// first to cover the top and bottom edges.
export async function sweepOuterEdges(t, name, stepX, stepY) {
    const {left, top, right, bottom} = t.instance._bounds;
    for (const m of t.instance._monitors) {
        for (let y = m.y + 1; y < m.y + m.height; y += stepY) {
            if (m.x === left)
                await checkWrap(t, `${name}: left edge`, m.x + 50, y, -5000, 0);
            if (m.x + m.width === right)
                await checkWrap(t, `${name}: right edge`, m.x + m.width - 50, y, 5000, 0);
        }
        for (let x = m.x + 1; x < m.x + m.width; x += stepX) {
            if (m.y === top)
                await checkWrap(t, `${name}: top edge`, x, m.y + 50, 0, -5000);
            if (m.y + m.height === bottom)
                await checkWrap(t, `${name}: bottom edge`, x, m.y + m.height - 50, 0, 5000);
        }
    }
}

async function waitForExtension() {
    const active = await waitFor(() => {
        const extension = Main.extensionManager.lookup(UUID);
        return extension?.state === ExtensionState.ACTIVE || !!extension?.error;
    }, 15000);
    const extension = Main.extensionManager.lookup(UUID);
    if (!active || extension.state !== ExtensionState.ACTIVE)
        throw new Error(`extension did not become active (state ${extension?.state}, error: ${extension?.error ?? 'none'})`);

    return extension;
}

// A freshly created virtual pointer can drop or misplace its first events,
// so move it until it reports a position.
async function createPointer() {
    const seat = global.stage.get_context().get_backend().get_default_seat();
    const device = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const {x, y, width, height} = Main.layoutManager.primaryMonitor;
    for (let i = 0; i < 20; i++) {
        const tx = x + Math.floor(width / 2) + i;
        const ty = y + Math.floor(height / 2);
        device.notify_absolute_motion(GLib.get_monotonic_time(), tx, ty);
        if (await waitFor(() => getPointer().x === tx && getPointer().y === ty, 300))
            return device;
    }
    throw new Error('harness: the virtual pointer does not move');
}

function writeResult(result) {
    const path = GLib.getenv('CW_RESULT');
    if (path)
        GLib.file_set_contents(path, JSON.stringify(result, null, 2));
    log(`RESULT passed=${result.passed} failed=${result.failed.length}${result.error ? ' error' : ''}`);
}

async function runTest(body) {
    const result = {gnome: Config.PACKAGE_VERSION, passed: 0, failed: [], error: null};
    try {
        const extension = await waitForExtension();
        Main.overview.hide();
        await waitFor(() => !Main.overview.visible && !Main.overview.animationInProgress, 5000);
        const device = await createPointer();
        await body(new TestContext(extension, device, result));
    } catch (e) {
        result.error = `${e}\n${e.stack ?? ''}`;
        log(`ERROR ${result.error}`);
    }
    writeResult(result);
}

// Returns the {init, run} exports GNOME Shell's automation-script loader
// expects. init() is always called; run() is only called once the perf helper
// process appears on the bus, so the test starts from init() and run() just
// waits for it to finish.
export function defineTest(body) {
    let resolveFinished;
    const finished = new Promise(resolve => (resolveFinished = resolve));

    return {
        init() {
            // GNOME Shell internal: startup-complete may already have been
            // emitted while this module was being imported.
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (Main.layoutManager._startingUp)
                    return GLib.SOURCE_CONTINUE;
                runTest(body).finally(() => {
                    resolveFinished();
                    global.context.terminate();
                });
                return GLib.SOURCE_REMOVE;
            });
        },
        run() {
            return finished;
        },
    };
}
