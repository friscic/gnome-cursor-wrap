// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1920x1080
// @session x11

// X11 session (GNOME 48 and 49 only): the extension polls the pointer
// instead of using the cursor tracker. tests/run.sh skips this file when the
// installed GNOME Shell has no X11 session.

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {defineTest} from './lib/harness.js';

export const {init, run} = defineTest(async t => {
    t.check('runs as an X11 session', Meta.is_wayland_compositor?.() === false,
        'GNOME Shell is running as a Wayland compositor');
    t.check('uses the polling fallback', !!t.instance._pollId, 'no poll source');

    const {width} = Main.layoutManager.primaryMonitor;

    await t.moveTo(100, 500);
    t.push(-5000, 0);
    await t.expectPointerStays('left edge wraps to the right', width - 4, 500);

    await t.moveTo(width - 100, 600);
    t.push(5000, 0);
    await t.expectPointerStays('right edge wraps to the left', 3, 600);

    await t.setSetting('wrap-horizontal', false);
    t.check('polling stops when both directions are off', !t.instance._pollId, 'poll source still active');
});
