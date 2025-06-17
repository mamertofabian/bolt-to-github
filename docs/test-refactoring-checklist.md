# Test Refactoring Checklist

This guide provides a systematic approach to refactoring unit tests based on common anti-patterns found in the codebase and the principles from `@docs/unit-testing-rules.md`.

## 🔍 Quick Assessment

Before refactoring a test file, quickly scan for these red flags:

- [ ] Tests with more than 20 lines of setup code
- [ ] Tests using `jest.useFakeTimers()` or other timer manipulation
- [ ] Tests with multiple `expect()` statements testing different behaviors
- [ ] Tests that break when refactoring implementation (brittle tests)
- [ ] Tests with deeply nested describe blocks (more than 3 levels)
- [ ] Tests that mock internal modules or services
- [ ] Tests with names like "should call X" or "should invoke Y"

## 📋 Step-by-Step Refactoring Process

### 1. Identify What's Being Tested

- [ ] Can you describe what behavior the test verifies in one sentence?
- [ ] Is it testing user-visible behavior or implementation details?
- [ ] Would this test break if you refactored the implementation?

**❌ Bad Example:**

```javascript
it('should call updateStatus three times during processing', async () => {
  // Testing that an internal method is called N times
});
```

**✅ Good Example:**

```javascript
it('should successfully process a ZIP file', async () => {
  // Testing the actual outcome, not how it's achieved
});
```

### 2. Simplify Test Setup

- [ ] Remove unnecessary mocks
- [ ] Use real implementations where possible
- [ ] Extract common setup to helper functions with descriptive names
- [ ] Keep setup directly related to what's being tested

**❌ Bad Example:**

```javascript
beforeEach(() => {
  // 50+ lines of mock setup
  mockService1 = { ... };
  mockService2 = { ... };
  mockService3 = { ... };
  // Complex mock interactions
})
```

**✅ Good Example:**

```javascript
beforeEach(() => {
  env = createTestEnvironment();
  manager = env.createManager();
});
```

### 3. Remove Implementation Detail Tests

- [ ] Remove tests for private methods
- [ ] Remove tests that verify mock interactions
- [ ] Remove tests for internal state changes
- [ ] Focus on observable outputs

**❌ Bad Example:**

```javascript
it('should update internal cache after fetch', async () => {
  await service.fetchData();
  expect(service._cache.size).toBe(1); // Testing private state
});
```

**✅ Good Example:**

```javascript
it('should return cached data on subsequent requests', async () => {
  const data1 = await service.fetchData();
  const data2 = await service.fetchData();
  expect(data2).toEqual(data1); // Testing behavior
});
```

### 4. Eliminate Timing Dependencies

- [ ] Remove `jest.useFakeTimers()` unless absolutely necessary
- [ ] Remove arbitrary `setTimeout` or `sleep` calls
- [ ] Make async operations deterministic
- [ ] Use promises and async/await properly

**❌ Bad Example:**

```javascript
it('should retry after delay', async () => {
  jest.useFakeTimers();
  const promise = service.fetchWithRetry();
  jest.advanceTimersByTime(1000);
  await promise;
  jest.useRealTimers();
});
```

**✅ Good Example:**

```javascript
it('should eventually succeed with retry', async () => {
  mockApi.failTimes(2); // Deterministic failure
  const result = await service.fetchWithRetry();
  expect(result).toBeDefined();
});
```

### 5. One Assertion Per Test

- [ ] Split tests with multiple unrelated assertions
- [ ] Group related assertions that test the same behavior
- [ ] Create separate tests for edge cases

**❌ Bad Example:**

```javascript
it('should handle file upload', async () => {
  const result = await uploader.upload(file);
  expect(result.status).toBe('success');
  expect(mockApi.upload).toHaveBeenCalled();
  expect(localStorage.getItem('lastUpload')).toBeDefined();
  expect(eventEmitter.emit).toHaveBeenCalledWith('upload:complete');
});
```

**✅ Good Example:**

```javascript
it('should successfully upload a file', async () => {
  const result = await uploader.upload(file);
  expect(result.status).toBe('success');
});

it('should persist upload timestamp', async () => {
  await uploader.upload(file);
  expect(localStorage.getItem('lastUpload')).toBeDefined();
});
```

### 6. Improve Test Names

