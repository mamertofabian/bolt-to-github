# Bolt Export Receipt

Readiness: Yellow
Confidence: Medium
Generated: 2026-07-07T00:00:00.000Z
Repository: codefrost-dev/sample-bolt-project
Compared against: refs/heads/main@base-sha
Candidate export: auth-env-change

## Summary

Production-sensitive areas changed.

Review authentication and environment configuration.

## Change metrics

- Files changed: 1
- Files added: 1
- Files deleted: 0
- Binary files changed: 0
- Sensitive files changed: 2
- Package manifest changed: No
- Lockfile changed: No
- Environment example changed: Yes
- Public route surface changed: No

## Top concerns

1. Authentication changed.
2. A sensitive value was redacted.

## Safe-looking areas

- No dependencies changed.

## Limitations

- Historical comparison was unavailable.
- This is a static readiness snapshot. It does not run the app, execute tests, or prove correctness.
