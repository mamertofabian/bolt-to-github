export interface SecretPatternMatch {
  pattern: string;
  redacted: true;
}

interface SecretPatternRule {
  label: string;
  matches(sourceText: string): boolean;
}

const QUOTED_CREDENTIAL_PROPERTY =
  /(["'])([A-Za-z_$][A-Za-z0-9_$-]*)\1\s*:\s*(["'`])([^"'`\r\n]{8,})\3/g;
const TYPED_CREDENTIAL_ASSIGNMENT =
  /\b([A-Za-z_$][A-Za-z0-9_$-]*)\s*:\s*[A-Za-z_$][A-Za-z0-9_$.<>[\]|&? ]*\s*=\s*(["'`])([^"'`\r\n]{8,})\2/g;
const UNTYPED_CREDENTIAL_ASSIGNMENT =
  /\b([A-Za-z_$][A-Za-z0-9_$-]*)\s*[:=]\s*(["'`])([^"'`\r\n]{8,})\2/g;
const PROVIDER_KEY_PREFIX =
  /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[A-Z0-9]{16})\b/;
const PEM_PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
const LONG_QUOTED_VALUE = /(["'`])([A-Za-z0-9+/_=-]{28,})\1/g;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function isHighEntropyValue(value: string): boolean {
  return (
    value.length >= 28 &&
    /^[A-Za-z0-9+/_=-]+$/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    shannonEntropy(value) >= 4.5
  );
}

function isCredentialName(name: string): boolean {
  const tokens = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  const credentialTokens = new Set(['credential', 'password', 'secret', 'token']);

  return (
    tokens.some((token) => credentialTokens.has(token)) ||
    tokens.some(
      (token, index) =>
        token === 'key' && ['access', 'api', 'private', 'secret'].includes(tokens[index - 1] ?? '')
    )
  );
}

function hasSecretLikeCredentialAssignment(sourceText: string): boolean {
  const assignmentRules = [
    { pattern: QUOTED_CREDENTIAL_PROPERTY, nameIndex: 2, valueIndex: 4 },
    { pattern: TYPED_CREDENTIAL_ASSIGNMENT, nameIndex: 1, valueIndex: 3 },
    { pattern: UNTYPED_CREDENTIAL_ASSIGNMENT, nameIndex: 1, valueIndex: 3 },
  ] as const;

  for (const rule of assignmentRules) {
    rule.pattern.lastIndex = 0;
    for (const match of sourceText.matchAll(rule.pattern)) {
      const name = match[rule.nameIndex] ?? '';
      const value = match[rule.valueIndex] ?? '';
      if (
        isCredentialName(name) &&
        (PROVIDER_KEY_PREFIX.test(value) ||
          PEM_PRIVATE_KEY.test(value) ||
          isHighEntropyValue(value))
      ) {
        return true;
      }
    }
  }
  return false;
}

const SECRET_PATTERN_RULES: readonly SecretPatternRule[] = [
  {
    label: 'credential-assignment',
    matches: hasSecretLikeCredentialAssignment,
  },
  {
    label: 'high-entropy-config-value',
    matches: (sourceText) => {
      LONG_QUOTED_VALUE.lastIndex = 0;
      for (const match of sourceText.matchAll(LONG_QUOTED_VALUE)) {
        const value = match[2] ?? '';
        if (isHighEntropyValue(value)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    label: 'pem-private-key',
    matches: (sourceText) => PEM_PRIVATE_KEY.test(sourceText),
  },
  {
    label: 'provider-key-prefix',
    matches: (sourceText) => PROVIDER_KEY_PREFIX.test(sourceText),
  },
];

export function detectSecretLikePatterns(sourceText: string): SecretPatternMatch[] {
  return SECRET_PATTERN_RULES.filter((rule) => rule.matches(sourceText)).map((rule) => ({
    pattern: rule.label,
    redacted: true,
  }));
}
