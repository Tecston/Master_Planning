import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Ignorar carpetas de build/node_modules
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // Reglas básicas de JS
  js.configs.recommended,

  // Reglas para TypeScript + React Hooks
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // Desactivar la versión normal de no-unused-vars
      'no-unused-vars': 'off',

      // Usar la de TypeScript y limpiar todo lo que no se usa
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_', // parámetros que empiezan con _ los ignora
          varsIgnorePattern: '^_', // variables que empiezan con _ los ignora
        },
      ],

      // Reglas recomendadas de React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
