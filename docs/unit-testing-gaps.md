# Unit Testing Gaps - Detailed Analysis

> **📘 For Component Testing Gaps:** See [component-testing-gaps.md](./component-testing-gaps.md)

**Last Updated**: 2025-10-08  
**Total Untested Unit Test Files**: 20 files

This document lists ALL files that lack unit tests, organized by category with specific test types needed.

---

## Table of Contents

1. [Stores (5 files)](#stores)
2. [Content Services (2 files)](#content-services)
3. [Utilities (7 files)](#utilities)
4. [Infrastructure (1 file)](#infrastructure)
5. [Library Services (2 files)](#library-services)
6. [Entry Points (3 files)](#entry-points)

---

## Stores

**Total**: 7 files | **Tested**: 2 files | **Coverage**: 28.6%

### ❌ Untested (5 files)

| File Path                             | Missing Test Types | Recommended Tools | Priority |
| ------------------------------------- | ------------------ | ----------------- | -------- |
| \`src/lib/stores/fileChanges.ts\`     | Unit               | Vitest            | �� High  |
| \`src/lib/stores/githubSettings.ts\`  | Unit               | Vitest            | 🔴 High  |
| \`src/lib/stores/issuesStore.ts\`     | Unit               | Vitest            | 🔴 High  |
| \`src/lib/stores/projectSettings.ts\` | Unit               | Vitest            | 🔴 High  |
| \`src/lib/stores/uiState.ts\`         | Unit               | Vitest            | 🔴 High  |
| \`src/lib/stores/uploadState.ts\`     | Unit               | Vitest            | 🔴 High  |

### ✅ Tested (2 files)

- \`src/lib/stores/pushStatistics.ts\`
- \`src/lib/stores/premiumStore.ts\` (34 tests)

---

## Content Services

**Total**: 6 files | **Tested**: 4 files | **Coverage**: 66.7%

### ❌ Untested (2 files)

| File Path                                         | Missing Test Types | Recommended Tools | Priority |
| ------------------------------------------------- | ------------------ | ----------------- | -------- |
| \`src/content/services/CommitTemplateService.ts\` | Unit, Integration  | Vitest            | 🔴 High  |
| \`src/content/services/PushReminderService.ts\`   | Unit, Integration  | Vitest            | 🔴 High  |

### ✅ Tested (4 files)

- \`src/content/services/OperationStateManager.ts\` (66 tests)
- \`src/content/services/PremiumService.ts\` (2 test files)
- \`src/content/services/SupabaseAuthService.ts\`
- \`src/content/services/UIStateManager.ts\`

---

## Utilities

**Total**: 14 files | **Tested**: 7 files | **Coverage**: 50%

### ❌ Untested (7 files)

| File Path                               | Missing Test Types | Recommended Tools | Priority  |
| --------------------------------------- | ------------------ | ----------------- | --------- |
| \`src/lib/utils/debounce.ts\`           | Unit               | Vitest            | 🔴 High   |
| \`src/lib/utils/upgradeModal.ts\`       | Unit               | Vitest            | 🔴 High   |
| \`src/lib/zip.ts\`                      | Unit               | Vitest            | 🔴 High   |
| \`src/lib/Queue.ts\`                    | Unit               | Vitest            | 🔴 High   |
| \`src/lib/common.ts\`                   | Unit               | Vitest            | 🔴 High   |
| \`src/lib/utils/reassuringMessages.ts\` | Unit               | Vitest            | 🟡 Medium |

### ✅ Tested (7 files)

- \`src/lib/fileUtils.ts\`
- \`src/lib/utils/analytics.ts\` (46 tests)
- \`src/lib/utils/githubAppSync.ts\` (29 tests)
- \`src/lib/utils/logStorage.ts\`
- \`src/lib/utils/logger.ts\`
- \`src/lib/utils/projectId.ts\`
- \`src/lib/utils.ts\` (16 tests)
- \`src/lib/utils/windowMode.ts\`

---

## Infrastructure

**Total**: 4 files | **Tested**: 3 files | **Coverage**: 75%

### ❌ Untested (1 file)

| File Path                                         | Missing Test Types | Recommended Tools | Priority |
| ------------------------------------------------- | ------------------ | ----------------- | -------- |
| \`src/content/infrastructure/ActivityMonitor.ts\` | Unit, Integration  | Vitest            | 🔴 High  |

### ✅ Tested (3 files)

- \`src/content/infrastructure/ComponentLifecycleManager.ts\`
- \`src/content/infrastructure/DOMObserver.ts\`
- \`src/content/infrastructure/UIElementFactory.ts\`

---

## Library Services

**Total**: 6 files | **Tested**: 2 files | **Coverage**: 33.3%

### ❌ Untested (2 files)

| File Path                               | Missing Test Types   | Recommended Tools | Priority  |
| --------------------------------------- | -------------------- | ----------------- | --------- |
| \`src/lib/services/chromeMessaging.ts\` | Unit, Integration    | Vitest            | 🔴 High   |
| \`src/lib/services/chromeStorage.ts\`   | Unit (comprehensive) | Vitest            | 🟡 Medium |

**Note**: chromeStorage.ts has 3 specific test files (BoltProjects, GitHubComCleanup, RaceConditions) but needs comprehensive coverage.

### ✅ Tested (2 files)

- \`src/lib/services/GitHubCacheService.ts\` (47 tests)
- \`src/lib/services/ProjectSettingsMigrationService.ts\` (38 tests)

---

## Entry Points

**Total**: 3 files | **Tested**: 0 files | **Coverage**: 0%

### ❌ Untested (3 files)

| File Path                | Missing Test Types | Recommended Tools  | Priority  |
| ------------------------ | ------------------ | ------------------ | --------- |
| \`src/content/index.ts\` | Integration, E2E   | Vitest, Playwright | 🟡 Medium |
| \`src/popup/main.ts\`    | Integration, E2E   | Vitest, Playwright | 🟡 Medium |
| \`src/pages/logs.ts\`    | Integration        | Vitest             | 🟡 Medium |

**Note**: Entry points typically need integration and E2E tests rather than traditional unit tests.

---

## Priority Recommendations

### 🔴 Critical Priority (13 files)

Files that are essential to core functionality and should be tested immediately:

#### Stores (5 files)

- \`src/lib/stores/fileChanges.ts\`
- \`src/lib/stores/githubSettings.ts\`
- \`src/lib/stores/issuesStore.ts\`
- \`src/lib/stores/projectSettings.ts\`
- \`src/lib/stores/uiState.ts\`
- \`src/lib/stores/uploadState.ts\`

#### Content Services (2 files)

- \`src/content/services/CommitTemplateService.ts\`
- \`src/content/services/PushReminderService.ts\`

#### Utilities (5 files)

- \`src/lib/utils/debounce.ts\`
- \`src/lib/utils/upgradeModal.ts\`
- \`src/lib/zip.ts\`
- \`src/lib/Queue.ts\`
- \`src/lib/common.ts\`

#### Infrastructure (1 file)

- \`src/content/infrastructure/ActivityMonitor.ts\`

#### Library Services (1 file)

- \`src/lib/services/chromeMessaging.ts\`

### 🟡 Medium Priority (4 files)

- \`src/lib/utils/reassuringMessages.ts\`
- \`src/lib/services/chromeStorage.ts\` (needs comprehensive tests)
- Entry points (3 files) - need integration/E2E tests

---

## Success Metrics

### File Coverage Targets

- [x] **Services: 100%** (22/22 files) - All services tested ✅
- [x] **Background: 100%** (6/6 files) - All background files tested ✅
- [ ] **Stores: 100%** (currently 29% - 2/7 files)
- [ ] **Utilities: 90%** (currently 50% - 7/14 files)
- [ ] **Content Services: 100%** (currently 67% - 4/6 files)
- [ ] **Infrastructure: 100%** (currently 75% - 3/4 files)
- [ ] **Overall Unit Test Coverage: 80%+** (currently ~35%)

### Quality Metrics

- All tests passing
- No flaky tests
- Test execution time < 5 minutes
- Follow [unit-testing-rules.md](./unit-testing-rules.md) guidelines

---

## Notes

### File Verification Status

✅ All file paths in this document have been verified to exist in the repository.

### Test Type Definitions

- **Unit**: Tests individual functions/classes in isolation
- **Integration**: Tests multiple units working together
- **E2E**: Tests complete user workflows in browser

### Excluded from This Document

- **Component tests** - See [component-testing-gaps.md](./component-testing-gaps.md)
- **Type definitions** - No runtime behavior to test
- **Constants** - No logic to test
- **Re-export index files** - No logic to test
