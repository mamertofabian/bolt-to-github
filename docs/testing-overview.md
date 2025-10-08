# Testing Overview

## Current Testing Status

**Last Updated**: 2025-10-08
**Version**: 1.3.12

### Summary Statistics

| Metric                       | Count | Percentage |
| ---------------------------- | ----- | ---------- |
| Total Source Files           | 171   | 100%       |
| Files with Unit Tests        | 51    | 29.8%      |
| Files without Tests          | 120   | 70.2%      |
| Total Test Files             | 84    | -          |
| Svelte Components            | 61    | -          |
| Svelte Components with Tests | 6     | 9.8%       |

### Test Coverage by Category

| Category              | Type   | Status                      |
| --------------------- | ------ | --------------------------- |
| **Unit Tests**        | Vitest | ✅ Partial (29.8% coverage) |
| **Component Tests**   | Vitest | ✅ Started (9.8% coverage)  |
| **Integration Tests** | None   | ❌ Missing                  |
| **E2E Tests**         | None   | ❌ Missing                  |

---

## Testing Tools & Technologies

### Current Testing Stack

| Tool/Library                  | Version | Purpose                  | Status           |
| ----------------------------- | ------- | ------------------------ | ---------------- |
| **Vitest**                    | 1.6.0   | Unit testing framework   | ✅ Configured    |
| **@testing-library/jest-dom** | 6.6.3   | DOM assertions           | ✅ Configured    |
| **@vitest/coverage-v8**       | 3.2.4   | Code coverage            | ✅ Configured    |
| **@vitest/ui**                | 1.6.0   | Test UI                  | ✅ Configured    |
| **jsdom**                     | 24.0.0  | DOM environment          | ✅ Configured    |
| **Playwright**                | -       | E2E testing              | ❌ Not installed |
| **@testing-library/svelte**   | -       | Svelte component testing | ❌ Not installed |

### Understanding Testing Tools

**Testing Tools vs Libraries vs Frameworks:**

- **Testing Frameworks**: Complete testing solutions (Vitest, Jest, Mocha)

  - Provide test runners, assertion libraries, and configuration
  - Example: Vitest runs tests and reports results

- **Testing Libraries**: Specialized utilities for specific testing needs

  - @testing-library/jest-dom: DOM-specific assertions
  - @testing-library/svelte: Utilities for testing Svelte components

- **Testing Tools**: Broader category including frameworks, libraries, and utilities
  - Playwright: Browser automation tool for E2E testing
  - Coverage reporters: Tools for measuring test coverage

**Appropriate Tools by Test Type:**

| Test Type             | Recommended Tools                  | Purpose                                          |
| --------------------- | ---------------------------------- | ------------------------------------------------ |
| **Unit Tests**        | Vitest + @testing-library/jest-dom | Test individual functions/classes in isolation   |
| **Component Tests**   | Vitest + @testing-library/svelte   | Test Svelte component rendering and interactions |
| **Integration Tests** | Vitest with real implementations   | Test how multiple units work together            |
| **E2E Tests**         | Playwright or Cypress              | Test complete user workflows in real browser     |

---

## What We Have: Existing Test Coverage

### ✅ Well-Tested Areas (49 files with tests)

#### Popup Components (4/14 files)

- ✅ **App.svelte** (10 test files, 189 tests)
  - App.cleanup.test.ts - Resource cleanup and disposal (22 tests)
  - App.initialization.test.ts - Component initialization and lifecycle (27 tests)
  - App.message-handlers.test.ts - Chrome runtime message handling (18 tests)
  - App.modal-states.test.ts - Modal state management (8 tests)
  - App.popup-context.test.ts - Popup context handling (7 tests)
  - App.premium-features.test.ts - Premium feature behavior (8 tests)
  - App.settings.test.ts - Settings management (28 tests)
  - App.temp-repo.test.ts - Temporary repository management (19 tests)
  - App.user-interactions.test.ts - User interaction flows (31 tests)
  - App.window-mode.test.ts - Window mode functionality (21 tests)
- ✅ **BranchSelectionModal.svelte** (1 test file, 19 tests)
  - BranchSelectionModal.component.test.ts - Branch selection, premium features, loading states, error handling (19 tests)
- ✅ **FeedbackModal.svelte** (1 test file, 19 tests)
  - FeedbackModal.component.test.ts - Category selection, message input, form validation, submission, log handling, error handling, GitHub/email fallback (19 tests)
- ✅ **OnboardingView.svelte** (1 test file, 14 tests)
  - OnboardingView.component.test.ts - Step navigation, event handling, props reactivity, conditional rendering (14 tests)

#### Library Components (2/29 files)

