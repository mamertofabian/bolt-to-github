Perform test-driven refactoring for $ARGUMENTS:

1. **Pre-Refactoring Validation**:

   - Ensure all behavior tests pass
   - Document current behavior expectations
   - Create additional tests for unclear areas

2. **Incremental Refactoring**:

   - Make small changes while keeping tests green
   - Refactor implementation without changing behavior
   - Add tests for new edge cases discovered during refactoring

3. **Post-Refactoring Verification**:

   - Verify all original behavior is preserved
   - Ensure new code maintains test coverage
   - Validate performance and reliability improvements

4. **Bug Fix Integration**:
   - Fix bugs identified through testing
   - Add regression tests for each bug fix
   - Verify fixes don't break existing functionality