- [ ] Use descriptive names that explain the behavior
- [ ] Avoid technical implementation terms
- [ ] Focus on outcomes, not methods

**❌ Bad Examples:**

- "should call repository.save"
- "should instantiate with correct parameters"
- "should mock GitHub API correctly"

**✅ Good Examples:**

- "should persist user preferences"
- "should handle network errors gracefully"
- "should import repository from GitHub"

### 7. Minimize Mocking

- [ ] Only mock external dependencies (APIs, databases, file system)
- [ ] Use real implementations of your own code
- [ ] Create simple test doubles instead of complex mocks
- [ ] Avoid mocking what you don't own

**❌ Bad Example:**

```javascript
jest.mock('../services/ValidationService');
jest.mock('../utils/helpers');
jest.mock('../models/User');
```

**✅ Good Example:**

```javascript
// Only mock external dependencies
jest.mock('fs/promises');
jest.mock('node-fetch');
```

### 8. Make Tests Readable

- [ ] Remove unnecessary comments
- [ ] Use descriptive variable names
- [ ] Follow AAA pattern (Arrange, Act, Assert)
- [ ] Keep tests short and focused

**❌ Bad Example:**

```javascript
it('test', async () => {
  const x = new X();
  const y = { a: 1, b: 2, c: 3, d: 4 }; // Setup data
  x.setConfig(y);
  const z = await x.process(); // Process it
  expect(z).toBeTruthy(); // Should work
});
```

**✅ Good Example:**

```javascript
it('should process configuration', async () => {
  // Arrange
  const processor = new ConfigProcessor();
  const config = createTestConfig();

  // Act
  const result = await processor.process(config);

  // Assert
  expect(result.isValid).toBe(true);
});
```

## 🚨 Common Anti-Patterns to Fix

### 1. Testing Mock Behavior

```javascript
// ❌ Bad
expect(mockService.method).toHaveBeenCalledWith(expectedArgs);

// ✅ Good
expect(actualResult).toEqual(expectedResult);
```

### 2. Complex Test Data Builders

```javascript
// ❌ Bad
const user = new UserBuilder()
  .withId(123)
  .withName('Test')
  .withEmail('test@example.com')
  .withRole('admin')
  .withPermissions(['read', 'write'])
  .build();

// ✅ Good
const user = { id: 123, name: 'Test', email: 'test@example.com' };
```

### 3. Testing Implementation Order

```javascript
// ❌ Bad
it('should call methods in correct order', () => {
  service.process();
  expect(mockA.method).toHaveBeenCalledBefore(mockB.method);
});

// ✅ Good
it('should process data successfully', () => {
  const result = service.process();
  expect(result).toBeDefined();
});
```

### 4. Over-Specific Assertions

```javascript
// ❌ Bad
expect(error.message).toBe('Failed to connect to database at localhost:5432');

// ✅ Good
expect(error.message).toContain('Failed to connect');
```

## 📊 Measuring Success

After refactoring, your tests should:

1. **Run faster** - No artificial delays or complex setups
2. **Be more stable** - Don't break when refactoring
3. **Be more readable** - New developers understand them quickly
4. **Provide better coverage** - Test actual behavior, not mocks
5. **Give better feedback** - Clear what broke when tests fail

## 🎯 Priority Guide

Focus on refactoring tests that:

1. **High Priority**

   - Frequently break during development
   - Take a long time to run
   - Are hard to understand
   - Test critical business logic

2. **Medium Priority**

   - Use extensive mocking
   - Have complex setups
   - Test multiple behaviors

3. **Low Priority**
   - Are already simple and clear
   - Test utility functions
   - Have no timing dependencies

## 📝 Final Checklist

Before committing refactored tests:

- [ ] All tests still pass
- [ ] Tests are faster than before
- [ ] Tests are easier to understand
- [ ] No implementation details are tested
- [ ] Mocking is minimized
- [ ] Each test has a single, clear purpose
- [ ] Test names describe behavior, not implementation

## 🔗 Related Resources

- [Unit Testing Rules](./unit-testing-rules.md)
- [Jest Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Testing Library Principles](https://testing-library.com/docs/guiding-principles/)

---

Remember: The goal is to make tests that help development, not hinder it. Tests should give you confidence to refactor and improve code, not make you afraid to change anything.
