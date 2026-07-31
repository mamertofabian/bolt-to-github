export type PublicSurfaceHint =
  | 'api'
  | 'admin'
  | 'upload'
  | 'billing'
  | 'webhook'
  | 'auth'
  | 'login'
  | 'signup'
  | 'dashboard'
  | 'settings'
  | 'callback'
  | 'form'
  | 'cors'
  | 'middleware'
  | 'public_asset';

export interface PublicRouteEvidence {
  routePath: string;
  sourcePath: string;
  hints: PublicSurfaceHint[];
  status: 'added' | 'changed' | 'deleted' | 'renamed';
}

const ROUTE_FILE_EXTENSION = '[.](?:[cm]?[jt]sx?)';
const NEXT_ROUTE_HANDLER_EXTENSION = '[.](?:js|ts)';
const API_HANDLER_EXTENSION = '[.](?:[cm]?js|ts)';
const TEST_FILE_SUFFIX = /(?:[.](?:test|spec)|[.]d)[.][cm]?[jt]sx?$/u;

const HINT_ORDER: readonly PublicSurfaceHint[] = [
  'api',
  'admin',
  'billing',
  'webhook',
  'auth',
  'login',
  'signup',
  'dashboard',
  'settings',
  'callback',
  'upload',
  'form',
  'cors',
  'middleware',
  'public_asset',
];

const PATH_SEGMENT_HINTS: readonly {
  hint: PublicSurfaceHint;
  pattern: RegExp;
}[] = [
  { hint: 'admin', pattern: /(?:^|\/)admin(?:\/|$)/u },
  { hint: 'upload', pattern: /(?:^|\/)uploads?(?:\/|[._-]|$)/u },
  { hint: 'billing', pattern: /(?:^|\/)billing(?:\/|[._-]|$)/u },
  { hint: 'webhook', pattern: /(?:^|\/)webhooks?(?:\/|[._-]|$)/u },
  { hint: 'auth', pattern: /(?:^|\/)auth(?:\/|[._-]|$)/u },
  { hint: 'login', pattern: /(?:^|\/)(?:log-in|login|signin|sign-in)(?:\/|[._-]|$)/u },
  { hint: 'signup', pattern: /(?:^|\/)(?:sign-up|signup|register)(?:\/|[._-]|$)/u },
  { hint: 'dashboard', pattern: /(?:^|\/)dashboard(?:\/|[._-]|$)/u },
  { hint: 'settings', pattern: /(?:^|\/)settings(?:\/|[._-]|$)/u },
  { hint: 'callback', pattern: /(?:^|\/)callbacks?(?:\/|[._-]|$)/u },
];

function normalizeFilePath(filePath: string): string {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^(?:[.][/])+/, '')
    .replace(/^\/+/, '');
}

function normalizeRouteSegments(segments: readonly string[]): string {
  const publicSegments = segments.filter(
    (segment) =>
      segment.length > 0 &&
      segment !== 'index' &&
      !segment.startsWith('@') &&
      !(segment.startsWith('(') && segment.endsWith(')'))
  );
  return publicSegments.length === 0 ? '/' : `/${publicSegments.join('/')}`;
}

function stripRouteExtension(path: string): string {
  return path.replace(new RegExp(`${ROUTE_FILE_EXTENSION}$`, 'u'), '');
}

export function normalizePublicRoutePath(filePath: string): string | null {
  const normalized = normalizeFilePath(filePath);
  if (TEST_FILE_SUFFIX.test(normalized)) {
    return null;
  }

  const appMatch =
    normalized.match(new RegExp(`^(?:src/)?app/(?:(.*)/)?page${ROUTE_FILE_EXTENSION}$`, 'u')) ??
    normalized.match(
      new RegExp(`^(?:src/)?app/(?:(.*)/)?route${NEXT_ROUTE_HANDLER_EXTENSION}$`, 'u')
    );
  if (appMatch) {
    return normalizeRouteSegments((appMatch[1] ?? '').split('/'));
  }

  const pagesMatch = normalized.match(
    new RegExp(`^(?:src/)?pages/(.+)${ROUTE_FILE_EXTENSION}$`, 'u')
  );
  if (pagesMatch?.[1]) {
    const routeFile = pagesMatch[1];
    if (/^_(?:app|document|error)$/u.test(routeFile)) {
      return null;
    }
    return normalizeRouteSegments(stripRouteExtension(routeFile).split('/'));
  }

  const apiMatch = normalized.match(
    new RegExp(`^(?:(?:src|server)/)?api/(.+)${API_HANDLER_EXTENSION}$`, 'u')
  );
  if (apiMatch?.[1]) {
    return normalizeRouteSegments(['api', ...stripRouteExtension(apiMatch[1]).split('/')]);
  }

  const functionsMatch = normalized.match(
    new RegExp(`^(?:(?:src|netlify|supabase)/)?functions/(.+)${API_HANDLER_EXTENSION}$`, 'u')
  );
  if (functionsMatch?.[1]) {
    return normalizeRouteSegments([
      'functions',
      ...stripRouteExtension(functionsMatch[1]).split('/'),
    ]);
  }

  return null;
}

export function classifyPublicSurfaceHints(
  filePath: string,
  content: string | undefined
): PublicSurfaceHint[] {
  const normalized = normalizeFilePath(filePath).toLowerCase();
  if (TEST_FILE_SUFFIX.test(normalized)) {
    return [];
  }
  const hints = new Set<PublicSurfaceHint>();
  const routePath = normalizePublicRoutePath(normalized);
  const logicalRoutePath = filePath.replaceAll('\\', '/').trim();
  const logicalApiRoute = /^\/(?:api|functions)(?:\/|$)/u.test(logicalRoutePath);
  const nextRouteHandler = /(?:^|\/)route[.](?:js|ts)$/u.test(normalized);
  const serverEndpoint =
    /(?:^|\/)server\/.*(?:webhooks?|callbacks?|handlers?|endpoints?|routes?)(?:\/|[._-]|$)/u.test(
      normalized
    ) && new RegExp(`${API_HANDLER_EXTENSION}$`, 'u').test(normalized);

  if (
    routePath === '/api' ||
    routePath?.startsWith('/api/') ||
    routePath === '/functions' ||
    routePath?.startsWith('/functions/') ||
    logicalApiRoute ||
    nextRouteHandler ||
    serverEndpoint
  ) {
    hints.add('api');
  }
  for (const rule of PATH_SEGMENT_HINTS) {
    if (rule.pattern.test(normalized)) {
      hints.add(rule.hint);
    }
  }
  if (normalized.startsWith('public/')) {
    hints.add('public_asset');
  }
  if (/(?:^|\/)middleware[.][cm]?[jt]sx?$/u.test(normalized)) {
    hints.add('middleware');
  }

  if (content !== undefined) {
    if (/<input\b[^>]*\btype\s*=\s*["']file["']/iu.test(content)) {
      hints.add('upload');
    }
    if (/<form\b/iu.test(content)) {
      hints.add('form');
    }
    if (
      /access-control-allow-(?:origin|headers|methods)/iu.test(content) ||
      /\bcors\s*\(/iu.test(content)
    ) {
      hints.add('cors');
    }
  }

  return HINT_ORDER.filter((hint) => hints.has(hint));
}
