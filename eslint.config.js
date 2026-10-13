import tseslint from 'typescript-eslint';

const PURE = ['src/sim/**', 'src/meta/**', 'src/data/**', 'src/contracts/**'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'screens-out/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Deterministic core: no presentation imports, no wall clock, no ambient randomness.
    files: PURE,
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/render/**', '**/ui/**', '**/app/**', '**/audio/**', 'pixi.js', 'preact', 'preact/*', '@preact/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'localStorage', 'requestAnimationFrame'],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts' },
        { object: 'Date', property: 'now', message: 'The sim has no wall clock' }],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: 'The sim has no wall clock' }],
    },
  },
);
