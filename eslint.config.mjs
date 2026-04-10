import { defineConfig } from 'eslint/config'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {},
    rules: {
      'no-unused-vars': 'allow',
      'no-unused-labels': 'allow',
      'no-extra-boolean-cast': 'allow',
      'no-control-regex': 'allow',

      'prefer-ts-expect-error': 'error',
      'no-unnecessary-type-assertion': 'error',
      'no-unreachable': 'error', // we use this instead of typescript's "allowUnreachableCode" (see tsconfig)
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // there are too many anys in the codebase; gradually remove the inline suppressions
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignorePrimitives: {
            boolean: true
          }
        }
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowNullableBoolean: true,
          allowString: false // disable `!myString` and `!myNullableString`
        }
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: true,
          requireDefaultForNonUnion: true
        }
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        {
          allowConstantLoopConditions: true
        }
      ],
      'no-unused-expressions': [
        'error',
        {
          allowTernary: true,
          allowShortCircuit: true
        }
      ],
      // "@typescript-eslint/no-base-to-string": "error", // enabled by default already. Prevents showing string [object Object]. This also lets us construct IDs from strings, without letting these IDs be subject to string manipulations

      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'off', // this is annoying and over-encourages immutability

      // gradually remove these rules
      'no-floating-promises': 'off'
    }
  },
  eslintConfigPrettier
)
