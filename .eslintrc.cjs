'use strict';
module.exports = {
  root: true,
  rules: {
    'no-console':            ['warn', { allow: ['warn','error','info'] }],
    'no-unused-vars':        ['error', { argsIgnorePattern:'^_', varsIgnorePattern:'^_' }],
    'no-var':                'error',
    'prefer-const':          'error',
    'eqeqeq':               ['error','always'],
    'no-eval':               'error',
    'no-implied-eval':       'error',
    'no-new-func':           'error',
  },
  overrides: [
    {
      files: ['src/**/*.js'],
      env: { browser: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    {
      files: ['functions/src/**/*.js'],
      env: { node: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
      rules: {
        'no-restricted-syntax': ['error', {
          selector: 'Literal[value=/sk_live_|sk_test_|FLWSECK_|sk-ant-/]',
          message:  'Hardcoded secret. Use process.env + Secret Manager.',
        }],
      },
    },
    {
      files: ['**/*.test.js'],
      env: { jest: true, node: true },
      rules: { 'no-console': 'off' },
    },
  ],
  ignorePatterns: ['dist/','functions/lib/','node_modules/','coverage/'],
};
