# Testing Reference Guide

> **Last Updated**: May 26, 2025  
> **Purpose**: Comprehensive reference for implementing testing enhancements in bolt-to-github extension  
> **Related Issues**: #54, #55, #56, #57

## Table of Contents

- [Current Test Infrastructure](#current-test-infrastructure)
- [Coverage Analysis](#coverage-analysis)
- [Existing Test Patterns](#existing-test-patterns)
- [Component Inventory](#component-inventory)
- [Testing Enhancement Roadmap](#testing-enhancement-roadmap)
- [Implementation Examples](#implementation-examples)
- [Dependencies & Setup](#dependencies--setup)

---

## Current Test Infrastructure

### Jest Configuration

```javascript
// jest.config.js - Current Setup
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^\\$lib/fileUtils$': '<rootDir>/src/test/setup/fileUtils-mock.js',
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '\\.svelte$': '<rootDir>/src/test/setup/svelte-mock.js', // Basic mock only
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup/fetch-mocks.js'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
```

### Package.json Scripts

```json
{
  "test:ci": "jest --coverage=false",
  "test": "jest",
  "test:watch": "jest --watch"
}
```

### Current Dependencies

```json
{
  "dependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "jest-environment-jsdom": "^29.7.0"
  },
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "@types/jest": "^29.5.14",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.2"
  }
}
```

### Test Setup Files

#### fetch-mocks.js

```javascript
// src/test/setup/fetch-mocks.js
global.fetch = jest.fn();
global.btoa = jest.fn();
global.atob = jest.fn();
```

#### svelte-mock.js (Basic)

```javascript
// src/test/setup/svelte-mock.js - Current basic mock
class MockSvelteComponent {
  constructor(options = {}) {
    this.options = options;
    this.$set = function () {};
    this.$on = function () {};
    this.$destroy = function () {};
  }
}
module.exports = MockSvelteComponent;
```

---

## Coverage Analysis

### Current Overall Coverage: 9.66%

- **Test Suites**: 11 passed, 11 total
- **Tests**: 119 passed, 119 total
- **Well-tested Areas**: Services and utilities
- **Untested Areas**: All content script components (0% coverage)

### Detailed Coverage Breakdown

#### ✅ Well-Tested Components (60%+ coverage)

```
services/
├── CacheService.ts              88.23% ✅
├── FileService.ts               90.32% ✅
├── GitHubApiClient.ts           93.47% ✅
├── RateLimitHandler.ts          80.64% ✅
├── RepoCloneService.ts          75.92% ✅
├── RepositoryService.ts         75.55% ✅
├── SubscriptionService.ts       82.35% ✅
├── IdleMonitorService.ts        85.71% ✅

lib/
├── fileUtils.ts                 61.22% (needs improvement)
└── Queue.ts                     100% ✅
```

#### ❌ Untested Components (0% coverage)

```
content/
├── UIManager.ts                 0% ❌ (CRITICAL - 702 lines)
├── MessageHandler.ts            0% ❌
├── ContentManager.ts            0% ❌
├── managers/
│   ├── NotificationManager.ts   0% ❌ (264 lines)
│   ├── UploadStatusManager.ts   0% ❌ (199 lines)
│   ├── GitHubButtonManager.ts   0% ❌ (250 lines)
│   └── DropdownManager.ts       0% ❌ (417 lines)
├── handlers/
│   ├── GitHubUploadHandler.ts   0% ❌ (403 lines)
│   └── FileChangeHandler.ts     0% ❌ (440 lines)
├── infrastructure/
│   ├── DOMObserver.ts           0% ❌ (125 lines)
│   ├── ComponentLifecycleManager.ts  0% ❌ (200 lines)
│   ├── UIElementFactory.ts     0% ❌ (369 lines)
│   └── ActivityMonitor.ts      0% ❌ (271 lines)
└── services/
    ├── UIStateManager.ts        0% ❌ (322 lines)
    ├── PremiumService.ts        0% ❌ (395 lines)
    ├── PushReminderService.ts   0% ❌ (916 lines)
    ├── CommitTemplateService.ts 0% ❌ (246 lines)
    ├── OperationStateManager.ts 0% ❌ (416 lines)
    └── SupabaseAuthService.ts   0% ❌ (968 lines)

background/
├── BackgroundService.ts         0% ❌ (737 lines)
├── StateManager.ts              0% ❌ (24 lines)
└── TempRepoManager.ts           0% ❌ (254 lines)

popup/components/ (Svelte)
├── BranchSelectionModal.svelte  0% ❌ (231 lines)
├── UpgradeModal.svelte          0% ❌ (276 lines)
├── FeedbackModal.svelte         0% ❌ (294 lines)
├── PremiumStatus.svelte         0% ❌ (288 lines)
├── PushReminderSettings.svelte  0% ❌ (347 lines)
├── FileChangesModal.svelte      0% ❌ (249 lines)
├── PushReminderSection.svelte   0% ❌ (121 lines)
└── TempRepoModal.svelte         0% ❌ (100 lines)

content/
└── UploadStatus.svelte          0% ❌ (643 lines)
```

---

## Existing Test Patterns

### Service Test Pattern (Example: FileService)

```typescript
// Pattern: Service testing with mock dependencies
import { FileService } from '../FileService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';

// Mock external dependencies
jest.mock('$lib/fileUtils', () => ({
  decodeBase64ToUtf8: jest.fn((base64: string) => Buffer.from(base64, 'base64').toString('utf-8')),
}));

describe('FileService', () => {
  let mockApiClient: any;
  let fileService: FileService;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockApiClient = { request: jest.fn() };
    fileService = new FileService(mockApiClient as IGitHubApiClient);
    jest.clearAllMocks();

    // Mock global functions
    global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
  });

  describe('readFile', () => {
    test('should read a file and decode its content', async () => {
      // Arrange
      const mockContent = Buffer.from('file content').toString('base64');
      mockApiClient.request.mockResolvedValueOnce({
        content: mockContent,
        name: 'test.txt',
        path: 'test.txt',
        sha: 'abc123',
      });

      // Act
      const result = await fileService.readFile('testuser', 'test-repo', 'test.txt', 'main');

      // Assert
      expect(result).toBe('file content');
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        '/repos/testuser/test-repo/contents/test.txt?ref=main'
      );
    });

    test('should handle API errors', async () => {
      // Arrange
      mockApiClient.request.mockRejectedValueOnce(new Error('Not Found'));

      // Act & Assert
      await expect(
        fileService.readFile('testuser', 'test-repo', 'test.txt', 'main')
      ).rejects.toThrow('Failed to read file test.txt: Not Found');
    });
  });
});
```

### Utility Test Pattern (Example: fileUtils)

```typescript
// Pattern: Pure function testing
import {
  processFilesWithGitignore,
  decodeBase64ToUtf8,
  normalizeContentForComparison,
} from '../fileUtils';
import type { ProjectFiles } from '../types';

describe('fileUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processFilesWithGitignore', () => {
    test('should process files with .gitignore rules', () => {
      // Arrange
      const files: ProjectFiles = new Map([
        ['.gitignore', 'node_modules/\n*.log\nbuild/'],
        ['README.md', '# Project'],
        ['src/index.js', 'console.log("hello");'],
        ['node_modules/package.json', '{}'],
        ['debug.log', 'debug info'],
      ]);

      // Act
      const result = processFilesWithGitignore(files);

      // Assert
      expect(result.has('README.md')).toBe(true);
      expect(result.has('src/index.js')).toBe(true);
      expect(result.has('node_modules/package.json')).toBe(false);
      expect(result.has('debug.log')).toBe(false);
    });
  });
});
```

### Console Mocking Pattern

```typescript
// Pattern: Suppress console output during tests
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
```

---

## Component Inventory

### Content Script Architecture

```
UIManager (Singleton)
├── State Management
│   └── UIStateManager
├── Managers
│   ├── NotificationManager
│   ├── UploadStatusManager
│   ├── GitHubButtonManager
│   └── DropdownManager
├── Handlers
│   ├── GitHubUploadHandler
│   └── FileChangeHandler
├── Infrastructure
│   ├── DOMObserver
│   ├── ComponentLifecycleManager
│   ├── UIElementFactory
│   └── ActivityMonitor
└── Services
    ├── PremiumService
    ├── PushReminderService
    ├── CommitTemplateService
    ├── OperationStateManager
    └── SupabaseAuthService
```

### Key Interfaces & Types

```typescript
// Core interfaces that need testing
interface MessageHandler {
  sendMessage(message: any): Promise<any>;
  addListener(callback: Function): void;
}

interface UIStateManager {
  setUploadStatus(status: UploadStatusState): void;
  getUploadStatus(): UploadStatusState;
  setButtonState(isValid: boolean): void;
  getButtonState(): boolean;
  addListener(callback: Function): void;
  removeListener(callback: Function): void;
}

interface INotificationManager {
  showNotification(options: NotificationOptions): void;
  showSettingsNotification(): void;
  cleanup(): void;
}

type UploadStatusState = {
  status: 'idle' | 'uploading' | 'success' | 'error' | 'complete' | 'loading' | 'analyzing';
  message?: string;
  progress?: number;
};
```

---

## Testing Enhancement Roadmap

### Phase 1: Unit Tests Foundation (Issue #57)

**Priority**: High | **Target**: 60%+ coverage

#### Week 1-2: Critical Components

- [ ] UIManager singleton pattern and public API
- [ ] UIStateManager state coordination
- [ ] NotificationManager display logic
- [ ] PremiumService feature gating

#### Week 3-4: Manager Components

- [ ] UploadStatusManager status handling
- [ ] GitHubButtonManager button lifecycle
- [ ] DropdownManager UI interactions
- [ ] DOMObserver mutation handling

#### Week 5-6: Handlers & Infrastructure

- [ ] GitHubUploadHandler upload workflow
- [ ] FileChangeHandler change detection
- [ ] ComponentLifecycleManager cleanup
- [ ] UIElementFactory element creation

#### Week 7-8: Services & Background

- [ ] BackgroundService message handling
- [ ] PushReminderService reminder logic
- [ ] CommitTemplateService templating
- [ ] Utility functions improvements

### Phase 2: Integration Tests (Issue #54)

**Priority**: High | **Focus**: Component coordination

- [ ] Manager coordination tests
- [ ] State management flow validation
- [ ] Upload workflow integration
- [ ] Error handling integration

### Phase 3: Svelte Component Tests (Issue #55)

**Priority**: Medium | **Focus**: UI behavior

- [ ] UploadStatus.svelte (critical upload component)
- [ ] 8 Popup components (modals, settings, status)
- [ ] User interaction testing
- [ ] Accessibility validation

### Phase 4: E2E Tests (Issue #56)

**Priority**: Medium | **Focus**: Real workflows

- [ ] Extension lifecycle testing
- [ ] Complete upload workflows
- [ ] Cross-browser compatibility
- [ ] Performance validation

---

## Implementation Examples

### Enhanced Jest Configuration

```javascript
// Updated jest.config.js for all testing layers
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
    '^.+\\.svelte$': ['svelte-jester', { preprocess: true }], // For Svelte testing
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    // Remove basic svelte mock for real testing
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup/fetch-mocks.js',
    '<rootDir>/src/test/setup/chrome-mocks.js', // NEW
    '<rootDir>/src/test/setup/dom-mocks.js', // NEW
    '<rootDir>/src/test/setup/testing-library.js', // NEW
    '<rootDir>/src/test/setup/integration-setup.js', // NEW
  ],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec|integration))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/test/**/*'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
```

### Chrome API Mocking Setup

```typescript
// src/test/setup/chrome-mocks.js
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
};
```

### DOM Testing Setup

```typescript
// src/test/setup/dom-mocks.js
import { TextEncoder, TextDecoder } from 'util';

// Setup global text encoding
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock DOM APIs
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.MutationObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock matchMedia for responsive testing
global.matchMedia = jest.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));
```

### Singleton Testing Pattern

```typescript
// Pattern: Testing singleton classes (UIManager)
describe('UIManager Singleton', () => {
  beforeEach(() => {
    UIManager.resetInstance(); // Reset singleton state
    document.body.innerHTML = '<div></div>';
  });

  afterEach(() => {
    UIManager.resetInstance();
    document.body.innerHTML = '';
  });

  test('maintains single instance', () => {
    const instance1 = UIManager.initialize(mockMessageHandler);
    const instance2 = UIManager.getInstance();
    expect(instance1).toBe(instance2);
  });
});
```

### State Management Testing Pattern

```typescript
// Pattern: Testing state coordination
describe('State Management', () => {
  test('state changes trigger listeners', () => {
    const listener = jest.fn();
    stateManager.addListener(listener);

    const newState = { status: 'uploading', progress: 50 };
    stateManager.setUploadStatus(newState);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ uploadStatus: newState }),
      expect.any(Object)
    );
  });
});
```

### Component Lifecycle Testing Pattern

```typescript
// Pattern: Testing component cleanup
describe('Component Lifecycle', () => {
  test('cleanup removes all components', () => {
    manager.initialize();
    expect(document.querySelector('.component')).toBeTruthy();

    manager.cleanup();
    expect(document.querySelector('.component')).toBeFalsy();
  });
});
```

---

## Dependencies & Setup

### Required New Dependencies

```json
{
  "devDependencies": {
    // Svelte Testing
    "@testing-library/svelte": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3", // Already installed
    "@testing-library/user-event": "^14.0.0",
    "svelte-jester": "^3.0.0",

    // E2E Testing
    "@playwright/test": "^1.40.0",
    "playwright-chromium": "^1.40.0",
    "playwright-core": "^1.40.0",

    // Additional Testing Utilities
    "jest-environment-jsdom": "^29.7.0", // Already installed
    "@types/chrome": "^0.0.236" // Already installed
  }
}
```

### Directory Structure for Tests

```
src/
├── content/
│   ├── __tests__/
│   │   ├── UIManager.test.ts
│   │   ├── MessageHandler.test.ts
│   │   ├── UploadStatus.test.ts
│   │   └── integration/
│   │       ├── ManagerCoordination.test.ts
│   │       ├── StateCoordination.test.ts
│   │       └── UploadFlow.test.ts
│   ├── managers/__tests__/
│   │   ├── NotificationManager.test.ts
│   │   ├── UploadStatusManager.test.ts
│   │   ├── GitHubButtonManager.test.ts
│   │   └── DropdownManager.test.ts
│   ├── handlers/__tests__/
│   │   ├── GitHubUploadHandler.test.ts
│   │   └── FileChangeHandler.test.ts
│   ├── infrastructure/__tests__/
│   │   ├── DOMObserver.test.ts
│   │   ├── ComponentLifecycleManager.test.ts
│   │   ├── UIElementFactory.test.ts
│   │   └── ActivityMonitor.test.ts
│   └── services/__tests__/
│       ├── UIStateManager.test.ts
│       ├── PremiumService.test.ts
│       ├── PushReminderService.test.ts
│       ├── CommitTemplateService.test.ts
│       ├── OperationStateManager.test.ts
│       └── SupabaseAuthService.test.ts
├── background/__tests__/
│   ├── BackgroundService.test.ts
│   ├── StateManager.test.ts
│   └── TempRepoManager.test.ts
├── popup/components/__tests__/
│   ├── BranchSelectionModal.test.ts
│   ├── UpgradeModal.test.ts
│   ├── FeedbackModal.test.ts
│   ├── PremiumStatus.test.ts
│   ├── PushReminderSettings.test.ts
│   ├── FileChangesModal.test.ts
│   ├── PushReminderSection.test.ts
│   └── TempRepoModal.test.ts
├── e2e/
│   ├── helpers/
│   │   ├── ExtensionHelper.ts
│   │   ├── MockHelper.ts
│   │   └── TestData.ts
│   ├── extension-lifecycle.spec.ts
│   ├── github-upload.spec.ts
│   ├── popup-functionality.spec.ts
│   ├── premium-features.spec.ts
│   ├── cross-browser.spec.ts
│   └── performance.spec.ts
└── test/setup/
    ├── fetch-mocks.js (existing)
    ├── chrome-mocks.js (new)
    ├── dom-mocks.js (new)
    ├── testing-library.js (new)
    └── integration-setup.js (new)
```

### Configuration Files to Add/Update

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    actionTimeout: 0,
    baseURL: 'https://bolt.new',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

---

## Success Metrics & Validation

### Coverage Targets

- **Current**: 9.66% overall coverage
- **Phase 1**: 60%+ overall coverage (Unit tests)
- **Phase 2**: 70%+ with integration coverage
- **Phase 3**: 75%+ with UI component coverage
- **Phase 4**: 80%+ with E2E coverage

### Test Count Targets

- **Current**: 119 tests
- **Phase 1**: ~300 tests (+150-200 unit tests)
- **Phase 2**: ~325 tests (+25-30 integration tests)
- **Phase 3**: ~365 tests (+40-50 component tests)
- **Phase 4**: ~385 tests (+20-30 E2E tests)

### Quality Gates

- ✅ All tests must pass (maintain 100% pass rate)
- ✅ Coverage thresholds enforced in CI/CD
- ✅ No console errors in test output (except expected)
- ✅ Memory leak detection in component tests
- ✅ Performance benchmarks in E2E tests

---

## Notes & Best Practices

### Testing Philosophy

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test component coordination and workflows
3. **UI Tests**: Test user interactions and accessibility
4. **E2E Tests**: Test complete user workflows in real browsers

### Common Patterns to Follow

- Always reset singletons between tests
- Mock external dependencies (Chrome APIs, fetch, etc.)
- Use descriptive test names with "should" statements
- Follow AAA pattern (Arrange, Act, Assert)
- Test both success and error scenarios
- Include edge cases and boundary conditions

### Debugging Tips

- Use `screen.debug()` for Svelte component debugging
- Use `console.log` with `screen.getByRole('debug')` for DOM inspection
- Use `--verbose` flag for detailed test output
- Use `--watch` flag for development testing

### Memory Management

- Always cleanup components in `afterEach`
- Reset DOM state between tests
- Clear all mocks between tests
- Dispose of event listeners properly

---

**End of Testing Reference Guide**

This document serves as the complete reference for implementing comprehensive testing in the bolt-to-github extension. Refer to the related GitHub issues (#54, #55, #56, #57) for detailed implementation plans and progress tracking.
