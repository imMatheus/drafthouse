import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/build'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      // TypeScript already enforces unused locals/params via tsconfig.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // The codebase consistently relies on inferred return types for React components
      // and local helpers. Requiring explicit annotations would be noise.
      '@typescript-eslint/explicit-function-return-type': 'off',

      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],

      'react-hooks/rules-of-hooks': 'error'
    }
  },
  eslintConfigPrettier
)
