````instructions
---
applyTo: '**/*.ts'
---

# Project Rules & Standards

## Critical Reminder

**BEFORE summarizing ANY work or declaring completion:**

1. Run quality checks: `pnpm format && pnpm lint && pnpm check`
2. Clean up test comments: `pnpm clean:test-comments`
3. Update testing documentation files in `docs/` if test coverage or approaches changed
4. Iterate until all errors are resolved
5. Provide a properly formatted commit message
6. ONLY THEN provide a summary

---

## 1. Code Quality Workflow

### 1.1 Mandatory Pre-Summary Quality Checks

**BEFORE summarizing accomplishments or ending any task**, ALWAYS execute the following commands sequentially:

```bash
pnpm format
pnpm lint
pnpm check
pnpm clean:test-comments
```

**After running these commands:**
- Update `docs/testing-overview.md` if test coverage changed significantly
- Update `docs/testing-gaps.md` if new gaps were identified or closed
- Update `docs/unit-testing-rules.md` if new testing patterns or rules were established

**This is MANDATORY.** Iterate until all errors are resolved. Never skip these checks before providing a summary or completing work.

### 1.2 Pre-Summary Commit Process

**BEFORE providing any summary or declaring work complete**, ALWAYS provide a well-formatted git commit message following Conventional Commits format:

- Format: `type: description`
- Include bullet points for specific, concise descriptions of implemented changes if needed
- Do not perform the actual commit unless explicitly requested

**Quality checks (format, lint, check) must be completed BEFORE writing the commit message.**

---

## 2. TypeScript Standards

### 2.1 Type Safety

- Use proper TypeScript types, interfaces, and type aliases
- Avoid the `any` type; use `unknown` if type is truly unknown, then narrow with type guards
- Never use ESLint disable comments (exception: rare, documented cases in test files only)
- Leverage TypeScript's type inference when it improves readability

### 2.2 Code Style

- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Prefer functional programming patterns where appropriate

---

## 3. Testing Standards

### 3.1 Test File Naming Convention

Follow this naming convention for all test files:

- **`*.component.test.ts`** - Component/UI behavior tests
  - Use `@testing-library/svelte` to render components
  - Test user interactions (click, type, keyboard events)
  - Test rendering based on props and state
  - Test accessibility
  - Mock only external dependencies (APIs, Chrome APIs, services)

- **`*.logic.test.ts`** - Business logic tests
  - Test pure functions and utility methods
  - Test data transformations and calculations
  - Test internal component logic (by creating component instances if needed)
  - No DOM rendering or user interaction simulation
  - Focus on inputs, outputs, and edge cases

- **`*.test.ts`** - General unit tests (for services, utilities, etc.)
  - Use for non-component TypeScript files
  - Follow logic test principles

### 3.2 Testing Principles

Strictly follow `docs/unit-testing-rules.md` for all test files. Key principles:

1. **Test behavior, not implementation details**
   - Focus on observable inputs and outputs
   - Tests should remain valid when internal implementation changes
   - Use descriptive test names: `should [expected behavior] when [condition]`

2. **Minimize mocking**
   - Only mock external systems you don't control (databases, APIs, file systems, Chrome APIs)
   - Use real implementations of your own dependencies when possible
   - If mocking is required, ensure mocks accurately reflect real behavior

3. **Component testing with @testing-library/svelte**
   - Render real components, not mocks of them
   - Unmock UI components (Modal, Button, icons) to test actual rendering
   - Test user interactions with `@testing-library/user-event`
   - Verify visible content with `screen` queries
   - Use `waitFor` for asynchronous state changes

4. **Test quality over coverage**
   - Write tests that catch real bugs
   - Test edge cases and error conditions, not just happy paths
   - One logical assertion per test
   - Make tests deterministic and independent

5. **Keep tests maintainable**
   - Follow AAA pattern: Arrange, Act, Assert
   - Tests should be simple, readable, and obvious
   - Tests should serve as documentation
   - Avoid brittle tests that fail due to minor, unrelated changes

### 3.3 Test Execution

- Fix failing tests rather than removing them if they follow established principles
- All tests must pass before submitting work
- Tests should run quickly to encourage frequent execution

---

## 4. Documentation

### 4.1 Code Documentation

- Use JSDoc comments for public APIs, complex logic, and non-obvious code
- Keep comments concise and up-to-date
- Apply no-comments rule to both test and production code (tests should be self-documenting)

### 4.2 Markdown Documentation

- Format all markdown files after editing
- Use proper heading hierarchy
- Include code examples where helpful
- Keep documentation synchronized with code changes

### 4.3 Work Summary Documentation

**NEVER create separate markdown files to document work summaries, fixes, or implementation details.**

- Provide summaries directly in conversation/PR descriptions, not as new `.md` files
- Exception: Only create/update documentation files that serve ongoing reference purposes (e.g., `docs/unit-testing-rules.md`, API documentation, architecture docs)
- Delete any summary documents created during work sessions
- Keep the docs folder clean and focused on reference material, not work logs

---

## 5. Pull Request Process

Before submitting any work:

1. ✅ Run `pnpm format && pnpm lint && pnpm check` - all must pass
2. ✅ Run `pnpm test` - all tests must pass
3. ✅ Write conventional commit message
4. ✅ Provide clear summary of changes
5. ✅ Reference related issues or documentation

---

## 6. Context Window Management

### 6.1 When Context Window is Exhausted

**ONLY when the context window has been reached** AND the AI agent is experiencing issues (hallucinations, errors) **EVEN AFTER conversation history has been automatically summarized**, follow this protocol:

1. Complete as much work as possible within the current context
2. Run quality checks if applicable to the completed work
3. Provide a summary of what was accomplished
4. **After the summary**, output a continuation prompt:

```
---
CONTINUATION PROMPT FOR NEXT CONVERSATION:
[Provide a concise, specific, precise prompt that captures:]
- Exact remaining work to be done
- Context about what was already completed
- Specific files or areas that need attention
- Any discovered issues or blockers
- Next actionable steps
```

**Important:** This is NOT a replacement for normal summarization. This is ONLY for true context exhaustion scenarios where the conversation must be continued in a new window.

---

## 7. Quality Checklist

Use this checklist before declaring work complete:

- [ ] Code formatted (`pnpm format`)
- [ ] No lint errors (`pnpm lint`)
- [ ] No TypeScript errors (`pnpm check`)
- [ ] Test comments cleaned (`pnpm clean:test-comments`)
- [ ] Testing docs updated (`docs/testing-overview.md`, `docs/testing-gaps.md`, `docs/unit-testing-rules.md`)
- [ ] All tests passing (`pnpm test`)
- [ ] Test coverage maintained or improved
- [ ] No `any` types (except rare documented cases)
- [ ] No ESLint disable comments (except rare documented cases in tests)
- [ ] Documentation updated if needed
- [ ] Commit message prepared
- [ ] Summary prepared

**Only after completing this checklist should you provide a summary or declare completion.**

````
