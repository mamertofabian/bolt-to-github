# Jest to Vitest Migration Plan

## Overview

Migrate from Jest to Vitest for better Vite ecosystem integration and to eliminate import.meta.env workarounds.

### Current State:

- 63 test suites, 1,104 tests
- Complex Jest configuration with ESM workarounds
- Multiple setup files for mocking
- Custom import.meta.env handling
- ts-jest for TypeScript compilation

### Target State:

- Vitest with native Vite integration
- Simplified configuration
- Native import.meta.env support
- Faster test execution
- Cleaner mocking approach

## Phase 1: Setup and Dependencies

### 1.1 Update package.json dependencies

**Remove:**

- jest
- @types/jest
- ts-jest
- jest-environment-jsdom
- @jest/globals

**Add:**

- vitest (^1.6.0)
- @vitest/ui (^1.6.0)
- jsdom (^24.0.0)
- @testing-library/jest-dom (keep existing)

### 1.2 Update scripts in package.json

```json
"test:ci": "vitest run",
"test": "vitest",
"test:watch": "vitest watch",
"test:ui": "vitest --ui"
```

### 1.3 Update TypeScript configuration

- Remove "jest" from types array in tsconfig.json
- Add "vitest/globals" if using global test functions

## Phase 2: Configuration Migration

### 2.1 Create vitest.config.ts

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup/vitest-setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
    alias: {
      $lib: '/src/lib',
      '$lib/*': '/src/lib/*',
    },
  },
});
```

### 2.2 Consolidate setup files

Create single `src/test/setup/vitest-setup.ts` combining:

- Chrome mocks
- DOM mocks
- Fetch mocks
- Console mocks
- Import @testing-library/jest-dom

### 2.3 Remove Jest-specific files

- jest.config.js
- src/test/setup/import-meta-mock.js
- src/config/analytics.ts (no longer needed)
- src/config/**mocks**/analytics.ts

## Phase 3: Test File Migration

### 3.1 Update imports (automated via script)

Replace in all test files:

- `jest.fn()` → `vi.fn()`
- `jest.mock()` → `vi.mock()`
- `jest.spyOn()` → `vi.spyOn()`
- `jest.clearAllMocks()` → `vi.clearAllMocks()`
- `jest.resetAllMocks()` → `vi.resetAllMocks()`

### 3.2 Update mock syntax

Replace module mocks:

```typescript
// Jest
jest.mock('../module', () => ({
  default: jest.fn(),
}));

// Vitest
vi.mock('../module', () => ({
  default: vi.fn(),
}));
```

### 3.3 Update setup/teardown hooks

No changes needed - beforeEach, afterEach, etc. work the same

## Phase 4: Analytics Service Cleanup

### 4.1 Revert AnalyticsService.ts

Remove the config import workaround:

```typescript
// Change from:
import { getAnalyticsApiSecret } from '../config/analytics';
this.API_SECRET = getAnalyticsApiSecret();

// Back to:
this.API_SECRET = import.meta.env.VITE_GA4_API_SECRET || '';
```

### 4.2 Remove analytics config module

Delete:

- src/config/analytics.ts
- src/config/**mocks**/analytics.ts

## Phase 5: Mock Updates

### 5.1 Update Chrome mocks for Vitest

Convert jest.fn() to vi.fn() in chrome-mocks

### 5.2 Simplify Svelte component mocking

Use Vitest's built-in mocking for .svelte files

### 5.3 Update fileUtils mock

Convert to Vitest syntax

## Phase 6: Testing and Validation

### 6.1 Run migration script

Create and run automated migration script for syntax updates

### 6.2 Fix any remaining issues

- Type errors from @types/jest removal
- Mock implementation differences
- Any Vitest-specific adjustments

### 6.3 Verify all tests pass

- Run full test suite
- Check coverage reports
- Validate CI/CD pipeline

## Phase 7: Cleanup

### 7.1 Remove Jest artifacts

- Remove all Jest-related dependencies
- Clean up unused mock files
- Update documentation

### 7.2 Update CI configuration

Update GitHub Actions or other CI to use Vitest commands

## Benefits After Migration

1. **No more import.meta.env workarounds** - Native support
2. **Faster test execution** - Vite's transformation pipeline
3. **Simpler configuration** - Single config file
4. **Better debugging** - Native sourcemap support
5. **Unified tooling** - Same config as build process
6. **Hot module replacement** in tests
7. **Better error messages** with stack traces

## Estimated Timeline

- Phase 1-2: 1 hour (setup and config)
- Phase 3: 2-3 hours (automated migration + manual fixes)
- Phase 4-5: 1 hour (cleanup and mocks)
- Phase 6: 2-3 hours (testing and fixes)
- Phase 7: 30 minutes (final cleanup)

**Total: 6-8 hours of work**

## Risk Mitigation

1. Create a new branch for migration
2. Keep Jest config until all tests pass
3. Run both Jest and Vitest in parallel initially
4. Commit after each successful phase
5. Have rollback plan if issues arise
