Use behavior tests to discover bugs in $ARGUMENTS:

1. **Write Comprehensive Behavior Tests**:

   - Test expected behavior based on user requirements
   - Don't look at implementation details first
   - Focus on what should happen, not how it's implemented

2. **Run Tests and Analyze Failures**:

   - Document unexpected failures and behaviors
   - Categorize bugs: logic errors, integration issues, edge cases
   - Prioritize by user impact and frequency

3. **Bug Reproduction Tests**:

   - Create specific tests that consistently reproduce each bug
   - Isolate root causes through test granularity
   - Document expected vs actual behavior

4. **Create Bug Catalog**:
   - Link each bug to specific test failure
   - Estimate fix complexity and impact
   - Plan fix strategy that maintains test coverage
