````instructions
---
applyTo: '**/*.ts'
---

# Project Rules & Standards

## Critical Reminder

**BEFORE summarizing ANY work or declaring completion:**

1. Make all required file changes
2. **Run tests FIRST**: `pnpm test` (or specific test file) - all must pass
3. **ONLY THEN run quality checks**: `pnpm format && pnpm lint && pnpm check`
4. Clean up test comments: `pnpm clean:test-comments`
5. **If fixes were made during quality checks**, rerun tests to ensure they still pass
6. Update testing documentation files in `docs/` if test coverage or approaches changed
7. Iterate until both tests and quality checks have no errors
8. Provide a properly formatted commit message
9. ONLY THEN provide a summary

---

## 1. Code Quality Workflow

### 1.1 Mandatory Pre-Summary Quality Workflow

**BEFORE summarizing accomplishments or ending any task**, ALWAYS follow this exact sequence:

#### Step 1: Make File Changes
- Implement the required changes to source files or test files
- Ensure changes follow project standards
- **Verify no `any` types are used** - use proper TypeScript types from the start
- Use `unknown` for truly unknown types (then narrow with type guards) or `never` for test type assertions

#### Step 2: Run Tests FIRST
**After making any file changes**, IMMEDIATELY run the relevant tests to ensure they pass:

```bash
# For specific test file being worked on:
pnpm test path/to/test-file.test.ts

# OR for all tests if broader changes were made:
pnpm test
```

**STOP here if tests fail.** Fix the code until all tests pass before proceeding.

#### Step 3: Run Code Quality Checks
**ONLY AFTER all tests are passing**, run quality checks sequentially:

```bash
pnpm format
pnpm lint
pnpm check
pnpm clean:test-comments
```

#### Step 4: Rerun Tests if Fixes Were Made
**If any file changes were made** to resolve code quality check errors (formatting, linting, type errors):

```bash
# Rerun the same tests to ensure they still pass
pnpm test path/to/test-file.test.ts
# OR
pnpm test
```

#### Step 5: Final State Verification
Before proceeding to summary:
- ✅ All tests passing
- ✅ No code quality errors (format, lint, check)
- ✅ Test comments cleaned

**After running these commands:**
- Update `docs/testing-overview.md` if test coverage changed significantly
- Update `docs/testing-gaps.md` if new gaps were identified or closed
- Update `docs/unit-testing-rules.md` if new testing patterns or rules were established

**This workflow is MANDATORY.** Iterate until both tests and quality checks pass. Never skip these steps before providing a summary or completing work.

### 1.2 Pre-Summary Commit Process

**BEFORE providing any summary or declaring work complete**, ALWAYS provide a well-formatted git commit message following Conventional Commits format:

- Format: `type: description`
- Include bullet points for specific, concise descriptions of implemented changes if needed
- Do not perform the actual commit unless explicitly requested

**Both tests and quality checks must be completed and passing BEFORE writing the commit message.**

---

## 2. TypeScript Standards

### 2.1 Type Safety

**CRITICAL: Never use `any` type when writing or editing code**

- **ALWAYS use proper TypeScript types from the very start** - never write `any` with the intention to fix it later
- For unknown types, use `unknown` and narrow with type guards, or use `never` for type assertions in tests
- Use specific types, interfaces, and type aliases for all function parameters, return values, and variables
- Never use ESLint disable comments (exception: rare, documented cases in test files only)
- Leverage TypeScript's type inference when it improves readability
- **Before saving any file**: Verify no `any` types exist (this prevents lint warnings)

### 2.2 Code Style

- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Prefer functional programming patterns where appropriate

---

## 3. Testing Standards

### 3.1 Testing Documentation

**Before writing any tests**, review the appropriate testing guide:

- **[docs/unit-testing-rules.md](../../docs/unit-testing-rules.md)** - For testing classes, functions, services, and utilities
- **[docs/component-testing-rules.md](../../docs/component-testing-rules.md)** - For testing Svelte components (.svelte files)

> **⚠️ Critical:** Component tests and unit tests follow **fundamentally different rules**. Using the wrong approach will result in brittle, unmaintainable tests.

### 3.2 Key Testing Principles

**All detailed rules, examples, and guidelines are in the documentation files above.** Key reminders:

- **Unit tests**: Test behavior through public APIs only. Minimize mocking.
- **Component tests**: Test from user's perspective using the DOM. Mock only external services.
- **Test naming**: Use `*.component.test.ts` for components, `*.logic.test.ts` for business logic, `*.test.ts` for general unit tests
- **Quality over coverage**: Write tests that catch real bugs, not just increase numbers
- **All tests must pass** before submitting work

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

1. ✅ Make all required file changes
2. ✅ Run tests - all must pass (`pnpm test` or `pnpm test path/to/test.ts`)
3. ✅ Run quality checks - all must pass (`pnpm format && pnpm lint && pnpm check`)
4. ✅ If fixes were made during quality checks, rerun tests to ensure they still pass
5. ✅ Write conventional commit message
6. ✅ Provide clear summary of changes
7. ✅ Reference related issues or documentation

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

- [ ] File changes completed
- [ ] **No `any` types used** (verified before running tests)
- [ ] Tests passing (`pnpm test` or specific test file)
- [ ] Code formatted (`pnpm format`)
- [ ] No lint errors (`pnpm lint`)
- [ ] No TypeScript errors (`pnpm check`)
- [ ] Test comments cleaned (`pnpm clean:test-comments`)
- [ ] If fixes made during quality checks, tests rerun and passing
- [ ] Testing docs updated (`docs/testing-overview.md`, `docs/testing-gaps.md`, `docs/unit-testing-rules.md`)
- [ ] Test coverage maintained or improved
- [ ] No ESLint disable comments (except rare documented cases in tests)
- [ ] Documentation updated if needed
- [ ] Commit message prepared
- [ ] Summary prepared

**Only after completing this checklist should you provide a summary or declare completion.**

````
