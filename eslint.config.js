const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const pluginN = require('eslint-plugin-n')
const prettier = require('eslint-config-prettier')

module.exports = [
  { ignores: ['node_modules', 'dist'] },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      pluginN.configs['flat/recommended-module'],
      prettier, // must be last
    ],
    rules: {
      // Allow unused vars prefixed with _ (e.g. _req, _next)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Node plugin sometimes flags false positives for local imports
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
]
