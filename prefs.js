// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

        const addSwitch = (parent, key, title, subtitle) => {
            const row = new Adw.SwitchRow({title, subtitle});
            parent.add(row);
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.NO_SENSITIVITY);
            return row;
        };

        addSwitch(group, 'wrap-horizontal', 'Wrap horizontally',
            'Enable wrapping from the left and right edges');
        addSwitch(group, 'wrap-vertical', 'Wrap vertically',
            'Enable wrapping from the top and bottom edges');

        const edges = new Adw.PreferencesGroup({title: 'Wrap From'});
        page.add(edges);
        for (const [edge, title, axis, subtitle] of [
            ['left', 'Left edge', 'horizontal', 'Wrap to the right'],
            ['right', 'Right edge', 'horizontal', 'Wrap to the left'],
            ['top', 'Top edge', 'vertical', 'Wrap to the bottom'],
            ['bottom', 'Bottom edge', 'vertical', 'Wrap to the top'],
        ]) {
            const row = addSwitch(edges, `wrap-${edge}`, title, subtitle);
            settings.bind(`wrap-${axis}`, row, 'sensitive', Gio.SettingsBindFlags.GET);
        }

        const activation = new Adw.PreferencesGroup({title: 'Activation'});
        page.add(activation);
        addSwitch(activation, 'require-modifier', 'Require a modifier key',
            'Hold the selected key while moving to an edge');
        const modifier = new Adw.ComboRow({
            title: 'Modifier key',
            model: Gtk.StringList.new(['Shift', 'Alt', 'Super']),
        });
        activation.add(modifier);
        settings.bind('wrap-modifier', modifier, 'selected', Gio.SettingsBindFlags.NO_SENSITIVITY);
        settings.bind('require-modifier', modifier, 'sensitive', Gio.SettingsBindFlags.GET);
        addSwitch(activation, 'enable-dwell', 'Wait at the edge',
            'Wrap after 200 ms at the same edge');

        window.set_default_size(480, 720);
    }
}