- ✅ **GitHubSettings.svelte** (2 test files, 103 tests) - **COMPREHENSIVE COVERAGE**
  - GitHubSettings.component.test.ts - Component rendering, collapsible behavior, form submission, storage quota, visual feedback, project settings (46 tests)
  - GitHubSettings.logic.test.ts - Token validation, debouncing, permission checking, repository filtering, error handling (57 tests)
  - **Testing Strategy**: Split into component + logic tests due to high complexity (600+ lines) with significant UI interactions and business logic
  - **Note**: Repository autocomplete UI timing tests were intentionally removed as they violated unit-testing-rules (time-dependent). Core autocomplete logic is tested in logic.test.ts.
- ✅ **OnboardingSetup.svelte** (1 test file, 43 tests)
  - OnboardingSetup.component.test.ts - Rendering and initial state, authentication method selection (GitHub App vs PAT), GitHub App UI (connect button, connected state, step-by-step guide), PAT UI (token input, repository owner input), form completion and submission, status messages, help links, security features display, reactive isSetupComplete (43 tests)
  - **Testing Strategy**: Single component test file (component is 313 lines with minimal business logic - simple event dispatching and one reactive statement)

#### Background Services (4/5 files)

- ✅ BackgroundService.ts (8 test files covering alarms, edge cases, user journeys, etc.)
- ✅ TempRepoManager.ts (3 test files)
- ✅ UsageTracker.ts
- ✅ WindowManager.ts

#### Content Scripts (4/6 core files)

- ✅ ContentManager.ts (3 test files: critical scenarios, edge cases, user journeys)
- ✅ MessageHandler.ts (3 test files: edge cases, memory leaks, basic tests)
- ✅ UIManager.ts
- ✅ WelcomePageContentScript.ts

#### Handlers (2/2 files)

- ✅ FileChangeHandler.ts
- ✅ GitHubUploadHandler.ts

#### Infrastructure (3/4 files)

- ✅ ComponentLifecycleManager.ts
- ✅ DOMObserver.ts
- ✅ UIElementFactory.ts

#### Managers (5/5 files)

- ✅ DropdownManager.ts
- ✅ GitHubButtonManager.ts
- ✅ NotificationManager.ts
- ✅ UploadStatusManager.ts
- ✅ WhatsNewManager.ts

#### Content Services (3/6 files)

- ✅ PremiumService.ts (2 test files)
- ✅ SupabaseAuthService.ts
- ✅ UIStateManager.ts

#### Global Services (19/22 files)

- ✅ AnalyticsService.ts (2 test files)
- ✅ AuthenticationStrategyFactory.ts (1 test file, 41 tests)
  - AuthenticationStrategyFactory.test.ts - Singleton pattern, strategy creation, caching, method switching (41 tests)
- ✅ BoltProjectSyncService.ts (2 test files)
- ✅ CacheService.ts
- ✅ DownloadService.ts
- ✅ FileService.ts
- ✅ GitHubApiClient.ts
- ✅ GitHubAppAuthenticationStrategy.ts (1 test file, 48 tests)
  - GitHubAppAuthenticationStrategy.test.ts - Token caching, automatic refresh, validation, permissions, user info retrieval, OAuth completion (48 tests)
- ✅ GitHubAppService.ts
- ✅ IdleMonitorService.ts
- ✅ PATAuthenticationStrategy.ts (1 test file, 54 tests)
  - PATAuthenticationStrategy.test.ts - Type property, constructor, token configuration, token retrieval and caching, authentication validation (classic/fine-grained tokens), permission checking, token refresh (unsupported), auth clearing, user info retrieval, renewal checking (always false), metadata retrieval, setToken method, integration scenarios, edge cases (54 tests)
- ✅ RateLimitHandler.ts
- ✅ ReadmeGeneratorService.ts
- ✅ RepoCloneService.ts
- ✅ RepositoryService.ts
- ✅ SubscriptionService.ts
- ✅ TokenService.ts
- ✅ UnifiedGitHubService.ts (3 test files)
- ✅ zipHandler.ts (4 test files)

#### Library Services (1/6 files)

- ✅ ProjectSettingsMigrationService.ts (1 test file, 38 tests)
  - ProjectSettingsMigrationService.test.ts - Migration detection, statistics gathering, bulk project migration (with progress callbacks, stale cache handling, GitHub App auth, error handling), single project migration, migration status reset, project migration validation, integration scenarios, edge cases (38 tests)

#### Utilities (5/11 files)

- ✅ fileUtils.ts
- ✅ githubAppSync.ts (1 test file, 29 tests)
- ✅ logStorage.ts
- ✅ logger.ts
- ✅ projectId.ts
- ✅ windowMode.ts

#### Storage (1/1 file)

- ✅ chromeStorage.ts (3 test files: BoltProjects, GitHubComCleanup, RaceConditions)

#### Stores (1/8 files)

- ✅ pushStatistics.ts

**Note**: App.svelte tests also indirectly test store actions and interactions through the component's behavior.

---

## What We're Missing: Test Gaps

### ❌ Critical Gaps

