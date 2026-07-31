import type { EvidenceRef, ReadinessSignal, SignalSeverity } from '../domain';
import type { FileDiffEntry } from '../diff/diffEngine';
import type { PrsTextFile } from './envSecretDetector';
import {
  classifyPublicSurfaceHints,
  normalizePublicRoutePath,
  type PublicRouteEvidence,
  type PublicSurfaceHint,
} from '../rules/public-surface-rules';

export interface PublicSurfaceDetectorInput {
  changedFiles: FileDiffEntry[];
  candidateFiles: PrsTextFile[];
}

export interface PublicSurfaceDetectionResult {
  signals: ReadinessSignal[];
  routes: PublicRouteEvidence[];
}

type DeterminateStatus = PublicRouteEvidence['status'];

interface ChangedSurface {
  sourcePath: string;
  status: DeterminateStatus;
  hints: PublicSurfaceHint[];
}

const SURFACE_HINT_ORDER: readonly PublicSurfaceHint[] = [
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

const HINT_PRESENTATION: Readonly<
  Record<
    Exclude<PublicSurfaceHint, 'api' | 'cors' | 'middleware' | 'public_asset'>,
    { label: string; severity: SignalSeverity; review: string }
  >
> = {
  admin: {
    label: 'admin',
    severity: 'high',
    review: 'Review authorization and privileged-action boundaries.',
  },
  upload: {
    label: 'upload',
    severity: 'high',
    review: 'Review authentication, file limits, storage, and failure handling.',
  },
  billing: {
    label: 'billing',
    severity: 'high',
    review: 'Review authorization, provider configuration, webhooks, and retries.',
  },
  webhook: {
    label: 'webhook',
    severity: 'high',
    review: 'Review signature verification, replay handling, and failure recovery.',
  },
  auth: {
    label: 'authentication',
    severity: 'high',
    review: 'Review authentication, session, callback, and access-control behavior.',
  },
  login: {
    label: 'login',
    severity: 'high',
    review: 'Review sign-in errors, session creation, and redirect safety.',
  },
  signup: {
    label: 'signup',
    severity: 'high',
    review: 'Review account creation, validation, abuse controls, and failure handling.',
  },
  dashboard: {
    label: 'dashboard',
    severity: 'medium',
    review: 'Review access control and data exposed by the dashboard.',
  },
  settings: {
    label: 'settings',
    severity: 'medium',
    review: 'Review access control, validation, and persistence for settings changes.',
  },
  callback: {
    label: 'callback',
    severity: 'high',
    review: 'Review callback validation, state handling, and redirect destinations.',
  },
  form: {
    label: 'form',
    severity: 'medium',
    review: 'Review validation, error states, and safe handling of submitted data.',
  },
};

function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function portablePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^(?:[.][/])+/, '')
    .replace(/^\/+/, '');
}

function createSignal(
  id: string,
  severity: SignalSeverity,
  title: string,
  message: string,
  evidence: EvidenceRef[],
  suggestedReview: string
): ReadinessSignal {
  return {
    id,
    category: 'public_surface',
    severity,
    title,
    message,
    evidence,
    suggestedReview,
    deterministic: true,
  };
}

function routeEvidence(route: PublicRouteEvidence): EvidenceRef {
  return {
    kind: 'route',
    label: route.routePath,
    path: route.sourcePath,
  };
}

