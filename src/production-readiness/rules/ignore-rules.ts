export type PrsIgnoreRule = {
  pattern: string;
  reason: string;
  retainAsMetadata?: boolean;
};

const DEFAULT_IGNORE_RULES: readonly PrsIgnoreRule[] = [
  { pattern: '**/node_modules/**', reason: 'Installed dependencies are vendor output.' },
  { pattern: '**/.git/**', reason: 'Git internals are not project source.' },
  { pattern: '**/dist/**', reason: 'Distribution bundles are generated output.' },
  { pattern: '**/build/**', reason: 'Build directories are generated output.' },
  { pattern: '**/.next/**', reason: 'Next.js build output is generated.' },
  { pattern: '**/.turbo/**', reason: 'Turborepo cache output is generated.' },
  { pattern: '**/coverage/**', reason: 'Coverage reports are generated output.' },
  { pattern: '**/.cache/**', reason: 'Cache directories are generated output.' },
  { pattern: '**/tmp/**', reason: 'Temporary directories are not project source.' },
  { pattern: '**/.DS_Store', reason: 'macOS filesystem metadata is not project source.' },
  { pattern: '**/*.min.js', reason: 'Minified JavaScript is generated output.' },
  { pattern: '**/*.min.css', reason: 'Minified CSS is generated output.' },
];

function globToRegExp(pattern: string): RegExp {
  let expression = '^';

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      expression += '[^/]*';
      continue;
    }

    if ('\\^$+?.()|{}[]'.includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }

  return new RegExp(`${expression}$`);
}

const COMPILED_IGNORE_RULES = DEFAULT_IGNORE_RULES.map((rule) => ({
  expression: globToRegExp(rule.pattern),
  rule,
}));

export function shouldAnalyzePath(path: string): boolean {
  const normalizedPath = path.replaceAll('\\', '/').replace(/^\.?\//, '');
  return !COMPILED_IGNORE_RULES.some(({ expression }) => expression.test(normalizedPath));
}
