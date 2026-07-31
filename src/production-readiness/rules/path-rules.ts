import type { ReadinessCategory, SignalSeverity } from '../domain';

export interface SensitivePathRule {
  id: string;
  category: ReadinessCategory;
  pattern: string;
  patternKind: 'glob' | 'regex';
  severity: SignalSeverity;
  explanation: string;
}

const DEFAULT_SENSITIVE_PATH_RULES: readonly SensitivePathRule[] = [
  {
    id: 'identity-auth-directory',
    category: 'identity_access',
    pattern: '**/auth/**',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'Authentication or access-control code changed.',
  },
  {
    id: 'identity-middleware',
    category: 'identity_access',
    pattern: '**/middleware.*',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'Request middleware changed and may affect protected access.',
  },
  {
    id: 'identity-session',
    category: 'identity_access',
    pattern: '**/session*.*',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'Session-handling code changed.',
  },
  {
    id: 'identity-routes',
    category: 'identity_access',
    pattern: '(?:^|/)(?:login|signup|account|dashboard|admin|protected[^/]*)(?:/|[.][^/]+$|$)',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'An identity or protected route changed.',
  },
  {
    id: 'data-schema-tools',
    category: 'data_persistence',
    pattern: '(?:^|/)(?:prisma|drizzle|migrations|supabase|firebase|db|database)(?:/|$)',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'A database, migration, or persistence path changed.',
  },
  {
    id: 'data-schema-files',
    category: 'data_persistence',
    pattern: '**/schema.*',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'A data schema file changed.',
  },
  {
    id: 'data-storage-upload',
    category: 'data_persistence',
    pattern: '(?:^|/)(?:storage|upload)(?:/|$)',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'Storage or upload persistence code changed.',
  },
  {
    id: 'config-env-file',
    category: 'secrets_config',
    pattern: '(?:^|/)[.]env(?:[.](?!example(?:[.]|$))[^/]+)?$',
    patternKind: 'regex',
    severity: 'critical',
    explanation: 'An environment configuration file changed.',
  },
  {
    id: 'config-env-example',
    category: 'secrets_config',
    pattern: '**/.env.example',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'The example environment configuration changed.',
  },
  {
    id: 'config-directory',
    category: 'secrets_config',
    pattern: '**/config/**',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'Application configuration changed.',
  },
  {
    id: 'config-framework',
    category: 'secrets_config',
    pattern: '(?:^|/)(?:next|vite|astro|nuxt)[.]config[.][^/]+$',
    patternKind: 'regex',
    severity: 'medium',
    explanation: 'Framework configuration changed.',
  },
  {
    id: 'deployment-workflow',
    category: 'deployment_ops',
    pattern: '.github/workflows/**',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'A deployment or automation workflow changed.',
  },
  {
    id: 'deployment-platform',
    category: 'deployment_ops',
    pattern:
      '(?:^|/)(?:vercel[.]json|netlify[.]toml|Dockerfile|docker-compose(?:[.][^/]+)?|wrangler(?:[.][^/]+)?)$',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'Deployment platform configuration changed.',
  },
  {
    id: 'deployment-lockfile',
    category: 'deployment_ops',
    pattern:
      '(?:^|/)(?:package-lock[.]json|pnpm-lock[.]yaml|yarn[.]lock|bun[.]lockb?|deno[.]lock)$',
    patternKind: 'regex',
    severity: 'medium',
    explanation: 'A package-manager lockfile changed.',
  },
  {
    id: 'integration-service-path',
    category: 'external_integrations',
    pattern:
      '(?:^|/)(?:stripe|billing|webhooks?|email(?:-templates?)?|resend|twilio)(?:/|[.][^/]+$|$)',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'A third-party service integration path changed.',
  },
  {
    id: 'public-app-page',
    category: 'public_surface',
    pattern: '**/app/**/page.*',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'A public application page changed.',
  },
  {
    id: 'public-app-route',
    category: 'public_surface',
    pattern: '**/app/**/route.*',
    patternKind: 'glob',
    severity: 'high',
    explanation: 'A public route handler changed.',
  },
  {
    id: 'public-pages-router',
    category: 'public_surface',
    pattern: '(?:^|/)pages/(?!_(?:app|document|error)[.]).*[.][^/]+$',
    patternKind: 'regex',
    severity: 'medium',
    explanation: 'A pages-router surface changed.',
  },
  {
    id: 'public-api-path',
    category: 'public_surface',
    pattern: '(?:^|/)api(?:/|$)',
    patternKind: 'regex',
    severity: 'high',
    explanation: 'An API surface changed.',
  },
  {
    id: 'testing-test-file',
    category: 'testing_recovery',
    pattern: '**/*.test.*',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'A test file changed.',
  },
  {
    id: 'testing-spec-file',
    category: 'testing_recovery',
    pattern: '**/*.spec.*',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'A specification test changed.',
  },
  {
    id: 'testing-directory',
    category: 'testing_recovery',
    pattern: '**/__tests__/**',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'A test-suite path changed.',
  },
  {
    id: 'testing-runner-config',
    category: 'testing_recovery',
    pattern: '(?:^|/)(?:playwright|cypress|vitest)[.]config[.][^/]+$',
    patternKind: 'regex',
    severity: 'medium',
    explanation: 'Test-runner configuration changed.',
  },
  {
    id: 'testing-ci-workflow',
    category: 'testing_recovery',
    pattern: '.github/workflows/**',
    patternKind: 'glob',
    severity: 'medium',
    explanation: 'A CI or recovery automation workflow changed.',
  },
  {
    id: 'maintainability-backup-file',
    category: 'maintainability',
    pattern: '(?:^|/)[^/]+[.](?:bak|backup|old|orig|tmp|copy)$',
    patternKind: 'regex',
    severity: 'low',
    explanation: 'A backup, temporary, or copy file changed.',
  },
];

export function getSensitivePathRules(): SensitivePathRule[] {
  return DEFAULT_SENSITIVE_PATH_RULES.map((rule) => ({ ...rule }));
}