function normalizeDeclaredRoute(route: string): string | null {
  if (!route.startsWith('/') || route.startsWith('//') || /[\s?#]/u.test(route)) {
    return null;
  }
  const normalized = route.replace(/\/{2,}/gu, '/').replace(/\/+$/u, '');
  return normalized || '/';
}

function isRuntimeRouteDeclarationSource(filePath: string): boolean {
  const normalized = portablePath(filePath).toLowerCase();
  return (
    /[.](?:[cm]?[jt]sx?)$/u.test(normalized) &&
    !/(?:[.](?:test|spec)|[.]d)[.][cm]?[jt]sx?$/u.test(normalized)
  );
}

function extractDeclaredRoutes(content: string | undefined): string[] {
  if (content === undefined) {
    return [];
  }

  const routes = new Set<string>();
  const patterns = [/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/giu];
  if (
    /(?:createBrowserRouter|createRoutesFromElements|\buseRoutes\s*\(|\b(?:const|let|var)\s+\w*(?:route|router|navigation)\w*\s*=)/iu.test(
      content
    )
  ) {
    patterns.push(/\bpath\s*:\s*["']([^"']+)["']/giu);
  }
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const normalized = match[1] ? normalizeDeclaredRoute(match[1]) : null;
      if (normalized) {
        routes.add(normalized);
      }
    }
  }
  return [...routes].sort(compareCodePoints);
}

function mergeSurfaceHints(
  ...hintGroups: readonly (readonly PublicSurfaceHint[])[]
): PublicSurfaceHint[] {
  const hints = new Set(hintGroups.flat());
  return SURFACE_HINT_ORDER.filter((hint) => hints.has(hint));
}

function addRoute(
  routes: Map<string, PublicRouteEvidence>,
  routePath: string,
  sourcePath: string,
  hints: PublicSurfaceHint[],
  status: DeterminateStatus
): void {
  const key = `${routePath}\0${sourcePath}\0${status}`;
  const current = routes.get(key);
  if (!current) {
    routes.set(key, { routePath, sourcePath, hints: [...hints], status });
    return;
  }
  current.hints = [...new Set([...current.hints, ...hints])];
}

function evidenceForHint(
  hint: PublicSurfaceHint,
  routes: readonly PublicRouteEvidence[],
  surfaces: readonly ChangedSurface[],
  includesStatus: (status: DeterminateStatus) => boolean = () => true
): EvidenceRef[] {
  const matchingRoutes = routes.filter(
    (route) => route.hints.includes(hint) && includesStatus(route.status)
  );
  const routeSources = new Set(matchingRoutes.map((route) => route.sourcePath));
  const evidence = matchingRoutes.map(routeEvidence);

  for (const surface of surfaces) {
    if (
      surface.hints.includes(hint) &&
      includesStatus(surface.status) &&
      !routeSources.has(surface.sourcePath)
    ) {
      evidence.push({
        kind: 'file',
        label: `${hint.replaceAll('_', ' ')} surface change`,
        path: surface.sourcePath,
      });
    }
  }

  return evidence.sort(
    (left, right) =>
      compareCodePoints(left.label, right.label) ||
      compareCodePoints(left.path ?? '', right.path ?? '')
  );
}

