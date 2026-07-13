export type SecretPatternClass =
  | 'credential_assignment'
  | 'provider_key_prefix'
  | 'private_key_block'
  | 'high_entropy_literal';

export interface SecretPatternMatch {
  pattern: SecretPatternClass;
  redacted: true;
}

const PATTERN_ORDER: readonly SecretPatternClass[] = [
  'credential_assignment',
  'provider_key_prefix',
  'private_key_block',
  'high_entropy_literal',
];

const QUOTED_CREDENTIAL_ASSIGNMENT =
  /^\s*(?:(?:export\s+)?(?:const|let|var)\s+)?["']?([A-Za-z_$][A-Za-z0-9_$-]{0,127})["']?(?:\s*:\s*[^=\r\n"'`]{1,256})?\s*([=:])\s*(["'`])([^\r\n"'`]{8,4096})\3\s*[,;]?\s*$/;
const LINE_CREDENTIAL_ASSIGNMENT =
  /^\s*(?:export\s+)?["']?([A-Za-z_][A-Za-z0-9_-]{0,127})["']?\s*([=:])\s*([^#\r\n,;]{8,4096})\s*[,;]?\s*$/;
const PROVIDER_KEY_PREFIX =
  /\b(?:sk-(?:live|test|proj)-[A-Za-z0-9_-]{16,}|sk_live_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{16,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/g;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const QUOTED_OPAQUE_LITERAL = /(['"`])([A-Za-z0-9+/_=-]{32,})\1/g;

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('placeholder') ||
    normalized.includes('your-') ||
    normalized.includes('your_') ||
    normalized.includes('example') ||
    normalized.includes('sample') ||
    normalized.includes('dummy') ||
    normalized.includes('changeme') ||
    normalized.includes('change-me') ||
    normalized.includes('replace-me') ||
    normalized.includes('redacted') ||
    normalized === 'todo' ||
    normalized === 'test'
  );
}

function isCredentialName(name: string): boolean {
  const normalized = name.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return ['apikey', 'token', 'secret', 'password', 'privatekey', 'clientsecret', 'accesskey'].some(
    (suffix) => normalized === suffix || normalized.endsWith(suffix)
  );
}

function isNonLiteralCodeReference(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^(["'`])([\s\S]*)\1$/, '$2')
    .trim();
  return (
    /^(?:process|import)\./.test(normalized) ||
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(normalized) ||
    /[(){}[\]$]/.test(normalized)
  );
}

function isPlausibleUnquotedLiteral(value: string, operator: string): boolean {
  if (isNonLiteralCodeReference(value)) {
    return false;
  }
  if (operator === ':') {
    if (/\s|[<>{}[\]|&?]/.test(value)) {
      return false;
    }
    if (
      /^(?:any|bigint|boolean|never|null|number|object|string|symbol|undefined|unknown|void)$/i.test(
        value
      )
    ) {
      return false;
    }
    if (!/\d|[-_./+=:@\\]/.test(value)) {
      return false;
    }
  }
  return true;
}

type TypeOnlyContext = {
  termination: 'brace' | 'semicolon';
  braceDepth: number;
  sawBrace: boolean;
};

function typeOnlyTermination(line: string): TypeOnlyContext['termination'] | undefined {
  const trimmed = line.trim();
  if (/^(?:(?:export|declare)\s+)*interface\b/.test(trimmed)) {
    return 'brace';
  }
  if (/^(?:(?:export|declare)\s+)*type\b/.test(trimmed)) {
    return 'semicolon';
  }
  if (
    /^(?:export\s+)?declare\s+(?:const|let|var|class|function|namespace|module|enum)\b/.test(
      trimmed
    )
  ) {
    return 'semicolon';
  }
  return undefined;
}

function braceDelta(line: string): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  let quote: "'" | '"' | '`' | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '{') {
      opens += 1;
    } else if (character === '}') {
      closes += 1;
    } else if (character === '/' && line[index + 1] === '/') {
      break;
    }
  }
  return { opens, closes };
}

function isTypeContinuation(line: string | undefined): boolean {
  return line !== undefined && /^[|&?:]/.test(line.trimStart());
}

function isTypeTriviaLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed === '*/'
  );
}

function advanceTypeOnlyContext(
  context: TypeOnlyContext,
  line: string,
  nextLine: string | undefined
): boolean {
  if (isTypeTriviaLine(line)) {
    return true;
  }
  const { opens, closes } = braceDelta(line);
  context.sawBrace ||= opens > 0;
  context.braceDepth += opens - closes;
  if (context.termination === 'brace') {
    return !(context.sawBrace && context.braceDepth <= 0);
  }
  if (context.braceDepth > 0) {
    return true;
  }
  const trimmed = line.trimEnd();
  if (trimmed.endsWith(';')) {
    return false;
  }
  if (context.sawBrace) {
    return isTypeContinuation(nextLine);
  }
  return /[=|&?:]$/.test(trimmed) || isTypeContinuation(nextLine);
}

function hasCredentialAssignment(sourceText: string): boolean {
  let typeOnlyContext: TypeOnlyContext | undefined;
  const lines = sourceText.split(/\r?\n/);
  const nextSignificantLines = new Array<string | undefined>(lines.length);
  let nextSignificantLine: string | undefined;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    nextSignificantLines[index] = nextSignificantLine;
    if (!isTypeTriviaLine(lines[index])) {
      nextSignificantLine = lines[index];
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = nextSignificantLines[index];
    if (typeOnlyContext) {
      if (!advanceTypeOnlyContext(typeOnlyContext, line, nextLine)) {
        typeOnlyContext = undefined;
      }
      continue;
    }
    const termination = typeOnlyTermination(line);
    if (termination) {
      const nextContext: TypeOnlyContext = { termination, braceDepth: 0, sawBrace: false };
      if (advanceTypeOnlyContext(nextContext, line, nextLine)) {
        typeOnlyContext = nextContext;
      }
      continue;
    }

    const quotedMatch = line.match(QUOTED_CREDENTIAL_ASSIGNMENT);
    const name = quotedMatch?.[1];
    const value = quotedMatch?.[4];
    if (name && value && isCredentialName(name) && !isPlaceholder(value)) {
      return true;
    }

    const lineMatch = line.match(LINE_CREDENTIAL_ASSIGNMENT);
    const lineName = lineMatch?.[1];
    const operator = lineMatch?.[2];
    const lineValue = lineMatch?.[3]?.trim();
    if (
      lineName &&
      operator &&
      lineValue &&
      isCredentialName(lineName) &&
      !isPlaceholder(lineValue) &&
      isPlausibleUnquotedLiteral(lineValue, operator)
    ) {
      return true;
    }
  }
  return false;
}

function hasProviderKeyPrefix(sourceText: string): boolean {
  for (const match of sourceText.matchAll(PROVIDER_KEY_PREFIX)) {
    const value = match[0];
    if (value && !isPlaceholder(value)) {
      return true;
    }
  }
  return false;
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function hasHighEntropyLiteral(sourceText: string): boolean {
  for (const match of sourceText.matchAll(QUOTED_OPAQUE_LITERAL)) {
    const value = match[2];
    if (
      value &&
      !isPlaceholder(value) &&
      /[A-Za-z]/.test(value) &&
      /\d/.test(value) &&
      shannonEntropy(value) >= 3.5
    ) {
      return true;
    }
  }
  return false;
}

export function detectSecretLikePatterns(sourceText: string): SecretPatternMatch[] {
  const detected = new Set<SecretPatternClass>();
  if (hasCredentialAssignment(sourceText)) {
    detected.add('credential_assignment');
  }
  if (hasProviderKeyPrefix(sourceText)) {
    detected.add('provider_key_prefix');
  }
  if (PRIVATE_KEY_BLOCK.test(sourceText)) {
    detected.add('private_key_block');
  }
  if (hasHighEntropyLiteral(sourceText)) {
    detected.add('high_entropy_literal');
  }

  return PATTERN_ORDER.filter((pattern) => detected.has(pattern)).map((pattern) => ({
    pattern,
    redacted: true,
  }));
}
