// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1920x1080 2560x1600
// @mutter-features scale-monitor-framebuffer

// Scaled monitors: a 1x external A next to a HiDPI laptop H (2560x1600).
// In logical layout mode (GNOME's default when fractional scaling is on) H
// takes up 2560 / scale by 1600 / scale; in physical mode it keeps its pixel
// size and the top bar on it is scale times taller in stage pixels, which
// widens the band the warp path has to route around.

import {defineTest, sweepOuterEdges} from './lib/harness.js';

const A = {width: 1920, height: 1080};
const H = {width: 2560, height: 1600};

export const {init, run} = defineTest(async t => {
    await t.setHotCorners(true);

    // Logical, H at 2x: 1280x800 next to A.
    await t.applyLayout([{...A, x: 0, y: 0}, {...H, x: 1920, y: 0, scale: 2}],
        {layoutMode: 'logical'});

    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('logical 2x: left edge wraps onto H', 3196, 500);
    await t.moveTo(100, 1000);
    t.push(-5000, 0);
    await t.expectPointerStays('logical 2x: y clamped onto the shorter H', 3196, 796);
    await t.moveTo(3100, 500);
    t.push(5000, 0);
    await t.expectPointerStays('logical 2x: right edge of H wraps onto A', 3, 500);

    await t.setSetting('wrap-vertical', true);
    await sweepOuterEdges(t, 'logical 2x', 300, 41);

    // Logical, H at 2x and primary, so the top bar is on the scaled monitor.
    await t.applyLayout([{...A, x: 0, y: 0}, {...H, x: 1920, y: 0, scale: 2, primary: true}],
        {layoutMode: 'logical'});
    await sweepOuterEdges(t, 'logical 2x primary', 300, 41);

    // Logical, H at 1.25: 2048x1280, the common fractional laptop setting.
    await t.applyLayout([{...A, x: 0, y: 0}, {...H, x: 1920, y: 0, scale: 1.25}],
        {layoutMode: 'logical'});

    await t.setSetting('wrap-vertical', false);
    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('logical 1.25x: left edge wraps onto H', 3964, 500);
    await t.moveTo(3900, 1200);
    t.push(5000, 0);
    await t.expectPointerStays('logical 1.25x: y clamped onto the shorter A', 3, 1076);
    // Many small motions on the scaled monitor, which can leave the pointer
    // at fractional logical coordinates before it reaches the edge.
    await t.moveTo(3800, 600);
    await t.sweep(15, 0, 20);
    await t.expectPointerWhere('logical 1.25x: continuous motion wraps once',
        p => p.x > 3 && p.x < 400 && p.y === 600, 'x between 3 and 400 at y 600');

    await t.setSetting('wrap-vertical', true);
    await sweepOuterEdges(t, 'logical 1.25x', 300, 41);

    // Physical, H at 2x and primary: 2560x1600 in stage pixels, with a top bar
    // twice as tall as on a 1x monitor.
    await t.applyLayout([{...A, x: 0, y: 0}, {...H, x: 1920, y: 0, scale: 2, primary: true}],
        {layoutMode: 'physical'});

    await t.setSetting('wrap-vertical', false);
    await t.moveTo(100, 10);
    t.push(-5000, 0);
    await t.expectPointerStays('physical 2x: left edge in the tall top bar band', 4476, 10);
    await t.moveTo(4400, 10);
    t.push(5000, 0);
    await t.expectPointerStays('physical 2x: right edge in the tall top bar band', 3, 10);

    await t.setSetting('wrap-vertical', true);
    await sweepOuterEdges(t, 'physical 2x primary', 400, 53);
});
