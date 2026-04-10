import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'build/**',
      'out/**',
      '**/*.min.js',
      '.certs/**',
      'prisma/migrations/**',
      'public/**',
      'docs/assets/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  prettierConfig,
  {
    rules: {
      '@next/next/no-assign-module-variable': 'error',
      '@next/next/no-img-element': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'prisma/seed.js', 'tests/**/*.{js,ts}'],
    rules: {
      'no-console': 'off',
    },
  },
];
