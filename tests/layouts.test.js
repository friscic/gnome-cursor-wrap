// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1080x1920 3440x1440 1080x2560 1920x1080 1280x1024

// Mixed-size layouts with hot corners on. The first part checks exact landing
// spots on a portrait | ultrawide | tall portrait row. The sweep then pushes
// into every outer edge at many points and checks that each wrap reaches the
// spot the extension aimed for, i.e. that no barrier stops it halfway.

import {defineTest, sweepOuterEdges} from './lib/harness.js';

const portrait = {width: 1080, height: 1920};
const ultrawide = {width: 3440, height: 1440};
const tallPortrait = {width: 1080, height: 2560};
const A = {width: 1920, height: 1080};
const B = {width: 1280, height: 1024};

const rowLayout = [
    {...portrait, x: 0, y: 322},
    {...ultrawide, x: 1080, y: 802, primary: true},
    {...tallPortrait, x: 4520, y: 0},
];

export const {init, run} = defineTest(async t => {
    await t.setHotCorners(true);
    await t.applyLayout(rowLayout);

    await t.moveTo(100, 1200);
    t.push(-5000, 0);
    await t.expectPointerStays('portrait -> tall portrait keeps the height', 5596, 1200);

    await t.moveTo(5000, 1200);
    t.push(5000, 0);
    await t.expectPointerStays('tall portrait -> portrait keeps the height', 3, 1200);

    await t.moveTo(5000, 100);
    t.push(5000, 0);
    await t.expectPointerStays('above the portrait: clamped onto its top', 3, 325);

    await t.moveTo(5000, 2500);
    t.push(5000, 0);
    await t.expectPointerStays('below the portrait: clamped onto its bottom', 3, 2238);

    // y 810 is within the ultrawide's top bar, where GNOME Shell puts a
    // barrier at x 4520.
    await t.moveTo(100, 810);
    t.push(-5000, 0);
    await t.expectPointerStays('wrap at top bar height passes the top bar barrier', 5596, 810);

    await t.moveTo(5000, 810);
    t.push(5000, 0);
    await t.expectPointerStays('wrap back at top bar height', 3, 810);

    await t.moveTo(1000, 1200);
    t.push(200, 0);
    await t.expectPointerStays('portrait -> ultrawide seam is untouched', 1200, 1200);
    await t.moveTo(4400, 1200);
    t.push(200, 0);
    await t.expectPointerStays('ultrawide -> tall portrait seam is untouched', 4600, 1200);

    // Only the tall portrait reaches the top and bottom of the layout. The
    // other two monitors must still wrap vertically within their column.
    await t.setSetting('wrap-vertical', true);
    await t.moveTo(500, 400);
    t.push(0, -5000);
    await t.expectPointerStays('portrait: top wraps to its bottom', 500, 2238);
    await t.moveTo(500, 2200);
    t.push(0, 5000);
    await t.expectPointerStays('portrait: bottom wraps to its top', 500, 325);
    await t.moveTo(2500, 900);
    t.push(0, -5000);
    await t.expectPointerStays('ultrawide: top, through the top bar, wraps to its bottom', 2500, 2238);
    await t.moveTo(2500, 2200);
    t.push(0, 5000);
    await t.expectPointerStays('ultrawide: bottom wraps to its top', 2500, 805);
    await t.moveTo(5000, 100);
    t.push(0, -5000);
    await t.expectPointerStays('tall portrait: top wraps to its bottom', 5000, 2556);

    await sweepOuterEdges(t, 'row layout', 400, 37);

    await t.applyLayout([{...A, x: 0, y: 500, primary: true}, {...B, x: 1920, y: 0}]);
    await sweepOuterEdges(t, 'B higher', 300, 29);

    await t.applyLayout([{...A, x: 0, y: 0, primary: true}, {...B, x: 1920, y: 200}]);
    await sweepOuterEdges(t, 'B lower', 300, 29);
});
