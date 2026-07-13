export type PrsIgnoreRule = {
  pattern: string;
  reason: string;
  retainAsMetadata?: boolean;
};

const PACKAGE_LOCKFILES = new Set([
  'bun.lock',
  'bun.lockb',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const DEFAULT_PRS_IGNORE_RULES: readonly PrsIgnoreRule[] = [
  { pattern: 'node_modules/**', reason: 'Installed dependencies' },
  { pattern: '.git/**', reason: 'Git metadata' },
  { pattern: 'dist/**', reason: 'Generated distribution output' },
  { pattern: 'build/**', reason: 'Generated build output' },
  { pattern: '.next/**', reason: 'Generated Next.js output' },
  { pattern: '.turbo/**', reason: 'Generated Turborepo cache' },
  { pattern: 'coverage/**', reason: 'Generated coverage output' },
  { pattern: '.cache/**', reason: 'Generated tool cache' },
  { pattern: 'tmp/**', reason: 'Temporary files' },
  { pattern: '.DS_Store', reason: 'Operating-system metadata' },
];

function normalizeRulePath(path: string): string {
  let normalized = path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/');

  if (normalized.startsWith('project/')) {
    normalized = normalized.slice('project/'.length);
  }

  return normalized.replace(/^\/+|\/+$/g, '');
}

function isPackageLockfile(path: string): boolean {
  const basename = path.split('/').at(-1);
  return basename !== undefined && PACKAGE_LOCKFILES.has(basename);
}

function matchesRule(path: string, pattern: string): boolean {
  const normalizedPattern = normalizeRulePath(pattern);

  if (normalizedPattern.endsWith('/**')) {
    const directory = normalizedPattern.slice(0, -3);
    return (
      path === directory || path.startsWith(`${directory}/`) || path.includes(`/${directory}/`)
    );
  }

  return path === normalizedPattern || path.endsWith(`/${normalizedPattern}`);
}

export function findPrsIgnoreRule(
  path: string,
  additionalRules: readonly PrsIgnoreRule[] | undefined = undefined
): PrsIgnoreRule | undefined {
  const normalizedPath = normalizeRulePath(path);

  if (!normalizedPath || isPackageLockfile(normalizedPath)) {
    return undefined;
  }

  return [...DEFAULT_PRS_IGNORE_RULES, ...(additionalRules ?? [])].find((rule) =>
    matchesRule(normalizedPath, rule.pattern)
  );
}

export function shouldAnalyzePath(path: string): boolean {
  return findPrsIgnoreRule(path) === undefined;
}