export function detectPublicSurfaceSignals(
  input: PublicSurfaceDetectorInput
): PublicSurfaceDetectionResult {
  const candidateContent = new Map(
    input.candidateFiles.map((file) => [portablePath(file.path), file.content])
  );
  const routesByKey = new Map<string, PublicRouteEvidence>();
  const surfaces: ChangedSurface[] = [];

  for (const change of input.changedFiles) {
    if (change.status === 'indeterminate') {
      continue;
    }
    const status: DeterminateStatus = change.status;
    const sourcePaths =
      status === 'renamed' && change.previousPath
        ? [portablePath(change.previousPath), portablePath(change.path)]
        : [portablePath(change.path)];

    for (const sourcePath of sourcePaths) {
      const content =
        sourcePath === portablePath(change.path) && status !== 'deleted'
          ? candidateContent.get(sourcePath)
          : undefined;
      const hints = classifyPublicSurfaceHints(sourcePath, content);
      surfaces.push({ sourcePath, status, hints });

      const normalizedRoute = normalizePublicRoutePath(sourcePath);
      if (normalizedRoute) {
        addRoute(routesByKey, normalizedRoute, sourcePath, hints, status);
      }
      const declaredRoutes = isRuntimeRouteDeclarationSource(sourcePath)
        ? extractDeclaredRoutes(content)
        : [];
      for (const declaredRoute of declaredRoutes) {
        addRoute(
          routesByKey,
          declaredRoute,
          sourcePath,
          mergeSurfaceHints(hints, classifyPublicSurfaceHints(declaredRoute, undefined)),
          status
        );
      }
    }
  }

  const routes = [...routesByKey.values()].sort(
    (left, right) =>
      compareCodePoints(left.routePath, right.routePath) ||
      compareCodePoints(left.sourcePath, right.sourcePath) ||
      compareCodePoints(left.status, right.status)
  );
  const signals: ReadinessSignal[] = [];

  if (routes.length > 0) {
    signals.push(
      createSignal(
        'public-route-surface-changed',
        'medium',
        'Public route surface changed',
        'Deterministic path or route-declaration evidence changed in the candidate export.',
        routes.map(routeEvidence),
        'Review routing, access control, validation, and user-visible error states.'
      )
    );
  }

  const addedApiEvidence = evidenceForHint('api', routes, surfaces, (status) => status === 'added');
  if (addedApiEvidence.length > 0) {
    signals.push(
      createSignal(
        'public-api-route-added',
        'high',
        'New API surfaces detected',
        'New API route files or function paths were found in the candidate export.',
        addedApiEvidence,
        'Review authentication, authorization, validation, rate limits, and failure handling.'
      )
    );
  }

  const changedApiEvidence = evidenceForHint(
    'api',
    routes,
    surfaces,
    (status) => status !== 'added'
  );
  if (changedApiEvidence.length > 0) {
    signals.push(
      createSignal(
        'public-api-route-changed',
        'high',
        'API surfaces changed',
        'Existing API route files or function paths changed in the candidate export.',
        changedApiEvidence,
        'Review authentication, authorization, validation, rate limits, and failure handling.'
      )
    );
  }

  for (const [hint, presentation] of Object.entries(HINT_PRESENTATION) as [
    keyof typeof HINT_PRESENTATION,
    (typeof HINT_PRESENTATION)[keyof typeof HINT_PRESENTATION],
  ][]) {
    const evidence = evidenceForHint(hint, routes, surfaces);
    if (evidence.length > 0) {
      signals.push(
        createSignal(
          `public-surface-${hint}-changed`,
          presentation.severity,
          `${presentation.label.slice(0, 1).toUpperCase()}${presentation.label.slice(1)} surface changed`,
          `Changed path or lightweight content evidence indicates a ${presentation.label} surface.`,
          evidence,
          presentation.review
        )
      );
    }
  }

  const dedicatedSignals: readonly {
    hint: 'public_asset' | 'cors' | 'middleware';
    id: string;
    severity: SignalSeverity;
    title: string;
    message: string;
    review: string;
  }[] = [
    {
      hint: 'public_asset',
      id: 'public-assets-changed',
      severity: 'low',
      title: 'Public assets changed',
      message: 'Files under the public asset path changed.',
      review: 'Confirm public filenames, caching, and exposed content are intentional.',
    },
    {
      hint: 'cors',
      id: 'public-cors-changed',
      severity: 'high',
      title: 'CORS behavior changed',
      message: 'Changed source contains deterministic CORS configuration markers.',
      review: 'Review allowed origins, methods, headers, credentials, and cache behavior.',
    },
    {
      hint: 'middleware',
      id: 'public-middleware-changed',
      severity: 'high',
      title: 'Request middleware changed',
      message: 'A request or response middleware path changed.',
      review: 'Review access control, redirects, request mutation, and response behavior.',
    },
  ];
  for (const definition of dedicatedSignals) {
    const evidence = evidenceForHint(definition.hint, routes, surfaces);
    if (evidence.length > 0) {
      signals.push(
        createSignal(
          definition.id,
          definition.severity,
          definition.title,
          definition.message,
          evidence,
          definition.review
        )
      );
    }
  }

  return {
    signals: signals.sort((left, right) => compareCodePoints(left.id, right.id)),
    routes,
  };
}
