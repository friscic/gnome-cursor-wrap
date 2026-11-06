// SPDX-License-Identifier: GPL-3.0-or-later

// GNOME's shared ESLint config plus the extra rules GNOME Shell enables for
// its own code (tools/eslint.config.js in gnome-shell), without its JSDoc
// requirements.

import gnome from 'eslint-config-gnome';

export default [
    {
        ignores: ['node_modules/', 'test-logs/'],
    },
    ...gnome.configs.recommended,
    {
        languageOptions: {
            sourceType: 'module',
            globals: {
                global: 'readonly',
            },
        },
        rules: {
            'camelcase': ['error', {properties: 'never'}],
            'consistent-return': 'error',
            'eqeqeq': ['error', 'smart'],
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {destructuring: 'all'}],
        },
    },
    {
        // Test steps run one after another on purpose.
        files: ['tests/**/*.js'],
        rules: {
            'no-await-in-loop': 'off',
        },
    },
];
