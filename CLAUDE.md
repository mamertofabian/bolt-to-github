# CLAUDE.md - Development Guide

## Overview

Bolt to GitHub is a Chrome Extension (Manifest v3) that automatically captures ZIP file downloads from bolt.new, extracts them, and pushes contents to GitHub repositories. Built with Svelte v4.2.x, TypeScript v5.6.x, and TailwindCSS.

**Current Version**: v1.3.7  
**Repository**: mamertofabian/bolt-to-github  
**Package Manager**: pnpm (required)

## Memories and Branching Guidelines

- Follow @docs/unit-testing-rules.md .
  **CRITICAL**: Always follow the versioned development branch strategy below - NEVER branch directly off main for features/fixes.
- Unless doing a TDD session, the task is never considered complete if there are failing tests
- Make sure all code quality checks (pnpm lint, check, test, build) are passing before ending each coding session to keep the code clean

### Versioned Development Branch Strategy

When starting new development work:

1. **Check for Development Version Branch**: Look for existing `dev-v{NEXT_VERSION}` branch (e.g., if main is v1.3.3, check for `dev-v1.3.4`)
2. **Branch Creation Logic**:
   - **If dev version branch EXISTS**: Create your feature/fix branch from `dev-v{NEXT_VERSION}`
   - **If dev version branch DOES NOT exist**:
     - First create `dev-v{NEXT_VERSION}` from `main`
     - Then create your feature/fix branch from the new dev version branch
3. **Pull Request Targets**:
   - **Default**: All PRs target the `dev-v{NEXT_VERSION}` branch
   - **Exception**: Only target `main` when deploying/releasing the new version

### Branch Naming Convention

- Development version: `dev-v1.3.4`
- Feature branches: `feature/your-feature-name`
- Fix branches: `fix/your-fix-name`
- Hotfix branches: `hotfix/your-hotfix-name`

## IMPORTANT RULES

- YOU MUST write tests before implementation
- YOU MUST follow existing authentication patterns
- YOU MUST use existing error handling patterns
- YOU MUST document all new API endpoints (Edge Functions)

## Git Workflow

- **NEVER** branch directly from `main` for features/fixes - follow versioned development strategy above
- **ALWAYS** run tests, build, and lint before considering work complete:
  1. `pnpm test:ci` - Ensure all tests pass (`pnpm test:ci` is for running with test coverage, use `pnpm test` to include test coverage)
  2. `pnpm build` - Verify no TypeScript errors
  3. `pnpm lint` - Check for code style issues

## Test-Driven Development (TDD) Workflow

Follow this Anthropic-recommended workflow for all changes:

1. **Write Tests First**

   - Write tests based on expected input/output pairs
   - Avoid creating mock implementations for non-existent functionality
   - Focus on what the code SHOULD do, not how it does it

2. **Verify Tests Fail**

   - Run the tests and confirm they fail
   - DO NOT write any implementation code at this stage
   - Ensure tests are testing the right things

3. **Commit Tests**

   - Commit the tests when satisfied with their coverage
   - Use descriptive commit messages like "test: add tests for X functionality"

4. **Write Implementation**

   - Write code that passes the tests
   - DO NOT modify the tests during implementation
   - Keep iterating until all tests pass
   - Run tests after each change to track progress

5. **Verify Implementation**

   - Use a subagent to verify the implementation isn't overfitting
   - Ensure code follows existing patterns and conventions
   - Check that implementation is minimal but complete

6. **Commit Implementation**
   - Commit the code once all tests pass
   - Use descriptive commit messages like "feat: implement X functionality"

### Workflow Summary:

- Write tests, commit
- Write code, iterate until tests pass, commit
- Keep tests and implementation in separate commits for clarity

## GitHub Issue Workflow

When working on GitHub issues, follow this structured approach:

1. **Get Issue Details**

   ```bash
   gh issue view <issue-number>
   ```

2. **Plan Implementation**

   - Review acceptance criteria
   - Create a comprehensive todo list
   - Identify which existing patterns to follow

3. **Follow TDD Workflow**

   - Write comprehensive tests first
   - Verify tests fail
   - Commit tests
   - Implement solution
   - Ensure all tests pass
   - Commit implementation

4. **Testing**

   - Use Vitest with Testing Library for frontend tests
   - Run tests with: `pnpm test` or `pnpm test:watch` for watch mode
   - Ensure TypeScript compilation passes: `pnpm build`

5. **Close Issue**
   - Verify all acceptance criteria are met
   - Add completion comment with summary
   - Close issue with: `gh issue close <issue-number>`

## Commands

### Build & Development

- Build: `pnpm run build` - Create production build for extension
- Watch: `pnpm run watch` - Build and watch for changes (recommended for development)
- Dev: `pnpm run dev` - Start Vite dev server (not used for extension testing)

### Code Quality

- Lint: `pnpm run lint` - Run ESLint on src/\*_/_.{js,ts,svelte}
- Lint+Fix: `pnpm run lint:fix` - Fix linting issues automatically
- Format: `pnpm run format` - Check formatting with Prettier
- Format+Fix: `pnpm run format:fix` - Fix formatting issues
- Type Check: `pnpm run check` - Run svelte-check with TypeScript validation

### Testing

- Test: `pnpm run test` - Run Vitest tests
- Test (CI): `pnpm run test:ci` - Run tests in CI mode
- Test Watch: `pnpm run test:watch` - Run tests in watch mode
- Test UI: `pnpm run test:ui` - Run tests with Vitest UI

### Git Hooks

- Prepare: `pnpm run prepare` - Set up Husky git hooks
- Pre-commit: Automatically formats code using lint-staged

## Architecture

### Project Structure

