import type { EvidenceRef } from './domain';

const REDACTED_VALUE = '[REDACTED]';

export function redactSensitiveValue(_value: string): string {
  return REDACTED_VALUE;
}

export function redactEvidenceRef(evidence: EvidenceRef): EvidenceRef {
  const redactedEvidence = { ...evidence };
  let redacted = false;

  if (typeof evidence.before === 'string') {
    redactedEvidence.before = redactSensitiveValue(evidence.before);
    redacted = true;
  }

  if (typeof evidence.after === 'string') {
    redactedEvidence.after = redactSensitiveValue(evidence.after);
    redacted = true;
  }

  if (redacted) {
    redactedEvidence.redacted = true;
  }

  return redactedEvidence;
}
