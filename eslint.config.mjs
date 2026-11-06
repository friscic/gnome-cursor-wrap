// SPDX-License-Identifier: GPL-3.0-or-later

import js from '@eslint/js';

// Globals that GJS and GNOME Shell provide.
const gjsGlobals = {
    global: 'readonly',
    console: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
};

export default [
    {
        ignores: ['node_modules/', 'test-logs/'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'eqeqeq': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
        },
    },
];
