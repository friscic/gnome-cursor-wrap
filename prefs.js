// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CursorWrapPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'input-mouse-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Edge Wrapping',
            description:
                'Choose which outer edges of your monitor layout wrap the pointer around.',
        });
        page.add(group);

        const horizontal = new Adw.SwitchRow({
            title: 'Wrap horizontally',
            subtitle: 'Far-left edge wraps to the far-right edge, and back',
        });
        group.add(horizontal);

        const vertical = new Adw.SwitchRow({
            title: 'Wrap vertically',
            subtitle: 'Top edge wraps to the bottom edge, and back',
        });
        group.add(vertical);

        settings.bind('wrap-horizontal', horizontal, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        settings.bind('wrap-vertical', vertical, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        window.set_default_size(480, 300);
    }
}
