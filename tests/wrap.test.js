// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1920x1080 1280x1024

// Core wrapping behaviour on two monitors (A 1920x1080, B 1280x1024).
// Landing spots are 3 px inside the destination monitor (LANDING_INSET).

import {defineTest} from './lib/harness.js';

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
    await t.moveTo(2500, 100);
    t.push(0, -5000);
    await t.expectPointerStays('top of B wraps onto A, because B is shorter', 1916, 1076);

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
});
