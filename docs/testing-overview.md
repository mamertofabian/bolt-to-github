# Testing Overview

> **📘 For Component Testing:** See [component-testing-rules.md](./component-testing-rules.md)  
> **📘 For Unit Testing Rules:** See [unit-testing-rules.md](./unit-testing-rules.md)  
> **📘 Note**: This document tracks BOTH unit tests (TS/JS) and component tests (Svelte).

**Last Updated**: 2025-10-09

---

## Overall Test Status

| Metric             | Count | Percentage |
| ------------------ | ----- | ---------- |
| Total Source Files | 181   | 100%       |
| TS/JS Files        | 120   | 66.3%      |
| Svelte Components  | 61    | 33.7%      |

---

## Unit Test Coverage (TS/JS Files)

| Metric                    | Count  | Percentage |
| ------------------------- | ------ | ---------- |
| Total TS/JS Files         | 120    | 100%       |
| Exempt (types/constants)  | 35     | 29.2%      |
| Testable TS/JS Files      | 85     | 70.8%      |
| **Files with Unit Tests** | **85** | **100%**   |
| Files needing tests       | 0      | 0%         |
| **Target Coverage**       | -      | **80%+**   |

---

## Component Test Coverage (Svelte Components)

| Metric                    | Count | Percentage |
| ------------------------- | ----- | ---------- |
| Total Svelte Components   | 61    | 100%       |
| **Components with Tests** | **8** | **13.1%**  |
| Components needing tests  | 53    | 86.9%      |
| **Target Coverage**       | -     | **70%+**   |

---

## Unit Test Coverage by Category (TS/JS Files Only)

| Category             | Tested | Total | Coverage | Status      |
| -------------------- | ------ | ----- | -------- | ----------- |
| **Services**         | 23     | 23    | 100%     | ✅ Complete |
| **Background**       | 6      | 6     | 100%     | ✅ Complete |
| **Stores**           | 8      | 8     | 100%     | ✅ Complete |
| **Entry Points**     | 3      | 3     | 100%     | ✅ Complete |
| **Content Handlers** | 2      | 2     | 100%     | ✅ Complete |
| **Content Managers** | 5      | 5     | 100%     | ✅ Complete |
| **Infrastructure**   | 4      | 4     | 100%     | ✅ Complete |
| **Utilities**        | 14     | 14    | 100%     | ✅ Complete |
| **Content Services** | 6      | 6     | 100%     | ✅ Complete |
| **Lib Services**     | 6      | 6     | 100%     | ✅ Complete |

---

## Component Test Status (Svelte Files)

See [component-testing-gaps.md](./component-testing-gaps.md) for detailed component testing status.

**Summary:**

- **Total Components**: 61
- **Components with Tests**: 8 (13.1%)
- **Components Needing Tests**: 53 (86.9%)
- **Priority**: 🔴 High - Component testing is the main gap

---

## Remaining Unit Test Gaps

### Files Needing Unit Tests (0 files)

See [unit-testing-gaps.md](./unit-testing-gaps.md) for detailed breakdown.

**🎉 Unit testing is 100% complete! All testable TS/JS files now have comprehensive unit tests.**

---

## Testing Commands

```bash
pnpm test                # Run all tests
pnpm test:watch          # Watch mode
pnpm test:ui             # UI mode
pnpm test:ci             # With coverage
pnpm test:failed-files   # Show failures
```

## Success Metrics

### Unit Test Coverage Targets (TS/JS Only)

| Category             | Current | Target |
| -------------------- | ------- | ------ |
| **Services**         | ✅ 100% | 100%   |
| **Background**       | ✅ 100% | 100%   |
| **Stores**           | ✅ 100% | 100%   |
| **Entry Points**     | ✅ 100% | 100%   |
| **Infrastructure**   | ✅ 100% | 100%   |
| **Utilities**        | ✅ 100% | 90%    |
| **Content Services** | ✅ 100% | 100%   |
| **Lib Services**     | ✅ 100% | 100%   |
| **Overall TS/JS**    | ✅ 100% | 80%+   |

### Component Test Coverage Targets (Svelte Only)

| Category             | Current  | Target |
| -------------------- | -------- | ------ |
| **Popup Components** | ⚠️ 38.5% | 100%   |
| **Lib Components**   | ⚠️ 10.3% | 70%+   |
| **UI Components**    | ❌ 0%    | 60%+   |
| **Overall Svelte**   | ❌ 13.1% | 70%+   |

### Quality Goals

- ✅ All tests passing
- ✅ No flaky tests
- ✅ Test execution < 5 minutes
- 🎯 Follow [unit-testing-rules.md](./unit-testing-rules.md)