#### 1. **Very Limited Component Tests** (59 Svelte components untested)

Almost all UI components lack dedicated tests:

- ✅ **Main app (App.svelte)** - 10 test files, 189 tests covering:
  - Cleanup and resource disposal
  - Initialization and lifecycle
  - Message handling
  - Modal state management
  - Popup context handling
  - Premium features
  - Settings management
  - Temp repo management
  - User interactions
  - Window mode functionality
- ✅ **GitHubSettings.svelte** - 2 test files, 103 tests covering:
  - Component rendering and collapsible behavior
  - Form submission and validation
  - Token validation and debouncing logic
  - Repository filtering and permission checking
  - Storage quota error handling
  - Visual feedback and project settings
- ❌ All other popup components (12 files)
- ❌ All other lib components (28 files)
- ❌ All UI library components (19 files)
- ❌ Content components (2 files)

#### 2. **No E2E Tests**

- No browser automation testing
- No extension lifecycle testing
- No real GitHub integration testing
- No user workflow validation

#### 3. **No Integration Tests**

- Multi-service workflows untested
- Chrome API integration untested
- External API integration untested

#### 4. **Untested Services** (5 files)

- FilePreviewService.ts
- GitHubComparisonService.ts
- CommitTemplateService.ts
- OperationStateManager.ts
- PushReminderService.ts

See [testing-gaps.md](./testing-gaps.md) for complete detailed breakdown.

---

## Test Types Explained

### 1. Unit Tests (Current: Vitest)

**What they test**: Individual functions, classes, or modules in isolation
**Example**: Testing that `calculateTotal(items)` returns correct sum

**Current Status**: ✅ Partial coverage (25.7%)

### 2. Component Tests (Missing: Need @testing-library/svelte)

**What they test**: Svelte component rendering, props, events, user interactions
**Example**: Testing that clicking "Submit" button calls the submit handler

**Current Status**: ❌ Zero coverage

**How to add**:

```bash
pnpm add -D @testing-library/svelte
```

### 3. Integration Tests (Missing: Use Vitest with real implementations)

**What they test**: How multiple units/services work together
**Example**: Testing that uploading a file triggers GitHub API and updates UI

**Current Status**: ❌ Zero coverage

**How to add**: Write Vitest tests that use real implementations instead of mocks

### 4. E2E Tests (Missing: Need Playwright)

**What they test**: Complete user workflows in real browser environment
**Example**: User downloads ZIP from bolt.new, extension detects it, pushes to GitHub

**Current Status**: ❌ Zero coverage

**How to add**:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install
```

---

## Testing Quality Metrics

### Test Type Distribution (Should be)

- **Unit Tests**: 70% (Current: 100% of existing tests)
- **Component Tests**: 15% (Current: 0%)
- **Integration Tests**: 10% (Current: 0%)
- **E2E Tests**: 5% (Current: 0%)

### Coverage Goals

- **Overall**: 80%+ (Current: Unknown, likely ~25-35%)
- **Critical paths**: 100% (Current: Partial)
- **UI Components**: 70%+ (Current: 0%)
- **Business logic**: 90%+ (Current: ~60%)

---

## Recommendations

### Immediate Actions (Priority 1)

1. **Add E2E Testing with Playwright**

   - Install Playwright
   - Write tests for critical user flows
   - Test extension lifecycle

2. **Add Component Testing**

   - Install @testing-library/svelte
   - Test critical UI components first
   - Focus on forms, modals, and interactive elements

3. **Add Integration Tests**
   - Test multi-service workflows
   - Test GitHub API integration
   - Test Chrome storage operations

### Short-term Actions (Priority 2)

1. Fill gaps in service tests (5 untested services)
2. Add tests for stores (7 untested stores)
3. Test utility functions (7 untested utils)

### Long-term Actions (Priority 3)

1. Achieve 80%+ overall coverage
2. Add visual regression testing
3. Add performance testing
4. Implement mutation testing

---

## How to Run Tests

### ⚠️ Prerequisites

Before running tests, install dependencies:

```bash
pnpm install
```

**Note**: If you get `sh: vitest: command not found`, run `pnpm install` first.

### Current Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:ci

# Show list of failing test files (useful for debugging)
pnpm test:failed-files
```

**Using `test:failed-files`**: This command is particularly useful when you have multiple failing tests and want to quickly identify which test files need attention. It:

- Runs all tests and captures the output
- Extracts unique failing test file paths
- Displays a clean list of files with errors
- Can be used in CI/CD pipelines to identify problematic test files

### Future Commands (after adding tools)

```bash
# Run E2E tests (after Playwright setup)
pnpm test:e2e

# Run component tests only
pnpm test:components

# Run integration tests only
pnpm test:integration
```

---

## Next Steps

See [testing-gaps.md](./testing-gaps.md) for:

- Complete list of all untested files
- Detailed tables organized by category
- Specific test types needed for each file
- Priority recommendations
