// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1080x1920 3440x1440 1080x2560 1920x1080 1280x1024

// Mixed-size layouts with hot corners on. The first part checks exact landing
// spots on a portrait | ultrawide | tall portrait row. The sweep then pushes
// into every outer edge at many points and checks that each wrap reaches the
// spot the extension aimed for, i.e. that no barrier stops it halfway.

import { defineTest } from './lib/harness.js';

const portrait = { width: 1080, height: 1920 };
const ultrawide = { width: 3440, height: 1440 };
const tallPortrait = { width: 1080, height: 2560 };
const A = { width: 1920, height: 1080 };
const B = { width: 1280, height: 1024 };

const rowLayout = [
    { ...portrait, x: 0, y: 322 },
    { ...ultrawide, x: 1080, y: 802, primary: true },
    { ...tallPortrait, x: 4520, y: 0 },
];

// Pushes into the edge in direction (dx, dy) from (x, y) and checks that the
// pointer lands where the extension computes it should.
async function checkWrap(t, name, x, y, dx, dy) {
    await t.moveTo(x, y);
    const { left, top, right, bottom } = t.instance._bounds;
    const edgeX = dx < 0 ? left : dx > 0 ? right - 1 : x;
    const edgeY = dy < 0 ? top : dy > 0 ? bottom - 1 : y;
    const target = t.instance._getWrapTarget(edgeX, edgeY);
    if (!target) {
        t.check(`${name} from (${x}, ${y})`, false, `no wrap target for edge point (${edgeX}, ${edgeY})`);
        return;
    }
    t.push(dx, dy);
    await t.expectPointer(`${name} from (${x}, ${y})`, Math.round(target.x), Math.round(target.y));
}

async function sweepOuterEdges(t, name, stepX, stepY) {
    const { left, top, right, bottom } = t.instance._bounds;
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

export const { init, run } = defineTest(async t => {
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

    await t.setSetting('wrap-vertical', true);
    await sweepOuterEdges(t, 'row layout', 400, 37);

    await t.applyLayout([{ ...A, x: 0, y: 500, primary: true }, { ...B, x: 1920, y: 0 }]);
    await sweepOuterEdges(t, 'B higher', 300, 29);

    await t.applyLayout([{ ...A, x: 0, y: 0, primary: true }, { ...B, x: 1920, y: 200 }]);
    await sweepOuterEdges(t, 'B lower', 300, 29);
});
