# Rules for Effective End-to-End Testing

> **Note:** These rules apply to end-to-end testing with **Playwright** for Chrome extensions.
> For unit testing, see **[unit-testing-rules.md](./unit-testing-rules.md)**.
> For component testing, see **[component-testing-rules.md](./component-testing-rules.md)**.

**Testing Framework:** Playwright

---

1. **Test complete user journeys, not individual functions**

   - E2E tests verify entire workflows from user action to final outcome
   - Focus on critical paths users actually take through the application
   - Test realistic scenarios, not edge cases better suited for unit tests

2. **Use real browser environments**

   - Load the actual built extension, not mocked versions
   - Use real Chrome APIs and browser behavior
   - Interact with real DOM elements as users would
   - Test in conditions matching production deployment

3. **Minimize test brittleness**

   - Use stable selectors (data-testid, aria labels) over CSS classes or text content
   - Avoid testing implementation details or internal state
   - Build resilience to UI changes that don't affect user experience
   - Use Playwright's auto-waiting instead of manual waits when possible

4. **Keep tests independent and isolated**

   - Each test should start with clean state (fresh extension install or reset)
   - Tests must not depend on execution order
   - Clean up test data after each test (repositories, storage, tokens)
   - Use separate test accounts or ephemeral resources when possible

5. **Test what unit tests cannot**

   - Focus on browser-specific behaviors (extension APIs, downloads, notifications)
   - Test cross-component integration in real browser context
   - Verify visual rendering and user interaction flows
   - Test performance and timing-dependent behaviors

6. **Make tests deterministic**

   - Control external dependencies (use test repositories, mock external services)
   - Use fixed test data, not randomly generated values
   - Handle async operations properly with Playwright's waiting mechanisms
   - Avoid time-dependent assertions; use Playwright's retry logic

7. **Optimize for debugging**

   - Use descriptive test names that explain the complete user journey
   - Capture screenshots on failure automatically
   - Record videos for failed tests
   - Use Playwright traces for detailed debugging information
   - Structure tests to make failure points obvious

8. **Balance coverage with execution speed**

   - E2E tests are slow; test only what matters
   - Avoid duplicating scenarios better covered by unit tests
   - Focus on happy paths and critical error scenarios
   - Use parallelization for faster test execution
   - Aim for 5-15 key scenarios, not exhaustive coverage

9. **Handle flakiness proactively**

   - Use Playwright's built-in retry mechanisms for transient failures
   - Avoid race conditions with proper waiting strategies
   - Identify and fix root causes of flaky tests immediately
   - Monitor test reliability metrics over time
   - Remove or fix consistently flaky tests

10. **Use appropriate waiting strategies**

    - Leverage Playwright's auto-waiting for most scenarios
    - Use explicit waits for specific conditions (network idle, custom events)
    - Avoid arbitrary sleep/timeout calls
    - Wait for network requests to complete when testing API interactions
    - Wait for animations and transitions to finish

11. **Test authentication and authorization properly**

    - Use fixtures to set up authenticated states
    - Test the full authentication flow at least once
    - Reuse authenticated sessions across tests when appropriate
    - Use test accounts with appropriate permissions
    - Never use real user credentials in tests

12. **Manage test data effectively**

    - Create dedicated test environments separate from production
    - Use ephemeral test data when possible (created and destroyed per test)
    - Maintain reusable test fixtures for common scenarios
    - Clean up test artifacts to avoid resource accumulation
    - Version control test data files alongside tests

13. **Verify observable outcomes, not internal state**

    - Assert on what users see and experience
    - Check for success messages, notifications, UI updates
    - Verify data appears correctly in GitHub (or external systems)
    - Test error messages and feedback are user-friendly
    - Validate navigation and URL changes

14. **Handle Chrome extension specifics**

    - Test extension popup interactions (opening, closing, state persistence)
    - Verify content script injection and communication
    - Test background service worker lifecycle and restarts
    - Validate Chrome storage API persistence
    - Test extension permissions and API access

15. **Structure tests for maintainability**

    - Use Page Object Model or similar patterns for UI interactions
    - Extract common actions into reusable helper functions
    - Keep test files focused on single feature areas
    - Document complex test scenarios with comments
    - Review E2E tests during code reviews like production code

16. **Integrate with CI/CD thoughtfully**

    - Run E2E tests in separate CI jobs from unit tests
    - Configure appropriate timeouts for CI environments
    - Upload artifacts (screenshots, videos, traces) on failures
    - Use test retries in CI for transient infrastructure issues
    - Consider running E2E tests on schedule for stability checks

17. **Test error scenarios users will encounter**

    - Verify network failure handling and user feedback
    - Test permission denial and authorization errors
    - Validate rate limiting and quota exceeded scenarios
    - Check recovery from failed operations
    - Ensure error messages guide users to resolution

18. **Document test scenarios clearly**

    - Tests should serve as living documentation of user workflows
    - Use test descriptions that explain business value
    - Maintain a test plan document mapping coverage
    - Update documentation when user flows change
    - Include setup prerequisites in test file comments

19. **Respect the test pyramid**

    - E2E tests are the tip of the pyramid (fewest tests, highest value)
    - Don't use E2E tests to verify logic better suited for unit tests
    - Keep E2E test count low and focused on integration points
    - Push detailed validation down to unit/component test layers
    - Use E2E tests to validate the complete system works together

20. **Monitor and maintain test health**
    - Track test execution time and optimize slow tests
    - Review test failures promptly and fix root causes
    - Remove obsolete tests when features are deprecated
    - Update tests when user workflows change
    - Regularly assess whether E2E tests are providing value

These rules help ensure E2E tests provide meaningful validation of critical user journeys while remaining maintainable, reliable, and valuable additions to your testing strategy.
