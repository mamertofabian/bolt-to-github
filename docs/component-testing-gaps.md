# Component Testing Gaps - Detailed Analysis

> **📘 Testing Guidelines:** See [component-testing-rules.md](./component-testing-rules.md) for complete Svelte component testing guidelines.

**Last Updated**: 2025-10-08  
**Total Untested Component Files**: 53 Svelte components

This document lists ALL Svelte components that lack component tests, organized by category.

---

## Table of Contents

1. [Popup Components (8 files)](#popup-components)
2. [Lib Components (26 files)](#lib-components)
3. [UI Library Components (19 files)](#ui-library-components)

---

## Popup Components

**Total**: 13 files | **Tested**: 5 files | **Coverage**: 38.5%

### ✅ Tested (5 files)

- `src/popup/App.svelte` (10 test files, 189 tests)
- `src/popup/components/BranchSelectionModal.svelte` (19 tests)
- `src/popup/components/FeedbackModal.svelte` (19 tests)
- `src/popup/components/FileChangesModal.svelte` (48 tests)
- `src/popup/components/OnboardingView.svelte` (14 tests)

### ❌ Untested (8 files)

| File Path                                          | Missing Test Types     | Recommended Tools                   | Priority  |
| -------------------------------------------------- | ---------------------- | ----------------------------------- | --------- |
| `src/popup/components/HelpTabContent.svelte`       | Component              | @testing-library/svelte             | 🟡 Medium |
| `src/popup/components/HomeTabContent.svelte`       | Component, E2E         | @testing-library/svelte, Playwright | 🔴 High   |
| `src/popup/components/PremiumStatus.svelte`        | Component              | @testing-library/svelte             | 🔴 High   |
| `src/popup/components/PushReminderSection.svelte`  | Component              | @testing-library/svelte             | 🟡 Medium |
| `src/popup/components/PushReminderSettings.svelte` | Component, Integration | @testing-library/svelte, Vitest     | 🔴 High   |
| `src/popup/components/SettingsTabContent.svelte`   | Component, Integration | @testing-library/svelte, Vitest     | 🔴 High   |
| `src/popup/components/TabsView.svelte`             | Component              | @testing-library/svelte             | 🔴 High   |
| `src/popup/components/TempRepoModal.svelte`        | Component, Integration | @testing-library/svelte, Vitest     | 🔴 High   |
| `src/popup/components/UpgradeModal.svelte`         | Component              | @testing-library/svelte             | 🔴 High   |

---

## Lib Components

**Total**: 29 files | **Tested**: 3 files | **Coverage**: 10.3%

### ✅ Tested (3 files)

- `src/lib/components/GitHubSettings.svelte` (103 tests)
- `src/lib/components/OnboardingSetup.svelte` (43 tests)
- `src/lib/components/RepoSettings.svelte` (110 tests)

### ❌ Untested (26 files)

| File Path                                      | Missing Test Types     | Recommended Tools               | Priority  |
| ---------------------------------------------- | ---------------------- | ------------------------------- | --------- |
| `src/lib/components/DiffViewer.svelte`         | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/FileChanges.svelte`        | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/Footer.svelte`             | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/Header.svelte`             | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/Help.svelte`               | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/IssueCard.svelte`          | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/IssueManager.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/LogViewer.svelte`          | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/NewIssueForm.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/NewsletterModal.svelte`    | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/NewsletterSection.svelte`  | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ProjectGuide.svelte`       | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ProjectStatus.svelte`      | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ProjectsList.svelte`       | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/ProjectsListGuide.svelte`  | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/QuickIssueForm.svelte`     | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/SocialLinks.svelte`        | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/StatusAlert.svelte`        | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/SuccessToast.svelte`       | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/WelcomeHero.svelte`        | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/WhatsNewModal.svelte`      | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/AnalyticsToggle.svelte` | Component              | @testing-library/svelte         | 🔴 High   |
| `src/content/Notification.svelte`              | Component              | @testing-library/svelte         | 🔴 High   |
| `src/content/UploadStatus.svelte`              | Component              | @testing-library/svelte         | 🔴 High   |

---

## UI Library Components

**Total**: 19 files | **Tested**: 0 files | **Coverage**: 0%

### ❌ Untested (19 files)

| File Path                                                        | Missing Test Types     | Recommended Tools               | Priority  |
| ---------------------------------------------------------------- | ---------------------- | ------------------------------- | --------- |
| `src/lib/components/ui/alert/alert.svelte`                       | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/alert/alert-description.svelte`           | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/alert/alert-title.svelte`                 | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/badge/badge.svelte`                       | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/button/button.svelte`                     | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/card/card.svelte`                         | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/card/card-content.svelte`                 | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/card/card-description.svelte`             | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/card/card-footer.svelte`                  | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/card/card-header.svelte`                  | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/card/card-title.svelte`                   | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/dialog/ConfirmationDialog.svelte`         | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/ui/dialog/EnhancedConfirmationDialog.svelte` | Component, Integration | @testing-library/svelte, Vitest | 🔴 High   |
| `src/lib/components/ui/input/input.svelte`                       | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/label/label.svelte`                       | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/modal/Modal.svelte`                       | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/progress/Progress.svelte`                 | Component              | @testing-library/svelte         | 🔴 High   |
| `src/lib/components/ui/tabs/tabs-content.svelte`                 | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/tabs/tabs-list.svelte`                    | Component              | @testing-library/svelte         | 🟡 Medium |
| `src/lib/components/ui/tabs/tabs-trigger.svelte`                 | Component              | @testing-library/svelte         | 🟡 Medium |

---

## Priority Recommendations

### 🔴 Critical Priority (28 files)

Components that are essential to core functionality and should be tested immediately:

#### Popup Components (6 files)

- `src/popup/components/HomeTabContent.svelte`
- `src/popup/components/PremiumStatus.svelte`
- `src/popup/components/PushReminderSettings.svelte`
- `src/popup/components/SettingsTabContent.svelte`
- `src/popup/components/TabsView.svelte`
- `src/popup/components/TempRepoModal.svelte`
- `src/popup/components/UpgradeModal.svelte`

#### Lib Components (10 files)

- `src/lib/components/DiffViewer.svelte`
- `src/lib/components/FileChanges.svelte`
- `src/lib/components/IssueCard.svelte`
- `src/lib/components/IssueManager.svelte`
- `src/lib/components/LogViewer.svelte`
- `src/lib/components/NewIssueForm.svelte`
- `src/lib/components/ProjectStatus.svelte`
- `src/lib/components/ProjectsList.svelte`
- `src/lib/components/QuickIssueForm.svelte`
- `src/lib/components/StatusAlert.svelte`
- `src/lib/components/WhatsNewModal.svelte`
- `src/lib/components/ui/AnalyticsToggle.svelte`

#### Content Components (2 files)

- `src/content/Notification.svelte`
- `src/content/UploadStatus.svelte`

#### UI Library Components (8 files)

- `src/lib/components/ui/alert/alert.svelte`
- `src/lib/components/ui/button/button.svelte`
- `src/lib/components/ui/card/card.svelte`
- `src/lib/components/ui/dialog/ConfirmationDialog.svelte`
- `src/lib/components/ui/dialog/EnhancedConfirmationDialog.svelte`
- `src/lib/components/ui/input/input.svelte`
- `src/lib/components/ui/modal/Modal.svelte`
- `src/lib/components/ui/progress/Progress.svelte`

### 🟡 Medium Priority (25 files)

Presentational components and supporting UI elements:

#### Popup Components (2 files)

- `src/popup/components/HelpTabContent.svelte`
- `src/popup/components/PushReminderSection.svelte`

#### Lib Components (14 files)

- `src/lib/components/Footer.svelte`
- `src/lib/components/Header.svelte`
- `src/lib/components/Help.svelte`
- `src/lib/components/NewsletterModal.svelte`
- `src/lib/components/NewsletterSection.svelte`
- `src/lib/components/ProjectGuide.svelte`
- `src/lib/components/ProjectsListGuide.svelte`
- `src/lib/components/SocialLinks.svelte`
- `src/lib/components/SuccessToast.svelte`
- `src/lib/components/WelcomeHero.svelte`

#### UI Library Components (9 files)

- `src/lib/components/ui/alert/alert-description.svelte`
- `src/lib/components/ui/alert/alert-title.svelte`
- `src/lib/components/ui/badge/badge.svelte`
- `src/lib/components/ui/card/card-content.svelte`
- `src/lib/components/ui/card/card-description.svelte`
- `src/lib/components/ui/card/card-footer.svelte`
- `src/lib/components/ui/card/card-header.svelte`
- `src/lib/components/ui/card/card-title.svelte`
- `src/lib/components/ui/label/label.svelte`
- `src/lib/components/ui/tabs/tabs-content.svelte`
- `src/lib/components/ui/tabs/tabs-list.svelte`
- `src/lib/components/ui/tabs/tabs-trigger.svelte`

---

## Testing Strategy

### Phase 1: Core Popup Components (Week 1-2)

1. **Test HomeTabContent** - Main user interface
2. **Test TabsView** - Navigation component
3. **Test SettingsTabContent** - Settings management
4. **Test PremiumStatus** - Premium feature display
5. **Test TempRepoModal** - Temporary repository functionality
6. **Test UpgradeModal** - Upgrade prompts

### Phase 2: Interactive Components (Week 3-4)

1. **Test FileChanges** - File change display
2. **Test DiffViewer** - Diff visualization
3. **Test IssueManager** - Issue management
4. **Test NewIssueForm** - Issue creation
5. **Test QuickIssueForm** - Quick issue creation
6. **Test ProjectsList** - Project list display

### Phase 3: UI Library Components (Week 5-6)

1. **Test core UI components** (alert, button, card, input, modal)
2. **Test dialog components** (ConfirmationDialog, EnhancedConfirmationDialog)
3. **Test progress and feedback components**

### Phase 4: Supporting Components (Week 7-8)

1. **Test content script components** (Notification, UploadStatus)
2. **Test presentational components** (Footer, Header, Help, etc.)
3. **Test remaining UI library components** (badge, label, tabs, etc.)

---

## Success Metrics

### Coverage Targets

- **Popup Components**: 100% (currently 38.5% - 5/13 files)
- **Lib Components**: 70%+ (currently 10.3% - 3/29 files)
- **UI Library Components**: 60%+ (currently 0% - 0/19 files)
- **Overall Component Coverage**: 70%+ (currently 13.1% - 8/61 files)

### Quality Metrics

- All component tests follow [component-testing-rules.md](./component-testing-rules.md)
- Tests use @testing-library/svelte correctly
- Tests from user perspective (no implementation details)
- Mocks only external services (not child components)
- All tests passing with no flaky tests

---

## Notes

### Test Type Definitions

- **Component**: Tests Svelte component rendering and user interactions
- **Integration**: Tests component integration with services/stores
- **E2E**: Tests complete user workflows in browser

### Key Principles

1. **Test from user's perspective** - What users see and interact with
2. **Mock external dependencies** - Chrome APIs, services, network calls
3. **Don't mock child components** - Let them render naturally
4. **Use accessible queries** - getByRole, getByLabelText, getByText
5. **Simulate realistic interactions** - Use @testing-library/user-event

### Related Documentation

- [component-testing-rules.md](./component-testing-rules.md) - Testing guidelines
- [component-tests-requiring-review.md](./component-tests-requiring-review.md) - Tests needing fixes
- [unit-testing-gaps.md](./unit-testing-gaps.md) - Unit test gaps
