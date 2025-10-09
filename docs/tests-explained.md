I'll answer your question first, then perform all the requested updates.

## Testing Types Explained

### 1. **Unit Testing**

Tests **individual units** (functions, classes, methods) in **complete isolation**.

**Characteristics:**

- Tests ONE thing at a time
- Mocks all dependencies
- Fast execution (milliseconds)
- No external systems (no DB, API, file system)
- Focuses on logic and algorithms

**Example:**

```typescript
// Testing a pure function
it('should calculate total price with tax', () => {
  const result = calculateTotal(100, 0.1); // 10% tax
  expect(result).toBe(110);
});
```

**Tools:** Vitest, Jest, Mocha

---

### 2. **Component Testing**

Tests **UI components** by rendering them and simulating user interactions.

**Characteristics:**

- Tests user-visible behavior
- Renders actual component in test environment (jsdom)
- Simulates user actions (click, type, etc.)
- Mocks external services but NOT child components
- Tests DOM output, accessibility, events

**Example:**

```typescript
// Testing a Svelte component
it('should submit form when valid', async () => {
  const user = userEvent.setup();
  render(LoginForm);

  await user.type(screen.getByLabelText(/email/i), 'test@example.com');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(screen.getByText(/success/i)).toBeInTheDocument();
});
```

**Tools:** Vitest + @testing-library/svelte (for Svelte), @testing-library/react (for React)

---

### 3. **Integration Testing**

Tests **how multiple units work together** with some real implementations.

**Characteristics:**

- Tests interaction between 2+ components/services
- May use real implementations instead of mocks
- May interact with real databases (test DB) or APIs
- Tests data flow between components
- Slower than unit tests

**Example:**

```typescript
// Testing service integration
it('should fetch user data and update cache', async () => {
  const apiClient = new GitHubApiClient(realToken);
  const cacheService = new CacheService(); // Real implementation

  const data = await apiClient.getUser('testuser');
  await cacheService.set('user', data);

  const cached = await cacheService.get('user');
  expect(cached).toEqual(data);
});
```

**Tools:** Vitest, Jest (with real implementations, not mocks)

---

### 4. **End-to-End (E2E) Testing with Playwright**

Tests **complete user workflows** in a **real browser environment**.

**Characteristics:**

- Tests full application from user's perspective
- Runs in real browser (Chrome, Firefox, Safari)
- No mocking - uses real backend, APIs, databases
- Tests entire user journey across multiple pages
- Slowest but most realistic

**Example:**

```typescript
// Testing complete user workflow
test('user can download and push to GitHub', async ({ page }) => {
  // 1. User downloads from bolt.new
  await page.goto('https://bolt.new/project');
  await page.click('text=Download');

  // 2. Extension detects download
  await page.waitForSelector('[data-testid="extension-notification"]');

  // 3. User clicks push to GitHub
  await page.click('text=Push to GitHub');

  // 4. Verify on actual GitHub
  await page.goto('https://github.com/user/repo');
  await expect(page.locator('text=project files')).toBeVisible();
});
```

**Tools:** Playwright, Cypress, Selenium

---

## Visual Comparison

| Aspect          | Unit                  | Component                 | Integration              | E2E (Playwright)    |
| --------------- | --------------------- | ------------------------- | ------------------------ | ------------------- |
| **Scope**       | Single function/class | Single UI component       | Multiple units           | Entire application  |
| **Isolation**   | Complete (all mocked) | Partial (services mocked) | Minimal (some real)      | None (all real)     |
| **Speed**       | ⚡ Fastest (ms)       | 🏃 Fast (ms)              | 🚶 Medium (100ms-1s)     | 🐌 Slow (seconds)   |
| **Environment** | Node/jsdom            | jsdom                     | Node/jsdom               | Real browser        |
| **Mocking**     | Everything            | External services only    | Minimal                  | None                |
| **Confidence**  | Low (isolated)        | Medium (UI works)         | High (integration works) | Highest (E2E works) |
| **When fails**  | Logic bug             | UI bug                    | Integration issue        | Real user issue     |

---

## Testing Pyramid

```text
        /\
       /E2E\        ← Few tests, high confidence (Playwright)
      /------\
     /  INT  \      ← Some tests, good coverage
    /--------\
   / Component\     ← More tests, UI validation
  /------------\
 /    Unit     \    ← Many tests, fast feedback
/----------------\
```

**Rule of Thumb:**

- 70% Unit tests (fast, many edge cases)
- 20% Integration + Component tests (key workflows)
- 10% E2E tests (critical user journeys)
