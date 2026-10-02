import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Separate from the main test suite: evals call the real Anthropic API (cost, network) and are run
// on demand with `npm run eval:captions`, never in CI.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
    },
  },
  test: {
    root,
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
