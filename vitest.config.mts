import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    // Tests are integration tests against one real, shared local Postgres — running
    // files in parallel lets one file's fixture rows leak into another's count-based
    // assertions (e.g. register-app-mode's "zero users" precondition).
    fileParallelism: false,
  },
});
