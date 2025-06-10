Create behavior-focused tests for $ARGUMENTS service:

1. Identify the main behaviors/use cases this service provides
2. Create integration tests that exercise real dependencies where possible
3. Use test doubles only for external systems (GitHub API, Chrome storage)
4. Test both success and failure scenarios
5. Verify end state changes, not method invocations
6. Include edge cases and boundary conditions
7. Write tests that would catch real bugs, not just verify implementation

Remember: Test what the service DOES, not HOW it does it.
