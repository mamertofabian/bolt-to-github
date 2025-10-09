# Unit Testing Overview

> **📘 For Component Testing:** See [component-testing-rules.md](./component-testing-rules.md) and [component-tests-requiring-review.md](./component-tests-requiring-review.md)

**Last Updated**: 2025-10-08  
**Version**: 1.3.12

---

## Testing Documentation

- **[unit-testing-rules.md](./unit-testing-rules.md)** - Rules for testing classes, functions, and services
- **[unit-tests-requiring-review.md](./unit-tests-requiring-review.md)** - Unit tests that need review or improvement

---

## Current Status

### Summary

| Metric                   | Count | Coverage |
| ------------------------ | ----- | -------- |
| Total Source Files       | 171   | 100%     |
| Files with Unit Tests    | 60    | 35.1%    |
| Files without Unit Tests | 111   | 64.9%    |

### Testing Stack

| Tool                          | Version | Purpose         | Status        |
| ----------------------------- | ------- | --------------- | ------------- |
| **Vitest**                    | 1.6.0   | Test framework  | ✅ Configured |
| **@testing-library/jest-dom** | 6.6.3   | DOM assertions  | ✅ Configured |
| **@vitest/coverage-v8**       | 3.2.4   | Code coverage   | ✅ Configured |
| **jsdom**                     | 24.0.0  | DOM environment | ✅ Configured |

---

## Coverage Summary

### ✅ Fully Tested (100%)

- **Services** (22/22 files) - Authentication, GitHub, File, Analytics, Rate limiting
- **Background** (6/6 files) - Service, State, TempRepo, Usage, Window managers
- **Content Handlers** (2/2 files) - FileChange, GitHubUpload
- **Content Managers** (5/5 files) - Dropdown, Button, Notification, Upload, WhatsNew

### ⚠️ Partially Tested

| Category             | Coverage | Tested | Untested                                                                   |
| -------------------- | -------- | ------ | -------------------------------------------------------------------------- |
| **Stores**           | 29%      | 2/7    | fileChanges, githubSettings, issues, projectSettings, uiState, uploadState |
| **Utilities**        | 64%      | 7/11   | debounce, reassuringMessages, upgradeModal, zip                            |
| **Content Services** | 67%      | 4/6    | CommitTemplate, PushReminder                                               |
| **Infrastructure**   | 75%      | 3/4    | ActivityMonitor                                                            |
| **Lib Services**     | 33%      | 2/6    | chromeMessaging, chromeStorage                                             |

### ❌ Untested

| Category             | Files                                 | Priority    |
| -------------------- | ------------------------------------- | ----------- |
| **Shared Utilities** | Queue, common, chromeMessaging        | 🔴 Critical |
| **Entry Points**     | content/index, popup/main, pages/logs | 🟡 Medium   |

---

## Testing Gaps - Priority Order

### 🔴 Critical Priority (11 files)

#### Stores (6 files) - Critical for state management

- `src/lib/stores/fileChanges.ts`
- `src/lib/stores/githubSettings.ts`
- `src/lib/stores/issuesStore.ts`
- `src/lib/stores/projectSettings.ts`
- `src/lib/stores/uiState.ts`
- `src/lib/stores/uploadState.ts`

#### Content Services (2 files)

- `src/content/services/CommitTemplateService.ts`
- `src/content/services/PushReminderService.ts`

#### Shared Utilities (3 files)

- `src/lib/Queue.ts`
- `src/lib/common.ts`
- `src/lib/services/chromeMessaging.ts`

### 🟡 High Priority (5 files)

#### Library Utilities (4 files)

- `src/lib/utils/debounce.ts`
- `src/lib/utils/upgradeModal.ts`
- `src/lib/zip.ts`

#### Infrastructure (1 file)

- `src/content/infrastructure/ActivityMonitor.ts`

### 🟢 Medium Priority (4 files)

#### Utilities

- `src/lib/utils/reassuringMessages.ts`

#### Entry Points (Integration tests)

- `src/content/index.ts`
- `src/popup/main.ts`
- `src/pages/logs.ts`

---

## Testing Commands

```bash
# Install dependencies first
pnpm install

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:ci

# Show failing test files
pnpm test:failed-files
```

---

## Next Steps

### Phase 1: Critical Gaps (Weeks 1-2)

1. Test all stores (6 files)
2. Test content services (2 files)
3. Test shared utilities (3 files)

### Phase 2: High Priority (Weeks 3-4)

1. Test library utilities (4 files)
2. Test ActivityMonitor infrastructure
3. Add integration tests

### Phase 3: Quality Improvement

1. Review and improve existing tests (see [unit-tests-requiring-review.md](./unit-tests-requiring-review.md))
2. Achieve 80%+ coverage
3. Add E2E tests

---

## Success Metrics

### Coverage Targets

| Category             | Current  | Target |
| -------------------- | -------- | ------ |
| **Services**         | ✅ 100%  | 100%   |
| **Background**       | ✅ 100%  | 100%   |
| **Stores**           | ⚠️ 29%   | 100%   |
| **Utilities**        | ⚠️ 64%   | 90%    |
| **Content Services** | ⚠️ 67%   | 100%   |
| **Infrastructure**   | ⚠️ 75%   | 100%   |
| **Overall**          | ⚠️ 35.1% | 80%+   |

### Quality Goals

- ✅ All tests passing
- ✅ No flaky tests
- ✅ Test execution < 5 minutes
- 🎯 Follow [unit-testing-rules.md](./unit-testing-rules.md)
