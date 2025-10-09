# Component Test Files Requiring Review

> **📘 Testing Guidelines:** See [component-testing-rules.md](./component-testing-rules.md) for complete Svelte component testing guidelines.

**Total Component Test Files:** 11 files with violations (1 completed)  
**Review Status:** ◑ In Progress (1/11 = 9%)

---

## 🔴 Critical Priority (9 files - Multiple Violations)

### App Component Tests

- [ ] `src/popup/__tests__/App.component.test.ts` - **77 mocks, 10 child components mocked**

  - Excessive child component mocking (FileChangesModal, TempRepoModal, PushReminderSettings, UpgradeModal, FeedbackModal, NewsletterModal, SuccessToast, IssueManager, TabsView, OnboardingView)
  - Fix: Let child components render naturally, only mock external services

- [ ] `src/popup/__tests__/App.svelte/App.cleanup.test.ts` - **38 mocks, implementation details**

  - Excessive mocking, testing implementation details
  - Testing ratio: 24:7 (24 describe/it, 7 expects)

- [ ] `src/popup/__tests__/App.svelte/App.initialization.test.ts` - **34 mocks, implementation details, non-deterministic time**

  - Fix: Use vi.useFakeTimers() for time-based tests

- [ ] `src/popup/__tests__/App.svelte/App.window-mode.test.ts` - **29 mocks**

  - Testing ratio: 25:9
  - May be acceptable if mocks are for external services only

- [ ] `src/popup/__tests__/App.svelte/App.temp-repo.test.ts` - **33 mocks, implementation details, non-deterministic time**

  - Testing ratio: 22:4

- [ ] `src/popup/__tests__/App.svelte/App.modal-states.test.ts` - **Non-deterministic time**

  - Testing ratio: 8:0
  - Fix: Use vi.useFakeTimers()

- [ ] `src/popup/__tests__/App.svelte/App.message-handlers.test.ts` - **32 mocks**

  - Testing ratio: 18:2
  - May be acceptable if mocks are for Chrome messaging only

- [ ] `src/popup/__tests__/App.svelte/App.premium-features.test.ts` - **34 mocks**

  - Testing ratio: 10:0

- [ ] `src/popup/__tests__/App.svelte/App.user-interactions.test.ts` - **40 mocks**

  - Testing ratio: 23:19

- [ ] `src/popup/__tests__/App.svelte/App.settings.test.ts` - **28 mocks, implementation details**

- [ ] `src/popup/__tests__/App.svelte/App.popup-context.test.ts` - **Implementation details**
  - Testing implementation details instead of user-visible behavior

---

## ⚠️ Needs Review (2 files)

- [ ] `src/popup/components/__tests__/BranchSelectionModal.component.test.ts` - **44 mocks**

  - Most mocks are for Chrome APIs and GitHub service (acceptable)
  - May need minor adjustments

- [ ] `src/lib/components/__tests__/GitHubSettings.component.test.ts` - **34 mocks**
  - Verify mocks are for external services only

---

## ✅ Approved (1 file)

- ~~`src/popup/components/__tests__/FeedbackModal.component.test.ts`~~ - **APPROVED** ✅
  - Uses @testing-library/svelte correctly
  - Tests from user perspective
  - Mocks only external services
  - Uses accessible queries and userEvent
