import type { EvidenceRef } from './domain';

const REDACTED_VALUE = '[REDACTED]';

/**
 * Mask a value that a detector has already classified as sensitive.
 * Classification deliberately remains outside this lowest-level privacy boundary.
 */
export function redactSensitiveValue(value: string): string {
  void value;
  return REDACTED_VALUE;
}

/**
 * Return a redacted copy without mutating or dropping useful evidence context.
 */
export function redactEvidenceRef(evidence: EvidenceRef): EvidenceRef {
  const { before, after, ...context } = evidence;
  const redactedEvidence: EvidenceRef = {
    ...context,
    redacted: true,
  };

  if (before !== undefined) {
    redactedEvidence.before = redactSensitiveValue(String(before));
  }

  if (after !== undefined) {
    redactedEvidence.after = redactSensitiveValue(String(after));
  }

  return redactedEvidence;
}
