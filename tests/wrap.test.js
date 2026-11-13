// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1920x1080 1280x1024

// Core wrapping behaviour on two monitors (A 1920x1080, B 1280x1024).
// Landing spots are 3 px inside the destination monitor (LANDING_INSET).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {defineTest, waitFor} from './lib/harness.js';

const A = {width: 1920, height: 1080};
const B = {width: 1280, height: 1024};

export const {init, run} = defineTest(async t => {
    // A at (0, 0), B to its right at (1920, 0): the layout is 3200 px wide.
    await t.applyLayout([{...A, x: 0, y: 0}, {...B, x: 1920, y: 0}]);

    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('left edge wraps to the far right', 3196, 500);

    t.push(0, 5);
    await t.expectPointerStays('no bounce back after vertical motion at the landing spot', 3196, 505);
    t.push(2, 0);
    await t.expectPointerStays('no bounce back when moving toward the edge', 3198, 505);

    await t.moveTo(3100, 500);
    t.push(5000, 0);
    await t.expectPointerStays('right edge wraps to the far left', 3, 500);

    // GNOME Shell's top bar barrier sits at the A/B seam within the top bar's
    // height; a straight warp through it would stop at x = 1920.
    await t.moveTo(100, 5);
    t.push(-5000, 0);
    await t.expectPointerStays('left edge wraps within the top bar band', 3196, 5);
    await t.moveTo(3100, 5);
    t.push(5000, 0);
    await t.expectPointerStays('right edge wraps within the top bar band', 3, 5);

    await t.moveTo(100, 500);
    await t.sweep(-20, 0, 15);
    await t.expectPointerWhere('continuous motion through the edge wraps once and keeps moving',
        p => p.x > 2900 && p.x < 3196 && p.y === 500, 'x between 2900 and 3196 at y 500');

    await t.moveTo(1900, 500);
    t.push(40, 0);
    await t.expectPointerStays('the seam between monitors does not wrap', 1940, 500);

    await t.moveTo(100, 1050);
    t.push(-5000, 0);
    await t.expectPointerStays('y is clamped onto the shorter destination monitor', 3196, 1020);

    // Mouse button held: no wrap, and no wrap after release until the
    // pointer has left the edge.
    await t.moveTo(100, 500);
    await t.setButton(true);
    t.push(-5000, 0);
    await t.expectPointerStays('no wrap while a button is held', 0, 500);
    await t.setButton(false);
    t.push(0, 3);
    await t.expectPointerStays('no wrap right after releasing the button at the edge', 0, 503);
    t.push(30, 0);
    await t.expectPointerStays('pointer leaves the edge', 30, 503);
    t.push(-5000, 0);
    await t.expectPointerStays('wraps again after leaving the edge', 3196, 503);

    // Vertical wrapping is off by default.
    await t.moveTo(500, 100);
    t.push(0, -5000);
    await t.expectPointerStays('top edge does not wrap while vertical wrapping is off', 500, 0);

    await t.setSetting('wrap-vertical', true);
    await t.moveTo(500, 100);
    t.push(0, -5000);
    await t.expectPointerStays('top edge wraps to the bottom', 500, 1076);
    await t.moveTo(500, 1000);
    t.push(0, 5000);
    await t.expectPointerStays('bottom edge wraps to the top', 500, 3);
    // B is shorter than A, so its bottom edge is not on the layout's bounding
    // box. Vertical wrapping works per column, so B still wraps within itself.
    await t.moveTo(2500, 100);
    t.push(0, -5000);
    await t.expectPointerStays('top of the shorter B wraps to its own bottom', 2500, 1020);
    await t.moveTo(2500, 1000);
    t.push(0, 5000);
    await t.expectPointerStays('bottom of the shorter B wraps to its top', 2500, 3);

    // Both directions on: a corner wraps horizontally once, and the landing
    // spot is inset from the top so it cannot chain into a vertical wrap.
    await t.moveTo(60, 60);
    t.push(-100, -100);
    await t.expectPointerStays('corner wraps horizontally, inset from the top', 3196, 3);
    t.push(-1, 0);
    await t.expectPointerStays('no second wrap from the corner landing spot', 3195, 3);

    await t.setSetting('wrap-vertical', false);
    await t.setSetting('wrap-horizontal', false);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('nothing wraps when both settings are off', 0, 500);
    await t.setSetting('wrap-horizontal', true);
    t.push(10, 0);
    await t.expectPointerStays('pointer leaves the edge', 10, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('wrapping resumes when re-enabled', 3196, 500);

    // B 200 px lower than A.
    await t.applyLayout([{...A, x: 0, y: 0}, {...B, x: 1920, y: 200}]);
    await t.moveTo(100, 100);
    t.push(-5000, 0);
    await t.expectPointerStays('offset layout: lands on B within its height', 3196, 203);
    await t.moveTo(3100, 1200);
    t.push(5000, 0);
    await t.expectPointerStays('offset layout: lands on A within its height', 3, 1076);

    // B to the left of A.
    await t.applyLayout([{...A, x: 1280, y: 0, primary: true}, {...B, x: 0, y: 0}]);
    await t.moveTo(1500, 500);
    t.push(5000, 0);
    await t.expectPointerStays('swapped layout: right edge wraps to the far left', 3, 500);

    // One monitor.
    await t.applyLayout([{...A, x: 0, y: 0}]);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('single monitor wraps within itself', 1916, 500);
    await t.moveTo(100, 5);
    t.push(-5000, 0);
    await t.expectPointerStays('single monitor wraps within the top bar band', 1916, 5);
    await t.moveTo(1800, 5);
    t.push(5000, 0);
    await t.expectPointerStays('single monitor wraps back within the top bar band', 3, 5);

    await t.setSetting('wrap-vertical', true);
    for (const [edge, dx, dy, x, y, wrapX, wrapY] of [
        ['left', -5000, 0, 0, 500, 3, 500],
        ['right', 5000, 0, 1919, 500, 1916, 500],
        ['top', 0, -5000, 500, 0, 500, 3],
        ['bottom', 0, 5000, 500, 1079, 500, 1076],
    ]) {
        await t.setSetting(`wrap-${edge}`, false);
        await t.moveTo(500, 500);
        t.push(dx, dy);
        await t.expectPointerStays(`disabled ${edge} edge does not wrap`, x, y);
        await t.moveTo(500, 500);
        t.push(-dx, -dy);
        await t.expectPointerStays(`opposite edge of ${edge} still wraps`, wrapX, wrapY);
        await t.setSetting(`wrap-${edge}`, true);
    }
    await t.setSetting('wrap-vertical', false);

    const keyboard = global.stage.get_context().get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const modifiers = [
        ['Shift', Clutter.KEY_Shift_L, Clutter.ModifierType.SHIFT_MASK],
        ['Alt', Clutter.KEY_Alt_L, Clutter.ModifierType.MOD1_MASK],
        ['Super', Clutter.KEY_Super_L,
            Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK],
    ];
    const setModifier = async ([name, key, mask], pressed) => {
        keyboard.notify_keyval(GLib.get_monotonic_time(), key,
            pressed ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
        if (!await waitFor(() => Boolean(t.pointer().mods & mask) === pressed))
            throw new Error(`virtual ${name} key did not ${pressed ? 'press' : 'release'}`);
    };
    const withModifier = async (modifier, body) => {
        try {
            await setModifier(modifier, true);
            await body();
        } finally {
            await setModifier(modifier, false);
        }
    };

    await t.setSetting('require-modifier', true);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('hold-to-wrap blocks wrapping without Shift', 0, 500);

    for (const [index, modifier] of modifiers.entries()) {
        const [name] = modifier;
        if (index > 0) {
            const previous = modifiers[index - 1];
            const [previousName] = previous;
            await withModifier(previous, async () => {
                t.settings.set_uint('wrap-modifier', index);
                await t.moveTo(100, 500);
                t.push(-5000, 0);
                await t.expectPointerStays(`changing to ${name} stops accepting ${previousName}`, 0, 500);
            });
        }
        await t.moveTo(100, 500);
        await withModifier(modifier, async () => {
            t.push(-5000, 0);
            await t.expectPointerStays(`hold-to-wrap allows wrapping with ${name}`, 1916, 500);
        });
    }
    await t.setSetting('require-modifier', false);

    await t.setSetting('enable-dwell', true);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointer('dwell allows the pointer to reach the edge', 0, 500);
    await t.expectPointerStays('dwell wraps a stationary pointer', 1916, 500);

    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointer('pointer reaches the edge again', 0, 500);
    t.push(20, 0);
    await t.expectPointerStays('leaving the edge cancels dwell', 20, 500);

    t.settings.set_uint('wrap-modifier', 0);
    await t.setSetting('require-modifier', true);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('dwell does not wrap without the required key', 0, 500);

    await t.moveTo(100, 500);
    await withModifier(modifiers[0], async () => {
        t.push(-5000, 0);
        await t.expectPointer('holding Shift still requires waiting at the edge', 0, 500);
        await t.expectPointerStays('holding Shift through dwell wraps the pointer', 1916, 500);
    });

    await t.moveTo(100, 500);
    await withModifier(modifiers[0], async () => {
        t.push(-5000, 0);
        t.check('dwell starts while Shift is held', await waitFor(() => t.instance._dwellId));
    });
    await t.expectPointerStays('releasing Shift during dwell prevents the wrap', 0, 500);
    await t.setSetting('require-modifier', false);

    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointer('pointer reaches the edge before disable', 0, 500);
    await t.setExtensionEnabled(false);
    await t.expectPointerStays('disabling cancels a pending dwell', 0, 500);
    await t.setExtensionEnabled(true);
    await t.setSetting('enable-dwell', false);

    // Disable and enable cleanly, as on screen lock and unlock.
    await t.setExtensionEnabled(false);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('no wrap while disabled', 0, 500);
    await t.setExtensionEnabled(true);
    t.push(10, 0);
    await t.expectPointerStays('pointer leaves the edge', 10, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('wraps after re-enabling', 1916, 500);

    // Many lock/unlock cycles, as over a working day. After each disable the
    // extension must hold no GLib sources or references to Shell objects, and
    // after the last enable it must still wrap and stay put.
    const leftovers = () => {
        const i = t.instance;
        return ['_cursorTracker', '_seat', '_settings', '_monitors', '_laterId', '_pollId']
            .filter(name => i[name]);
    };
    let clean = true;
    for (let cycle = 1; cycle <= 20 && clean; cycle++) {
        clean = await t.setExtensionEnabled(false) &&
            t.check(`cycle ${cycle}: nothing left after disable`, leftovers().length === 0,
                `still set: ${leftovers().join(', ')}`) &&
            await t.setExtensionEnabled(true);
    }
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('wraps after 20 disable/enable cycles', 1916, 500);
});
