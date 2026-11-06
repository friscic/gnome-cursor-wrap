// SPDX-License-Identifier: GPL-3.0-or-later
// @monitors 1280x800

// Opens the preferences window. If prefs.js throws, the Extensions app logs
// the error with a stack trace into the extension's directory, which
// tests/run.sh treats as a failure. A screenshot is saved for inspection.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {defineTest, sleep, UUID, waitFor} from './lib/harness.js';

const TITLE = 'Cursor Wrap';

function findPrefsWindow() {
    return global.get_window_actors()
        .map(actor => actor.meta_window)
        .find(window => window.get_title() === TITLE);
}

async function saveScreenshot(t) {
    const dir = GLib.getenv('CW_ARTIFACT_DIR');
    if (!dir)
        return;
    const path = GLib.build_filenamev([dir, 'prefs.png']);
    try {
        const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
        await new Shell.Screenshot().screenshot(false, stream);
        stream.close(null);
        t.log(`screenshot saved to ${path}`);
    } catch (e) {
        t.log(`could not save a screenshot: ${e}`);
    }
}

export const {init, run} = defineTest(async t => {
    await t.setSetting('wrap-vertical', true);
    Main.extensionManager.openExtensionPrefs(UUID, '', {});

    const opened = await waitFor(() => !!findPrefsWindow(), 30000);
    t.check('preferences window opens', opened, `no window titled "${TITLE}" within 30 s`);
    if (!opened)
        return;

    // Give the window time to render, and prefs.js time to fail if it does.
    await sleep(2000);
    await saveScreenshot(t);
    findPrefsWindow()?.delete(global.get_current_time());
});
