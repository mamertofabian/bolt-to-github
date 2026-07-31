import { describe, expect, it } from 'vitest';

import type { FileDiffEntry } from '../../diff/diffEngine';
import {
  detectPublicSurfaceSignals,
  type PublicSurfaceDetectionResult,
  type PublicSurfaceDetectorInput,
} from '../publicSurfaceDetector';
import {
  classifyPublicSurfaceHints,
  normalizePublicRoutePath,
  type PublicRouteEvidence,
  type PublicSurfaceHint,
} from '../../rules/public-surface-rules';

function changedFile(
  path: string,
  status: Exclude<FileDiffEntry['status'], 'indeterminate'> = 'changed',
  previousPath?: string
): FileDiffEntry {
  return {
    path,
    previousPath,
    status,
    binary: false,
    lineDiffEligible: true,
  };
}

function input(
  changedFiles: FileDiffEntry[],
  candidateFiles: PublicSurfaceDetectorInput['candidateFiles'] = []
): PublicSurfaceDetectorInput {
  return { changedFiles, candidateFiles };
}

describe('Production Readiness Snapshot public surface detector', () => {
  it('normalizes next app and pages routes to public paths', () => {
    expect(normalizePublicRoutePath('app/page.tsx')).toBe('/');
    expect(normalizePublicRoutePath('src/app/(marketing)/pricing/page.tsx')).toBe('/pricing');
    expect(normalizePublicRoutePath('app/api/contact/route.ts')).toBe('/api/contact');
    expect(normalizePublicRoutePath('src/app/dashboard/[id]/page.jsx')).toBe('/dashboard/[id]');
    expect(normalizePublicRoutePath('pages/index.tsx')).toBe('/');
    expect(normalizePublicRoutePath('src/pages/blog/[slug].tsx')).toBe('/blog/[slug]');
    expect(normalizePublicRoutePath('pages/api/contact.ts')).toBe('/api/contact');
    expect(normalizePublicRoutePath('src/pages/api/users/index.ts')).toBe('/api/users');
    expect(normalizePublicRoutePath('server/api/users.ts')).toBe('/api/users');
    expect(normalizePublicRoutePath('netlify/functions/notify.ts')).toBe('/functions/notify');

    expect(normalizePublicRoutePath('app/dashboard/layout.tsx')).toBeNull();
    expect(normalizePublicRoutePath('app/homepage.tsx')).toBeNull();
    expect(normalizePublicRoutePath('app/preroute.ts')).toBeNull();
    expect(normalizePublicRoutePath('app/api/users/route.tsx')).toBeNull();
    expect(normalizePublicRoutePath('app/api/users/route.jsx')).toBeNull();
    expect(normalizePublicRoutePath('pages/_app.tsx')).toBeNull();
    expect(normalizePublicRoutePath('src/pages/_document.tsx')).toBeNull();
    expect(normalizePublicRoutePath('pages/_error.tsx')).toBeNull();
    expect(normalizePublicRoutePath('pages/account.test.tsx')).toBeNull();
    expect(normalizePublicRoutePath('functions/readme.md')).toBeNull();
  });

  it('detects newly added api routes', () => {
    const changedFiles = [
      changedFile('src/app/api/contact/route.ts', 'added'),
      changedFile('api/health.ts', 'added'),
      changedFile('netlify/functions/notify.ts', 'added'),
      changedFile('server/api/users.ts', 'added'),
      changedFile('server/webhook.ts', 'added'),
      changedFile('src/app/api/existing/route.ts', 'changed'),
    ];
    const result: PublicSurfaceDetectionResult = detectPublicSurfaceSignals(
      input(
        changedFiles,
        changedFiles.map(({ path }) => ({ path, content: 'export async function POST() {}' }))
      )
    );

    expect(result.routes).toEqual([
      {
        routePath: '/api/contact',
        sourcePath: 'src/app/api/contact/route.ts',
        hints: ['api'],
        status: 'added',
      },
      {
        routePath: '/api/existing',
        sourcePath: 'src/app/api/existing/route.ts',
        hints: ['api'],
        status: 'changed',
      },
      {
        routePath: '/api/health',
        sourcePath: 'api/health.ts',
        hints: ['api'],
        status: 'added',
      },
      {
        routePath: '/api/users',
        sourcePath: 'server/api/users.ts',
        hints: ['api'],
        status: 'added',
      },
      {
        routePath: '/functions/notify',
        sourcePath: 'netlify/functions/notify.ts',
        hints: ['api'],
        status: 'added',
      },
    ]);

    const addedApiSignal = result.signals.find((signal) => signal.id === 'public-api-route-added');
    expect(addedApiSignal).toMatchObject({
      category: 'public_surface',
      severity: 'high',
      deterministic: true,
    });
    expect(addedApiSignal?.evidence.map((evidence) => evidence.label)).toEqual([
      '/api/contact',
      '/api/health',
      '/api/users',
      '/functions/notify',
      'api surface change',
    ]);
    expect(
      addedApiSignal?.evidence.slice(0, -1).every((evidence) => evidence.kind === 'route')
    ).toBe(true);
    expect(addedApiSignal?.evidence.at(-1)).toEqual({
      kind: 'file',
      label: 'api surface change',
      path: 'server/webhook.ts',
    });
    for (const ordinaryServerPath of [
      'server/config.ts',
      'src/server/cache.ts',
      'server/readme.md',
      'functions/readme.md',
      'src/admin.test.ts',
      'server/webhook.test.ts',
      'server/routes.test.ts',
      'server/routes.d.ts',
    ]) {
      expect(classifyPublicSurfaceHints(ordinaryServerPath, undefined)).toEqual([]);
    }
    expect(result.signals.some((signal) => /reachable|deployed/i.test(signal.message))).toBe(false);

    const nonRuntimeResult = detectPublicSurfaceSignals(
      input(
        [
          changedFile('src/admin.test.ts'),
          changedFile('server/webhook.test.ts'),
          changedFile('server/routes.d.ts'),
        ],
        [
          { path: 'src/admin.test.ts', content: '<Route path="/admin" />' },
          { path: 'server/webhook.test.ts', content: "const route = { path: '/webhook' };" },
          { path: 'server/routes.d.ts', content: "type Route = { path: '/api/internal' };" },
        ]
      )
    );
    expect(nonRuntimeResult).toEqual({ signals: [], routes: [] });
  });

  it('emits surface hints for admin upload webhook billing auth and dashboard paths', () => {
    const paths = [
      'app/admin/page.tsx',
      'app/upload/page.tsx',
      'app/webhook/route.ts',
      'app/billing/page.tsx',
      'app/auth/callback/route.ts',
      'app/login/page.tsx',
      'app/signup/page.tsx',
      'app/dashboard/page.tsx',
      'app/settings/page.tsx',
    ];
    const result: PublicSurfaceDetectionResult = detectPublicSurfaceSignals(
      input(
        paths.map((path) => changedFile(path)),
        paths.map((path) => ({ path, content: '' }))
      )
    );

    expect(
      Object.fromEntries(result.routes.map((route) => [route.routePath, route.hints]))
    ).toEqual({
      '/admin': ['admin'],
      '/auth/callback': ['api', 'auth', 'callback'],
      '/billing': ['billing'],
      '/dashboard': ['dashboard'],
      '/login': ['login'],
      '/settings': ['settings'],
      '/signup': ['signup'],
      '/upload': ['upload'],
      '/webhook': ['api', 'webhook'],
    });

    for (const hint of [
      'admin',
      'auth',
      'billing',
      'callback',
      'dashboard',
      'login',
      'settings',
      'signup',
      'upload',
      'webhook',
    ]) {
      expect(result.signals.map((signal) => signal.id)).toContain(`public-surface-${hint}-changed`);
    }

    const authHints: PublicSurfaceHint[] = ['api', 'auth', 'callback'];
    const authRoute: PublicRouteEvidence | undefined = result.routes.find(
      (route) => route.routePath === '/auth/callback'
    );
    expect(authRoute?.hints).toEqual(authHints);
  });

  it('detects route declarations public assets cors and middleware hints', () => {
    const privateSourceValue = 'request-body-must-not-appear-in-evidence';
    const changedFiles = [
      changedFile('src/App.tsx'),
      changedFile('public/robots.txt', 'added'),
      changedFile('src/cors.config.ts'),
      changedFile('src/middleware.ts'),
    ];
    const result: PublicSurfaceDetectionResult = detectPublicSurfaceSignals(
      input(changedFiles, [
        {
          path: 'src/App.tsx',
          content: `
            const routes = [
              { path: '/support', element: <Support /> },
              { path: '/admin', element: <Admin /> },
              { path: '/login', element: <Login /> },
            ];
            export const form = <form><input type="file" /></form>;
            const privateValue = '${privateSourceValue}';
          `,
        },
        { path: 'public/robots.txt', content: 'User-agent: *' },
        {
          path: 'src/cors.config.ts',
          content: "headers.set('Access-Control-Allow-Origin', allowedOrigin);",
        },
        {
          path: 'src/middleware.ts',
          content: 'export function middleware(request: NextRequest): NextResponse {}',
        },
      ])
    );

    expect(result.routes).toEqual([
      {
        routePath: '/admin',
        sourcePath: 'src/App.tsx',
        hints: ['admin', 'upload', 'form'],
        status: 'changed',
      },
      {
        routePath: '/login',
        sourcePath: 'src/App.tsx',
        hints: ['login', 'upload', 'form'],
        status: 'changed',
      },
      {
        routePath: '/support',
        sourcePath: 'src/App.tsx',
        hints: ['upload', 'form'],
        status: 'changed',
      },
    ]);
    expect(result.signals.map((signal) => signal.id)).toEqual(
      expect.arrayContaining([
        'public-assets-changed',
        'public-cors-changed',
        'public-middleware-changed',
        'public-route-surface-changed',
        'public-surface-admin-changed',
        'public-surface-form-changed',
        'public-surface-login-changed',
        'public-surface-upload-changed',
      ])
    );
    expect(JSON.stringify(result)).not.toContain(privateSourceValue);
    expect(classifyPublicSurfaceHints('src/App.tsx', '<form><input type="file" /></form>')).toEqual(
      ['upload', 'form']
    );

    const unrelatedPathProperty = detectPublicSurfaceSignals(
      input(
        [changedFile('src/config.ts')],
        [
          {
            path: 'src/config.ts',
            content: "const cache = { path: '/tmp/cache' };",
          },
        ]
      )
    );
    expect(unrelatedPathProperty).toEqual({ signals: [], routes: [] });
  });
});
