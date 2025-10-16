# Svelte Component Testing Rules

**Testing Library:** `@testing-library/svelte` + `@testing-library/user-event`  
**Test Runner:** Vitest with jsdom environment  
**Philosophy:** Test components the way users interact with them

## Core Principle

> **Components are User Interfaces.** The DOM, props, events, and slots ARE the public API. Testing how users see and interact with components IS testing behavior, NOT implementation details.

## Essential Rules

### 1. Test from the user's perspective

- Use accessible queries: `getByRole`, `getByLabelText`, `getByText`
- Avoid querying by test IDs unless necessary for dynamic content
- Tests should work even if the underlying Svelte code is refactored

```typescript
// ✅ GOOD - User perspective
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com');

// ❌ BAD - Implementation details
expect(component.showSubmitButton).toBe(true);
expect(container.querySelector('.submit-btn')).toBeTruthy();
```

### 2. Mock external dependencies, not UI elements

- Mock: Chrome APIs, external services, storage, network calls
- Don't mock: Child components (unless they have complex external deps), UI libraries, DOM APIs

```typescript
// ✅ GOOD - Mock external services
vi.mock('../../../services/GitHubApiClient', () => ({
  GitHubApiClient: class {
    async createRepository() {
      return { id: 1 };
    }
  },
}));

// ❌ BAD - Mocking UI components unnecessarily
vi.mock('../ChildComponent.svelte', () => ({
  default: () => '<div>Mocked</div>',
}));
```

### 3. Simulate realistic user interactions

- Use `@testing-library/user-event` for interactions (not `fireEvent`)
- Wait for async updates with `waitFor` or `findBy*` queries
- Test complete user flows, not isolated events

```typescript
// ✅ GOOD - Realistic user interaction
const user = userEvent.setup();
await user.type(screen.getByLabelText(/message/i), 'Hello world');
await user.click(screen.getByRole('button', { name: /send/i }));
await waitFor(() => {
  expect(screen.getByText(/message sent/i)).toBeInTheDocument();
});
```

### 4. Test props behavior and events correctly

- Verify component responds appropriately to prop changes
- Test emitted events using component event listeners

```typescript
// ✅ GOOD - Test prop effects on rendering
const { rerender } = render(Modal, { props: { show: false } });
expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

await rerender({ show: true });
expect(screen.getByRole('dialog')).toBeInTheDocument();

// ✅ GOOD - Test event emission
const { component } = render(FeedbackModal, { props: { show: true } });
const closeHandler = vi.fn();
component.$on('close', closeHandler);
await user.click(screen.getByRole('button', { name: /cancel/i }));
expect(closeHandler).toHaveBeenCalled();
```

### 5. Avoid testing implementation details

**Don't Test:**

- Internal state variable names (`component.isLoading`)
- Lifecycle methods (`onMount`, `onDestroy` calls)
- Private helper functions within components
- Exact DOM structure (specific div nesting) unless semantically important
- CSS classes (unless they represent functional state)

**Do Test:**

- Rendered content (what users see)
- Conditional rendering (element appears/disappears)
- Disabled/enabled states
- Validation feedback
- Accessibility attributes

### 6. Test accessibility and semantic HTML

- Verify proper ARIA labels, roles, and attributes
- Test keyboard navigation where applicable
- Ensure form elements have proper labels

```typescript
// ✅ GOOD - Accessibility testing
expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
expect(screen.getByLabelText(/email address/i)).toBeRequired();
```

### 7. Use appropriate test environment setup

- Set `@vitest-environment jsdom` for component tests
- Mock browser APIs consistently in `beforeEach`
- Clean up after each test with `afterEach`

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

beforeEach(() => {
  vi.clearAllMocks();
  // Mock chrome APIs
  Object.defineProperty(window, 'chrome', {
    value: {
      runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }) },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
    },
    writable: true,
    configurable: true,
  });
});
```

## Query Priority

Use queries in this order (from most to least preferred):

1. **Accessible to everyone:**

   - `getByRole` (buttons, textboxes, dialogs, etc.)
   - `getByLabelText` (form fields)
   - `getByPlaceholderText` (if label is not available)
   - `getByText` (non-interactive elements)

2. **Semantic queries:**

   - `getByAltText` (images)
   - `getByTitle` (when title is visible to users)

3. **Test IDs (last resort):**
   - `getByTestId` (only for dynamic content where other queries don't work)

## Common Pitfalls to Avoid

❌ **Don't:**

- Access component internal state (`component.someVariable`)
- Test lifecycle method calls (`expect(onMount).toHaveBeenCalled()`)
- Query by CSS classes for functional testing
- Mock child components excessively
- Use `fireEvent` instead of `userEvent`
- Test private component functions

✅ **Do:**

- Test rendered output and user-visible changes
- Use semantic queries (`getByRole`, `getByLabelText`)
- Simulate realistic user interactions
- Mock external services and APIs
- Test accessibility
- Use `waitFor` for async updates
- Test component behavior through props and events

## When to Use Integration Tests Instead

Consider writing integration tests (not component tests) when:

- Testing multiple components working together
- Testing full user flows across pages/views
- Testing real API calls (in a test environment)
- Testing state management across components
- Testing routing and navigation

Component tests should focus on **a single component's behavior in isolation** with mocked external dependencies.

## Summary

Svelte component tests are fundamentally different from unit tests for classes and functions. The key is to **test like a user**: focus on what's rendered, how users interact with it, and what outcomes they experience. Mock external dependencies, but let your UI render naturally. If you find yourself accessing internal state or mocking many child components, you're likely testing implementation details rather than behavior.
