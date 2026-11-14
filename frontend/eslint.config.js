import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // <script lang="ts"> inside .vue files needs the TS parser.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Views are single-word by design (MainPage is fine, but so is e.g. a
      // future Library.vue); the router, not the name, disambiguates them.
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Build/test config files run in Node.
  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
