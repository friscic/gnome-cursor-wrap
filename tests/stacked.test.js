// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1920x1080 1920x1080 1280x1024 1280x1024 3440x1440

// Layouts with monitors above each other: a laptop below an external monitor
// (flush and centered), an L shape, and a 2x2 grid. The primary monitor, and
// with it the top bar and its barriers, is a lower one, so the top bar band
// sits in the middle of the layout's left edge. Explicit checks pin landing
// spots and the documented limitation that edges facing empty space inside
// the bounding box do not wrap; the sweeps push into every outer edge.

import {defineTest, sweepOuterEdges} from './lib/harness.js';

const A = {width: 1920, height: 1080};
const B = {width: 1280, height: 1024};
const U = {width: 3440, height: 1440};

export const {init, run} = defineTest(async t => {
    await t.setHotCorners(true);
    await t.setSetting('wrap-vertical', true);

    // External A above laptop B, left edges flush. 1920 x 2104 in total.
    await t.applyLayout([{...A, x: 0, y: 0}, {...B, x: 0, y: 1080, primary: true}]);

    await t.moveTo(1900, 500);
    t.push(5000, 0);
    await t.expectPointerStays('stacked: right edge of A wraps to the left, keeping y', 3, 500);

    await t.moveTo(100, 1600);
    t.push(-5000, 0);
    await t.expectPointerStays('stacked: left edge of B lands on A, the only monitor on the right', 1916, 1076);

    // y 1090 is in B's top bar, next to GNOME Shell's barriers at its top.
    await t.moveTo(100, 1090);
    t.push(-5000, 0);
    await t.expectPointerStays('stacked: left edge of B at top bar height', 1916, 1076);

    await t.moveTo(500, 100);
    t.push(0, -5000);
    await t.expectPointerStays('stacked: top of A wraps to the bottom of B', 500, 2100);

    await t.moveTo(1600, 100);
    t.push(0, -5000);
    await t.expectPointerStays('stacked: top of A beyond B\'s width lands on B\'s corner', 1276, 2100);

    await t.moveTo(500, 2050);
    t.push(0, 5000);
    await t.expectPointerStays('stacked: bottom of B wraps to the top of A', 500, 3);

    await t.moveTo(500, 1060);
    t.push(0, 40);
    await t.expectPointerStays('stacked: the A/B seam does not wrap', 500, 1100);

    await t.moveTo(1600, 1050);
    t.push(0, 5000);
    await t.expectPointerStays('stacked: bottom of A beside B is not an outer edge', 1600, 1079);

    await t.moveTo(1200, 1600);
    t.push(5000, 0);
    await t.expectPointerStays('stacked: right edge of B is not an outer edge', 1279, 1600);

    await sweepOuterEdges(t, 'stacked', 400, 61);

    // Laptop centered below the external monitor.
    await t.applyLayout([{...A, x: 0, y: 0}, {...B, x: 320, y: 1080, primary: true}]);

    await t.moveTo(400, 1600);
    t.push(-5000, 0);
    await t.expectPointerStays('centered: left edge of B is not an outer edge', 320, 1600);

    await t.moveTo(100, 100);
    t.push(0, -5000);
    await t.expectPointerStays('centered: top of A left of B lands on B\'s corner', 323, 2100);

    await sweepOuterEdges(t, 'centered', 400, 61);

    // L shape: A above the left part of ultrawide U.
    await t.applyLayout([{...A, x: 0, y: 0}, {...U, x: 0, y: 1080, primary: true}]);

    await t.moveTo(2500, 1150);
    t.push(0, -5000);
    await t.expectPointerStays('L shape: top of U beside A is not an outer edge', 2500, 1080);

    await t.moveTo(1900, 500);
    t.push(5000, 0);
    await t.expectPointerStays('L shape: right edge of A is not an outer edge', 1919, 500);

    await t.moveTo(2500, 2400);
    t.push(0, 5000);
    await t.expectPointerStays('L shape: bottom of U beyond A\'s width lands on A\'s corner', 1916, 3);

    await t.moveTo(3400, 1500);
    t.push(5000, 0);
    await t.expectPointerStays('L shape: right edge of U wraps to the left, keeping y', 3, 1500);

    await sweepOuterEdges(t, 'L shape', 400, 61);

    // 2x2 grid: two externals on top, two laptops-sized monitors below with a
    // gap between them. The bottom-left one is primary.
    await t.applyLayout([
        {...A, x: 0, y: 0},
        {...A, x: 1920, y: 0},
        {...B, x: 0, y: 1080, primary: true},
        {...B, x: 1920, y: 1080},
    ]);

    await t.moveTo(100, 1090);
    t.push(-5000, 0);
    await t.expectPointerStays('grid: left edge at top bar height lands on the top-right monitor', 3836, 1076);

    await t.moveTo(2500, 2050);
    t.push(0, 5000);
    await t.expectPointerStays('grid: bottom of the bottom-right monitor wraps to the top', 2500, 3);

    await t.moveTo(1200, 1600);
    t.push(200, 0);
    await t.expectPointerStays('grid: the gap between the bottom monitors stops the pointer', 1279, 1600);

    await sweepOuterEdges(t, 'grid', 400, 61);
});
