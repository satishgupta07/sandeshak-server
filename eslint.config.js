const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const pluginN = require('eslint-plugin-n')
const prettier = require('eslint-config-prettier')

module.exports = [
  // 1. Global ignores
  { ignores: ['node_modules', 'dist'] },

  // 2. Base Recommended Configs (Spread these into the top level)
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginN.configs['flat/recommended-module'],

  // 3. Project-specific settings and overrides
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // Allow unused vars prefixed with _ (e.g. _req, _next)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Node plugin sometimes flags false positives for local imports
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },

  // 4. Prettier (Must be the very last element in the array to override other rules)
  prettier,
]