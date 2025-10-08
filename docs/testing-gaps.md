# Testing Gaps - Detailed Analysis

**Last Updated**: 2025-10-08
**Total Untested Files**: 110 out of 171 (64.3%)

This document lists ALL files that lack tests, organized by category with specific test types needed.

---

## Table of Contents

1. [Svelte Components (61 files)](#svelte-components)
2. [Services (8 files)](#services)
3. [Stores (7 files)](#stores)
4. [3. **Critical Stores**

   - ✅ ~~`src/lib/stores/premiumStore.ts`~~ (Completed - 1 test file, 34 tests)lities (7 files)](#utilities)

5. [Infrastructure (1 file)](#infrastructure)
6. [Content Services (3 files)](#content-services)
7. [Background (2 files)](#background)
8. [Type Definitions (13 files)](#type-definitions)
9. [Constants (5 files)](#constants)
10. [Other Files (46 files)](#other-files)

---

## Svelte Components

**Total**: 61 files | **Tested**: 7 files | **Coverage**: 11.5%

### Popup Components (13 files)

**✅ Tested (4 files)**:

- `src/popup/App.svelte` - **10 test files, 189 tests** covering cleanup, initialization, message handling, modal states, popup context, premium features, settings, temp repos, user interactions, and window mode
- `src/popup/components/BranchSelectionModal.svelte` - **1 test file, 19 tests** covering branch loading, default branch selection, premium feature access, branch selection behavior, import/cancel actions, empty states, loading states, error handling, and reactive loading
- `src/popup/components/FeedbackModal.svelte` - **1 test file, 19 tests** covering category selection, message input, form validation, feedback submission with PAT/GitHub App auth, log handling, error handling with fallbacks, GitHub issue URL generation, alternative contact methods (email/GitHub), form reset, modal close, success state, and fallback submissions
- `src/popup/components/OnboardingView.svelte` - **1 test file, 14 tests** covering step navigation (welcome → setup), event dispatching (save, error, authMethodChange), props reactivity (githubSettings, projectSettings, uiState), conditional rendering based on isBoltSite, and UI state propagation

**❌ Untested (9 files)**:

| File Path                                          | Missing Test Types     | Recommended Tools                   | Priority  |
| -------------------------------------------------- | ---------------------- | ----------------------------------- | --------- |
| `src/popup/components/FileChangesModal.svelte`     | Component, Integration | @testing-library/svelte, Vitest     | 🟡 High   |
| `src/popup/components/HelpTabContent.svelte`       | Component              | @testing-library/svelte             | 🟢 Medium |
| `src/popup/components/HomeTabContent.svelte`       | Component, E2E         | @testing-library/svelte, Playwright | 🟡 High   |
| `src/popup/components/PremiumStatus.svelte`        | Component              | @testing-library/svelte             | 🟡 High   |
| `src/popup/components/PushReminderSection.svelte`  | Component              | @testing-library/svelte             | 🟢 Medium |
| `src/popup/components/PushReminderSettings.svelte` | Component, Integration | @testing-library/svelte, Vitest     | 🟡 High   |
| `src/popup/components/SettingsTabContent.svelte`   | Component, Integration | @testing-library/svelte, Vitest     | 🟡 High   |
| `src/popup/components/TabsView.svelte`             | Component              | @testing-library/svelte             | 🟡 High   |
| `src/popup/components/TempRepoModal.svelte`        | Component, Integration | @testing-library/svelte, Vitest     | 🟡 High   |
| `src/popup/components/UpgradeModal.svelte`         | Component              | @testing-library/svelte             | 🟡 High   |

### Lib Components (29 files)

**✅ Tested (3 files)**:

- `src/lib/components/GitHubSettings.svelte` - **2 test files, 103 tests** covering component rendering, collapsible behavior, form submission, token validation, debouncing, permission checking, repository filtering, storage quota error handling, and visual feedback
- `src/lib/components/OnboardingSetup.svelte` - **1 test file, 43 tests** covering rendering and initial state, authentication method selection (GitHub App vs PAT), GitHub App UI (connect button, connected state, step-by-step guide), PAT UI (token input, repository owner input), form completion and submission, status messages, help links, security features display, and reactive isSetupComplete
- `src/lib/components/RepoSettings.svelte` - **2 test files, 110 tests** covering component rendering (modal, forms, inputs, buttons), user interactions (typing, clicking, keyboard navigation), repository dropdown (loading, filtering, selection, keyboard nav), form validation, save operations, error handling, default project title, authentication method detection (PAT/GitHub App), and reactive state management

**❌ Untested (26 files)**:

| File Path                                      | Missing Test Types     | Recommended Tools               | Priority  |
| ---------------------------------------------- | ---------------------- | ------------------------------- | --------- |
| `src/lib/components/DiffViewer.svelte`         | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/Footer.svelte`             | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/Header.svelte`             | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/Help.svelte`               | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/IssueCard.svelte`          | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/IssueManager.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/LogViewer.svelte`          | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/NewIssueForm.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/NewsletterModal.svelte`    | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/NewsletterSection.svelte`  | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ProjectGuide.svelte`       | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ProjectStatus.svelte`      | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ProjectsList.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/ProjectsListGuide.svelte`  | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/QuickIssueForm.svelte`     | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/SocialLinks.svelte`        | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/StatusAlert.svelte`        | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/SuccessToast.svelte`       | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/WelcomeHero.svelte`        | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/WhatsNewModal.svelte`      | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/AnalyticsToggle.svelte` | Component              | @testing-library/svelte         | 🟡 High   |
| `src/components/FileChanges.svelte`            | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/content/Notification.svelte`              | Component              | @testing-library/svelte         | 🟡 High   |
| `src/content/UploadStatus.svelte`              | Component              | @testing-library/svelte         | 🟡 High   |

### UI Library Components (19 files)

| File Path                                                        | Missing Test Types     | Recommended Tools               | Priority  |
| ---------------------------------------------------------------- | ---------------------- | ------------------------------- | --------- |
| `src/lib/components/ui/alert/alert.svelte`                       | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/alert/alert-description.svelte`           | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/alert/alert-title.svelte`                 | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/badge/badge.svelte`                       | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/button/button.svelte`                     | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/card/card.svelte`                         | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/card/card-content.svelte`                 | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/card/card-description.svelte`             | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/card/card-footer.svelte`                  | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/card/card-header.svelte`                  | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/card/card-title.svelte`                   | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/dialog/ConfirmationDialog.svelte`         | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/ui/dialog/EnhancedConfirmationDialog.svelte` | Component, Integration | @testing-library/svelte, Vitest | 🟡 High   |
| `src/lib/components/ui/input/input.svelte`                       | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/label/label.svelte`                       | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/modal/Modal.svelte`                       | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/progress/Progress.svelte`                 | Component              | @testing-library/svelte         | 🟡 High   |
| `src/lib/components/ui/tabs/tabs-content.svelte`                 | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/tabs/tabs-list.svelte`                    | Component              | @testing-library/svelte         | 🟢 Medium |
| `src/lib/components/ui/tabs/tabs-trigger.svelte`                 | Component              | @testing-library/svelte         | 🟢 Medium |

---

## Services

**Total**: 22 files | **Tested**: 19 files | **Coverage**: 86.4%

**✅ Tested (19 files)**:

- `src/services/AnalyticsService.ts` - **2 test files** covering enhanced analytics and versioning
- `src/services/AuthenticationStrategyFactory.ts` - **1 test file, 41 tests** covering singleton pattern, strategy creation and caching, default strategy behavior, current strategy resolution, authentication method management, multiple auth method detection, cache management, token-specific strategies, edge cases, and integration scenarios
- `src/services/BoltProjectSyncService.ts` - **2 test files** covering direct method and general sync functionality
- `src/services/CacheService.ts` - **1 test file** covering cache operations
- `src/services/DownloadService.ts` - **1 test file** covering download functionality
- `src/services/FileService.ts` - **1 test file** covering file operations
- `src/services/GitHubApiClient.ts` - **1 test file** covering API client functionality
- `src/services/GitHubAppAuthenticationStrategy.ts` - **1 test file, 48 tests** covering type property, isConfigured, token caching, token expiration and automatic refresh, validateAuth, checkPermissions, refreshToken, clearAuth, getUserInfo (from config and API), needsRenewal, getMetadata, setUserToken, completeOAuth flow, generateOAuthUrl, and integration scenarios
- `src/services/GitHubAppService.ts` - **1 test file** covering critical business logic
- `src/services/IdleMonitorService.ts` - **1 test file** covering idle monitoring
- `src/services/PATAuthenticationStrategy.ts` - **1 test file, 54 tests** covering type property, constructor, token configuration, token retrieval and caching, authentication validation (classic/fine-grained tokens), permission checking, token refresh (unsupported), auth clearing, user info retrieval, renewal checking (always false), metadata retrieval, setToken method, integration scenarios, edge cases
- `src/services/RateLimitHandler.ts` - **1 test file** covering rate limit handling
- `src/services/ReadmeGeneratorService.ts` - **1 test file** covering README generation
- `src/services/RepoCloneService.ts` - **1 test file** covering repository cloning
- `src/services/RepositoryService.ts` - **1 test file** covering repository operations
- `src/services/SubscriptionService.ts` - **1 test file** covering subscription management
- `src/services/TokenService.ts` - **1 test file** covering token operations
- `src/services/UnifiedGitHubService.ts` - **3 test files** covering comprehensive, focused, and working scenarios
- `src/services/zipHandler.ts` - **4 test files** covering critical scenarios, edge cases, readme integration, and general functionality

**✅ Tested Library Services (1 file)**:

- `src/lib/services/ProjectSettingsMigrationService.ts` - **1 test file, 38 tests** covering migration detection (needsMigration), statistics gathering (getMigrationStats), bulk project migration (migrateProjectSettings with progress callbacks, stale cache handling, GitHub App auth, error handling), single project migration (migrateSingleProject), migration status reset (resetMigrationStatus), project migration validation (projectNeedsMigration), integration scenarios, and edge cases

**❌ Untested (3 files)**:

| File Path                                 | Missing Test Types | Recommended Tools | Priority |
| ----------------------------------------- | ------------------ | ----------------- | -------- |
| `src/services/FilePreviewService.ts`      | Unit               | Vitest            | 🟡 High  |
| `src/services/GitHubComparisonService.ts` | Unit, Integration  | Vitest            | 🟡 High  |
| `src/lib/services/GitHubCacheService.ts`  | Unit, Integration  | Vitest            | 🟡 High  |

---

## Stores

**Total**: 7 files | **Tested**: 2 files | **Coverage**: 28.6%

| File Path                           | Missing Test Types | Recommended Tools | Priority |
| ----------------------------------- | ------------------ | ----------------- | -------- |
| `src/lib/stores/fileChanges.ts`     | Unit               | Vitest            | 🟡 High  |
| `src/lib/stores/githubSettings.ts`  | Unit               | Vitest            | 🟡 High  |
| `src/lib/stores/issuesStore.ts`     | Unit               | Vitest            | 🟡 High  |
| `src/lib/stores/projectSettings.ts` | Unit               | Vitest            | � High   |
| `src/lib/stores/uiState.ts`         | Unit               | Vitest            | 🟡 High  |
| `src/lib/stores/uploadState.ts`     | Unit               | Vitest            | 🟡 High  |

✅ **Tested**:

- `src/lib/stores/pushStatistics.ts`
- `src/lib/stores/premiumStore.ts` - **1 test file, 34 tests** covering store initialization, derived stores (isAuthenticated, isPremium, premiumPlan, premiumFeatures), loadPremiumStatus (Chrome storage loading, missing status handling, backward compatibility, error handling), initialize (initial loading, storage listener setup, storage change updates, namespace/key filtering), getCurrentStatus (immediate status retrieval), refresh (force reload from storage), logout (background message, storage clearing, state reset, error handling), UI state combinations (signed out, free user, premium user, expiration), feature flags (partial/full access), and integration scenarios (authentication flow, upgrade flow, logout flow, rapid updates)

---

## Utilities

**Total**: 11 files | **Tested**: 5 files | **Coverage**: 45.5%

### Untested Utilities (7 files)

| File Path                             | Missing Test Types | Recommended Tools | Priority  |
| ------------------------------------- | ------------------ | ----------------- | --------- |
| `src/lib/utils.ts`                    | Unit               | Vitest            | 🟡 High   |
| `src/lib/utils/analytics.ts`          | Unit               | Vitest            | 🟡 High   |
| `src/lib/utils/debounce.ts`           | Unit               | Vitest            | 🟡 High   |
| `src/lib/utils/reassuringMessages.ts` | Unit               | Vitest            | 🟢 Medium |
| `src/lib/utils/upgradeModal.ts`       | Unit               | Vitest            | 🟡 High   |
| `src/lib/zip.ts`                      | Unit               | Vitest            | 🟡 High   |

### ✅ Tested Utilities (5 files)

- `src/lib/fileUtils.ts`
- `src/lib/utils/githubAppSync.ts` - **1 test file, 29 tests** covering sync operations, status checks, authentication switching, token refresh, app info retrieval, error handling, and integration scenarios
- `src/lib/utils/logStorage.ts`
- `src/lib/utils/logger.ts`
- `src/lib/utils/projectId.ts`
- `src/lib/utils/windowMode.ts`

---

## Infrastructure

**Total**: 4 files | **Tested**: 3 files | **Coverage**: 75%

### Untested Infrastructure (1 file)

| File Path                                       | Missing Test Types | Recommended Tools | Priority |
| ----------------------------------------------- | ------------------ | ----------------- | -------- |
| `src/content/infrastructure/ActivityMonitor.ts` | Unit, Integration  | Vitest            | 🟡 High  |

### ✅ Tested Infrastructure (3 files)

- `src/content/infrastructure/ComponentLifecycleManager.ts`
- `src/content/infrastructure/DOMObserver.ts`
- `src/content/infrastructure/UIElementFactory.ts`

---

## Content Services

**Total**: 6 files | **Tested**: 4 files | **Coverage**: 66.7%

### Untested Content Services (2 files)

| File Path                                       | Missing Test Types | Recommended Tools | Priority |
| ----------------------------------------------- | ------------------ | ----------------- | -------- |
| `src/content/services/CommitTemplateService.ts` | Unit, Integration  | Vitest            | 🟡 High  |
| `src/content/services/PushReminderService.ts`   | Unit, Integration  | Vitest            | � High   |

### ✅ Tested Content Services (4 files)

- `src/content/services/OperationStateManager.ts` - **1 test file, 66 tests** covering singleton pattern, operation lifecycle (start, complete, fail), operation types (push, import, clone, sync, comparison, auth, API), operation queries (hasOngoingOperations, getOngoingOperations, getOngoingOperationsByType, isOperationOngoing), operation timeouts (auto-completion, timeout clearing), event listeners (operationStarted, operationCompleted, operationFailed), cross-context storage synchronization (save/load state, error handling), storage sync with timeouts, debug information, cleanup, clear all operations, edge cases (duplicate IDs, empty arrays, undefined values, rapid cycles, concurrent operations), context detection, and integration scenarios (push workflow, failed import, multiple simultaneous operations, cross-context sync)
- `src/content/services/PremiumService.ts` (2 test files)
- `src/content/services/SupabaseAuthService.ts`
- `src/content/services/UIStateManager.ts`

---

## Background

**Total**: 6 files | **Tested**: 5 files | **Coverage**: 83.3%

### Untested Background Files (1 file)

| File Path                 | Missing Test Types | Recommended Tools  | Priority |
| ------------------------- | ------------------ | ------------------ | -------- |
| `src/background/index.ts` | Integration, E2E   | Vitest, Playwright | 🟡 High  |

### ✅ Tested Background Files (5 files)

- `src/background/BackgroundService.ts` (8 test files)
- `src/background/StateManager.ts` - **1 test file, 37 tests** covering singleton pattern, getGitHubSettings delegation to SettingsService, getProjectId delegation and retrieval, setProjectId delegation and persistence, error propagation from SettingsService, integration scenarios (settings workflow, project switching, concurrent calls, rapid changes, onboarding flow), edge cases (null values, special characters, long IDs, concurrent operations, missing fields), singleton integrity through errors, and type safety validation
- `src/background/TempRepoManager.ts` (3 test files)
- `src/background/UsageTracker.ts`
- `src/background/WindowManager.ts`

---

## Type Definitions

**Total**: 13 files | **Tested**: 0 files | **Coverage**: 0%

| File Path                                            | Missing Test Types     | Recommended Tools | Priority |
| ---------------------------------------------------- | ---------------------- | ----------------- | -------- |
| `src/content/types/HandlerInterfaces.ts`             | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/content/types/InfrastructureInterfaces.ts`      | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/content/types/ManagerInterfaces.ts`             | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/content/types/UITypes.ts`                       | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/lib/types.ts`                                   | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/popup/types.ts`                                 | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/services/interfaces/IAuthenticationStrategy.ts` | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/ICacheService.ts`           | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/IFileService.ts`            | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/IGitHubApiClient.ts`        | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/IIdleMonitorService.ts`     | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/IRepoCloneService.ts`       | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/IRepositoryService.ts`      | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/interfaces/ITokenService.ts`           | N/A (Interface)        | -                 | 🟢 Low   |
| `src/services/types/authentication.ts`               | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/services/types/common.ts`                       | N/A (Type definitions) | -                 | 🟢 Low   |
| `src/services/types/repository.ts`                   | N/A (Type definitions) | -                 | 🟢 Low   |

**Note**: Type definitions and interfaces typically don't need tests as they have no runtime behavior. However, they should be validated through tests of the code that uses them.

---

## Constants

**Total**: 5 files | **Tested**: 0 files | **Coverage**: 0%

| File Path                              | Missing Test Types | Recommended Tools | Priority |
| -------------------------------------- | ------------------ | ----------------- | -------- |
| `src/lib/constants.ts`                 | N/A (Constants)    | -                 | 🟢 Low   |
| `src/lib/constants/index.ts`           | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/constants/premiumFeatures.ts` | N/A (Constants)    | -                 | 🟢 Low   |
| `src/lib/constants/supabase.ts`        | N/A (Constants)    | -                 | 🟢 Low   |
| `src/lib/constants/whatsNewContent.ts` | N/A (Constants)    | -                 | 🟢 Low   |

**Note**: Constants typically don't need tests. However, complex computed constants or constants with logic should be tested.

---

## Other Files

**Total**: 46 files | **Coverage varies by subcategory**

### Entry Points and Index Files (4 files)

| File Path                 | Missing Test Types | Recommended Tools  | Priority  |
| ------------------------- | ------------------ | ------------------ | --------- |
| `src/content/index.ts`    | Integration, E2E   | Vitest, Playwright | 🟡 High   |
| `src/popup/main.ts`       | Integration, E2E   | Vitest, Playwright | 🟡 High   |
| `src/pages/logs.ts`       | Integration        | Vitest             | 🟢 Medium |
| `src/lib/stores/index.ts` | N/A (Re-exports)   | -                  | 🟢 Low    |

### UI Component Index Files (9 files)

| File Path                                 | Missing Test Types | Recommended Tools | Priority |
| ----------------------------------------- | ------------------ | ----------------- | -------- |
| `src/lib/components/ui/alert/index.ts`    | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/badge/index.ts`    | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/button/index.ts`   | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/card/index.ts`     | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/dialog/index.ts`   | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/input/index.ts`    | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/label/index.ts`    | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/progress/index.ts` | N/A (Re-exports)   | -                 | 🟢 Low   |
| `src/lib/components/ui/tabs/index.ts`     | N/A (Re-exports)   | -                 | 🟢 Low   |

### Shared Utilities (2 files)

| File Path                             | Missing Test Types | Recommended Tools | Priority |
| ------------------------------------- | ------------------ | ----------------- | -------- |
| `src/lib/Queue.ts`                    | Unit               | Vitest            | 🟡 High  |
| `src/lib/common.ts`                   | Unit               | Vitest            | 🟡 High  |
| `src/lib/services/chromeMessaging.ts` | Unit, Integration  | Vitest            | 🟡 High  |

---

## Priority Recommendations

### 🔴 Critical Priority (10 items)

Files that are essential to core functionality and should be tested immediately:

1. **Authentication & Security**

   - ✅ ~~`src/services/AuthenticationStrategyFactory.ts`~~ (Completed - 1 test file, 41 tests)
   - ✅ ~~`src/services/GitHubAppAuthenticationStrategy.ts`~~ (Completed - 1 test file, 48 tests)
   - ✅ ~~`src/services/PATAuthenticationStrategy.ts`~~ (Completed - 1 test file, 54 tests)

2. **Core UI Components**

   - ✅ ~~`src/popup/App.svelte`~~ (Completed - 10 test files, 189 tests)
   - ✅ ~~`src/popup/components/OnboardingView.svelte`~~ (Completed - 1 test file, 14 tests)
   - ✅ ~~`src/lib/components/GitHubSettings.svelte`~~ (Completed - 2 test files, 103 tests)
   - ✅ ~~`src/lib/components/OnboardingSetup.svelte`~~ (Completed - 1 test file, 43 tests)
   - ✅ ~~`src/lib/components/RepoSettings.svelte`~~ (Completed - 2 test files, 110 tests)

3. **Critical Services**

   - ✅ ~~`src/background/StateManager.ts`~~ (Completed - 1 test file, 37 tests)
   - ✅ ~~`src/content/services/OperationStateManager.ts`~~ (Completed - 1 test file, 66 tests)

4. **Critical Stores**

   - ✅ ~~`src/lib/stores/premiumStore.ts`~~ (Completed - 1 test file, 34 tests)

5. **Critical Utils**
   - ✅ ~~`src/lib/utils/githubAppSync.ts`~~ (Completed - 1 test file, 29 tests)

### 🟡 High Priority (50+ items)

All other services, stores, main UI components, and utilities

### 🟢 Medium/Low Priority

- Simple presentational components
- Type definitions (N/A for testing)
- Constants (N/A for testing)
- Re-export index files (N/A for testing)

---

## Testing Strategy Recommendations

### Phase 1: Foundation (Week 1-2)

1. Install missing testing tools:

   ```bash
   pnpm add -D @testing-library/svelte @playwright/test
   pnpm exec playwright install
   ```

2. Set up E2E test infrastructure:

   - Configure Playwright
   - Write first E2E test for main flow
   - Set up CI/CD for E2E tests

3. ✅ Test critical authentication services (3/3 files completed)
   - ✅ AuthenticationStrategyFactory.ts
   - ✅ GitHubAppAuthenticationStrategy.ts
   - ✅ PATAuthenticationStrategy.ts

### Phase 2: Core Components (Week 3-4)

1. ✅ ~~Test main app component (App.svelte)~~ - **Completed!** 10 test files, 189 tests
2. ✅ ~~Test BranchSelectionModal component~~ - **Completed!** 1 test file, 19 tests
3. ✅ ~~Test FeedbackModal component~~ - **Completed!** 1 test file, 19 tests
4. ✅ ~~Test OnboardingView component~~ - **Completed!** 1 test file, 14 tests
5. ✅ ~~Test GitHubSettings component~~ - **Completed!** 2 test files, 103 tests
6. ✅ ~~Test OnboardingSetup component~~ - **Completed!** 1 test file, 43 tests
7. ✅ ~~Test RepoSettings component~~ - **Completed!** 2 test files, 110 tests
8. ✅ ~~Test critical stores (premiumStore)~~ - **Completed!** 1 test file, 34 tests
9. ✅ ~~Test OperationStateManager service~~ - **Completed!** 1 test file, 66 tests
10. ✅ ~~Test StateManager service~~ - **Completed!** 1 test file, 37 tests

### Phase 3: UI Library (Week 5-6)

1. Test all UI library components (19 files)
2. Test popup components (13 files)
3. Test lib components (29 files)

### Phase 4: Complete Coverage (Week 7-8)

1. Test remaining services (8 files)
2. Test remaining stores (7 files)
3. Test remaining utilities (7 files)
4. Add integration tests for complex workflows

### Phase 5: E2E Coverage (Week 9-10)

1. Write comprehensive E2E tests
2. Test extension lifecycle
3. Test GitHub integration flows
4. Test edge cases and error scenarios

---

## Success Metrics

### Coverage Targets

- [ ] Unit test coverage: 80%+
- [ ] Component test coverage: 70%+
- [ ] Integration test coverage: 60%+
- [ ] E2E critical path coverage: 100%

### File Coverage Targets

- [ ] Services: 100% (currently 86.4%)
- [x] **Stores: 28.6% (2 of 7 files) - premiumStore.ts and pushStatistics.ts tested**
- [ ] Utilities: 100% (currently 45.5%)
- [x] **Main App Component: 100% (App.svelte - 189 tests)**
- [x] **BranchSelectionModal Component: 100% (19 tests)**
- [x] **FeedbackModal Component: 100% (19 tests)**
- [x] **OnboardingView Component: 100% (14 tests)**
- [x] **GitHubSettings Component: 100% (103 tests across 2 files)**
- [x] **OnboardingSetup Component: 100% (43 tests)**
- [x] **RepoSettings Component: 100% (110 tests across 2 files)**
- [x] **PATAuthenticationStrategy: 100% (54 tests)**
- [x] **PremiumStore: 100% (34 tests)**
- [x] **StateManager: 100% (37 tests)**
- [ ] Other Components: 70%+ (currently 11.5% - 7 of 61 files)
- [ ] Infrastructure: 100% (currently 75%)

### Quality Metrics

- [ ] All tests passing
- [ ] No flaky tests
- [ ] Test execution time < 5 minutes
- [ ] E2E test execution time < 10 minutes

---

## Notes

### File Verification Status

✅ All file paths in this document have been verified to exist in the repository as of 2025-10-07.

### Test Type Definitions

- **Unit**: Tests individual functions/classes in isolation
- **Component**: Tests Svelte component rendering and user interactions
- **Integration**: Tests multiple units working together
- **E2E**: Tests complete user workflows in browser
- **N/A**: Files that don't require tests (types, constants, re-exports)

### Tools Reference

- **Vitest**: Unit and integration testing framework
- **@testing-library/svelte**: Svelte component testing utilities
- **@testing-library/jest-dom**: DOM assertion library
- **Playwright**: E2E browser automation testing
- **@vitest/coverage-v8**: Code coverage reporting
