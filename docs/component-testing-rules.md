# Rules for Effective Svelte Component Testing

**Testing Library:** `@testing-library/svelte` + `@testing-library/user-event`  
**Test Runner:** Vitest with jsdom environment  
**Philosophy:** Test components the way users interact with them

---

## Core Principle

> **Components are User Interfaces.** The DOM, props, events, and slots ARE the public API. Testing how users see and interact with components IS testing behavior, NOT implementation details.

---

## The Rules

### 1. **Test from the user's perspective**

- Focus on what users can see, read, and interact with
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

### 2. **Mock external dependencies, not UI elements**

- Mock: Chrome APIs, external services, storage, network calls
- Don't mock: Child components (unless they have complex external deps), UI libraries, DOM APIs
- Use real implementations of your own components when possible

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

### 3. **Simulate realistic user interactions**

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

// ❌ BAD - Low-level event firing
const input = screen.getByLabelText(/message/i);
fireEvent.change(input, { target: { value: 'Hello world' } });
fireEvent.click(screen.getByRole('button', { name: /send/i }));
```

### 4. **Test props behavior and events correctly**

- Verify component responds appropriately to prop changes
- Test emitted events using component event listeners
- Don't access internal state to verify prop effects

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

### 5. **Avoid testing implementation details**

**Don't Test:**

- Internal state variable names (`component.isLoading`)
- Lifecycle methods (`onMount`, `onDestroy` calls)
- Private helper functions within components
- Exact DOM structure (specific div nesting) unless semantically important
- CSS classes (unless they represent functional state)
- Internal function calls

**Do Test:**

- Rendered content (what users see)
- Conditional rendering (element appears/disappears)
- Disabled/enabled states
- Validation feedback
- Accessibility attributes

```typescript
// ❌ BAD - Testing internal state
expect(component.selectedCategory).toBe('bug');
expect(component.isSubmitting).toBe(true);

// ✅ GOOD - Testing user-visible outcome
expect(screen.getByRole('button', { name: /bug report/i })).toHaveAttribute('aria-pressed', 'true');
expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
```

### 6. **Test accessibility and semantic HTML**

- Verify proper ARIA labels, roles, and attributes
- Test keyboard navigation where applicable
- Ensure form elements have proper labels
- Test focus management for modals and dynamic content

```typescript
// ✅ GOOD - Accessibility testing
expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
expect(screen.getByLabelText(/email address/i)).toBeRequired();

// Test keyboard interaction
await user.keyboard('{Escape}');
expect(closeHandler).toHaveBeenCalled();
```

### 7. **Use appropriate test environment setup**

- Set `@vitest-environment jsdom` for component tests
- Mock browser APIs consistently in `beforeEach`
- Clean up after each test with `afterEach`
- Mock `chrome` APIs for extension components

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

afterEach(() => {
  vi.clearAllMocks();
});
```

### 8. **Test form validation and submission**

- Verify validation messages appear/disappear appropriately
- Test submit button disabled states
- Test successful submission flows
- Test error handling and display

```typescript
// ✅ GOOD - Form validation testing
it('should show error for invalid email', async () => {
  const user = userEvent.setup();
  render(LoginForm);

  await user.type(screen.getByLabelText(/email/i), 'invalid-email');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
});

it('should enable submit when form is valid', async () => {
  const user = userEvent.setup();
  render(LoginForm);

  await user.type(screen.getByLabelText(/email/i), 'test@example.com');
  await user.type(screen.getByLabelText(/password/i), 'password123');

  expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
});
```

### 9. **Test conditional rendering and loading states**

- Verify elements appear/disappear based on conditions
- Test loading indicators
- Test empty states and error states
- Use `queryBy*` for elements that shouldn't exist

```typescript
// ✅ GOOD - Conditional rendering
it('should show loading state while fetching', async () => {
  const mockFetch = vi.fn(() => new Promise(() => {})); // Never resolves
  render(DataList, { props: { fetchData: mockFetch } });

  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('should show data after successful fetch', async () => {
  const mockFetch = vi.fn().mockResolvedValue([{ id: 1, name: 'Item 1' }]);
  render(DataList, { props: { fetchData: mockFetch } });

  await waitFor(() => {
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});
```

### 10. **Make tests deterministic**

- Use `vi.useFakeTimers()` for time-dependent behavior
- Mock date/time for consistent results
- Avoid relying on animation timings
- Use `waitFor` with appropriate timeouts

```typescript
// ✅ GOOD - Deterministic timing
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-10-08T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

it('should auto-close after 3 seconds', async () => {
  render(Toast, { props: { message: 'Success!' } });

  expect(screen.getByText('Success!')).toBeInTheDocument();

  vi.advanceTimersByTime(3000);
  await waitFor(() => {
    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });
});
```

### 11. **Test error boundaries and edge cases**

- Test error states and error messages
- Test boundary conditions (empty data, max length, etc.)
- Test network failure scenarios
- Test authentication/authorization errors

```typescript
// ✅ GOOD - Error handling
it('should display error message on submission failure', async () => {
  const mockSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
  const user = userEvent.setup();

  render(FeedbackForm, { props: { onSubmit: mockSubmit } });

  await user.type(screen.getByLabelText(/message/i), 'Test message');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  await waitFor(() => {
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});
```

### 12. **Keep tests focused and maintainable**

- One logical concept per test
- Use descriptive test names explaining the scenario
- Group related tests with `describe` blocks
- Extract common setup into helper functions (but keep it visible)