```
src/
├── background/          # Service worker (Chrome Extension background script)
├── content/            # Content scripts with modular architecture
│   ├── handlers/       # Event and UI handlers
│   ├── infrastructure/ # Core services and infrastructure
│   ├── managers/       # Feature managers (Auth, Push, UI, etc.)
│   └── services/       # Business logic services
├── lib/               # Shared libraries and utilities
│   ├── components/    # Shared Svelte components
│   ├── services/      # Core services
│   ├── stores/        # Svelte stores for state management
│   └── utils/         # Utility functions
├── popup/             # Extension popup UI
├── services/          # Global services
└── types/            # TypeScript type definitions
```

### Key Technologies

- **Framework**: Svelte v4.2.x with TypeScript v5.6.x
- **Build Tool**: Vite v4.5.x with @crxjs/vite-plugin v2.0.0-beta.18
- **Styling**: TailwindCSS v3.4.x with custom theme system
- **UI Components**: bits-ui v0.21.x for base components
- **Icons**: lucide-svelte v0.460.x
- **Testing**: Vitest v1.6.x with @testing-library/jest-dom and jsdom environment
- **Utilities**: fflate v0.8.x (compression), tailwind-merge v2.5.x, tailwind-variants v0.3.x

## Code Style Guidelines

### TypeScript Standards

- Strict mode enabled with noImplicitAny and strictNullChecks
- Explicit types for function parameters and returns
- ESM modules only (type: "module" in package.json)
- Chrome types included for extension APIs
- Path aliases: use `$lib/*` for imports from src/lib

### Svelte Standards

- All components must use TypeScript (`<script lang="ts">`)
- Props must be properly typed with TypeScript interfaces
- Follow Svelte best practices for reactivity
- Use Svelte's built-in state management (stores in $lib/stores)
- Keep components focused and single-responsibility

### Styling Standards

- TailwindCSS for all styling (no custom CSS)
- Follow custom theme system in tailwind.config.js with CSS variables
- Use container queries and defined border radius system
- Maintain dark mode compatibility with `darkMode: ['class']`
- Use clsx for conditional classes, tailwind-merge for merging

### Code Quality Rules

- **ESLint Configuration**:
  - No unused variables (except prefixed with \_)
  - Warn on any usage
  - No console.log (only console.warn/error allowed)
  - Follow @typescript-eslint/parser with eslint-plugin-svelte
- **Prettier Configuration**:
  - 2 space indentation
  - Single quotes
  - 100 character line length
  - ES5 trailing commas
  - Svelte-specific formatting with prettier-plugin-svelte

### Chrome Extension Specifics

- Manifest v3 standards required
- Service worker architecture for background scripts
- Content scripts run at document_start
- Web accessible resources properly configured
- Permissions: storage, activeTab, tabs, idle, scripting

## Testing Standards

### Framework

- Vitest v1.6.x with jsdom environment and globals enabled
- Native TypeScript support with ESM modules
- @testing-library/jest-dom for DOM assertions
- Comprehensive mocking system for Chrome APIs, Svelte, and external dependencies

### Test Organization

- Tests located in `__tests__/` directories alongside source files
- Test files follow pattern: `(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$`
- Mock files in `__mocks__/` directories
- Shared test setup in `src/test/setup/vitest-setup.ts`

### Coverage

- Coverage collection with V8 provider (@vitest/coverage-v8)
- Coverage directory: `coverage/`
- Multiple reporters: text, json, html
- Excludes test files, mocks, and setup files
- Coverage thresholds temporarily disabled during development

### Testing Best Practices

- Test behavior, not implementation details
- Minimize mocking to essential dependencies
- Use real implementations when possible
- Test both happy paths and error conditions
- Keep tests simple, readable, and maintainable

## Development Workflow

### Chrome Extension Development

- Load `dist` folder in Chrome Extensions developer mode
- Use `pnpm run watch` for live rebuilding during development
- Test directly in Chrome - no dev server needed
- Extension automatically reloads on rebuild

### Package Management

- **Required**: Use pnpm (not npm/yarn)
- Lock file: pnpm-lock.yaml (committed to repository)
- Install: `pnpm install`
- Add dependency: `pnpm add <package>`
- Add dev dependency: `pnpm add -D <package>`

### Git Workflow

- Husky pre-commit hooks automatically format code
- lint-staged runs on: `*.{js,ts,svelte,css,json,md}`
- Follow semantic versioning
- Clean git history preferred

## Security & Environment

### Security Practices

- Never commit API keys, tokens, or credentials
- Use environment variables for secrets
- Keep credentials out of logs and output
- Chrome extension permissions are minimal and specific

### Environment Requirements

- Node.js with pnpm package manager
- Chrome/Chromium browser for testing
- GitHub account and personal access token for functionality
- Windows environment with PowerShell (per project rules)

## Dependencies

### Key Dependencies

- **Core**: svelte@^4.2.19, typescript@^5.6.3
- **Build**: vite@^4.5.5, @crxjs/vite-plugin@^2.0.0-beta.18
- **Styling**: tailwindcss@^3.4.15, bits-ui@^0.21.16
- **Testing**: vitest@^1.6.0, @vitest/coverage-v8@^3.2.4, @vitest/ui@^1.6.0, @testing-library/jest-dom@^6.6.3
- **Utilities**: fflate@^0.8.2, lucide-svelte@^0.460.1

### Version Compatibility

- No conflicting Svelte versions
- Pin dependency versions for stability
- Use official Svelte integrations where available
- Maintain compatibility with Chrome Extension APIs

## Performance Considerations

- Minimize bundle sizes with proper code splitting
- Optimize asset loading for extension context
- Use proper Chrome extension performance patterns
- Leverage Vite's optimization features
- Test in both light and dark modes
