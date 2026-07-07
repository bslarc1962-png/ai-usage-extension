import { defineConfig } from 'vitest/config';

// Unit tests for the pure logic in `src/`. The `tests/*.test.js` release-gate
// suite stays on `node --test` (run via `pnpm test:store`); vitest only picks
// up the TypeScript unit tests under `tests/unit/`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