```typescript
describe('FeedbackModal', () => {
  describe('Category Selection', () => {
    it('should display all available categories', () => {
      // Test implementation
    });

    it('should highlight selected category', async () => {
      // Test implementation
    });
  });

  describe('Form Submission', () => {
    it('should submit feedback with valid data', async () => {
      // Test implementation
    });

    it('should prevent submission when message is empty', async () => {
      // Test implementation
    });
  });
});
```

### 13. **Test modal and dialog interactions**

- Verify modal opens/closes correctly
- Test focus trapping in modals
- Test backdrop clicks (if applicable)
- Test Escape key handling

```typescript
// ✅ GOOD - Modal testing
it('should close modal on Escape key', async () => {
  const user = userEvent.setup();
  const { component } = render(Modal, { props: { show: true } });
  const closeHandler = vi.fn();
  component.$on('close', closeHandler);

  await user.keyboard('{Escape}');

  expect(closeHandler).toHaveBeenCalled();
});

it('should trap focus within modal', async () => {
  const user = userEvent.setup();
  render(Modal, { props: { show: true } });

  const firstButton = screen.getAllByRole('button')[0];
  const lastButton = screen.getAllByRole('button')[screen.getAllByRole('button').length - 1];

  lastButton.focus();
  await user.keyboard('{Tab}');

  expect(firstButton).toHaveFocus();
});
```

### 14. **Avoid over-mocking child components**

- Let child components render unless they have complex external dependencies
- If a child component needs mocking, consider if it's an integration test instead
- Mock at the service/API level, not the component level

```typescript
// ✅ GOOD - Mock external service, not child component
vi.mock('../../../services/GitHubApiClient');

render(ParentComponent); // Child components render naturally

// ❌ BAD - Unnecessary child component mocking
vi.mock('../ChildComponent.svelte');
vi.mock('../AnotherChild.svelte');
vi.mock('../YetAnotherChild.svelte');
```

### 15. **Document complex test scenarios**

- Add comments explaining non-obvious test setup
- Document why certain mocks are necessary
- Explain timing-related waits
- Clarify accessibility testing intentions

```typescript
// ✅ GOOD - Well-documented test
it('should include logs when checkbox is selected for bug reports', async () => {
  // Setup: Mock logs with realistic error data
  const mockLogs = [
    {
      timestamp: '2025-10-07T12:00:00Z',
      level: 'error',
      context: 'content',
      message: 'Failed to upload file',
    },
  ];
  mockState.getAllLogs.mockResolvedValue(mockLogs);

  const user = userEvent.setup();
  render(FeedbackModal, { props: { show: true } });

  // User selects bug report category (logs option only appears for bugs)
  await user.click(screen.getByText(/🐛 Bug Report/));

  // User opts in to including logs
  await user.click(await screen.findByLabelText(/Include recent logs/i));

  // Submit and verify logs were fetched and included
  await user.type(screen.getByLabelText(/Your Message/i), 'Bug report');
  await user.click(screen.getByRole('button', { name: /Send/i }));

  await waitFor(() => {
    expect(mockState.getAllLogs).toHaveBeenCalled();
    expect(mockState.submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Bug report'),
      })
    );
  });
});
```

---

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

---

## Common Pitfalls to Avoid

❌ **Don't:**

- Access component internal state (`component.someVariable`)
- Test lifecycle method calls (`expect(onMount).toHaveBeenCalled()`)
- Query by CSS classes for functional testing
- Mock child components excessively
- Test exact HTML structure
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

---

## Example: Complete Component Test

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import LoginForm from '../LoginForm.svelte';

// Mock external dependencies
const mockLogin = vi.fn();
vi.mock('../../../services/AuthService', () => ({
  AuthService: class {
    async login(email: string, password: string) {
      return mockLogin(email, password);
    }
  },
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Form Validation', () => {
    it('should disable submit button when form is empty', () => {
      render(LoginForm);

      expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
    });

    it('should show error for invalid email format', async () => {
      const user = userEvent.setup();
      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'invalid-email');
      await user.tab(); // Trigger blur

      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });

    it('should enable submit when both fields are valid', async () => {
      const user = userEvent.setup();
      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');

      expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('should call login service with correct credentials', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ success: true });

      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /log in/i }));

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should show success message on successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ success: true });

      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /log in/i }));

      await waitFor(() => {
        expect(screen.getByText(/login successful/i)).toBeInTheDocument();
      });
    });

    it('should display error message on login failure', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));

      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /log in/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    it('should disable submit button while submitting', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(LoginForm);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /log in/i }));

      expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(LoginForm);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('should mark required fields as required', () => {
      render(LoginForm);

      expect(screen.getByLabelText(/email/i)).toBeRequired();
      expect(screen.getByLabelText(/password/i)).toBeRequired();
    });
  });
});
```

---

## When to Use Integration Tests Instead

Consider writing integration tests (not component tests) when:

- Testing multiple components working together
- Testing full user flows across pages/views
- Testing real API calls (in a test environment)
- Testing state management across components
- Testing routing and navigation

Component tests should focus on **a single component's behavior in isolation** with mocked external dependencies.

---

## Summary

Svelte component tests are fundamentally different from unit tests for classes and functions. The key is to **test like a user**: focus on what's rendered, how users interact with it, and what outcomes they experience. Mock external dependencies, but let your UI render naturally. If you find yourself accessing internal state or mocking many child components, you're likely testing implementation details rather than behavior.
