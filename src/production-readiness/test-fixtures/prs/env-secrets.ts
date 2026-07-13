import type {
  EnvExampleSnapshot,
  EnvSecretDetectorInput,
  PrsTextFile,
  TextFileSnapshot,
} from '../../detectors/envSecretDetector';

export interface EnvSecretDetectorFixture {
  input: EnvSecretDetectorInput;
}

function file(path: string, content: string): PrsTextFile {
  return { path, content };
}

function available(files: readonly PrsTextFile[]): TextFileSnapshot {
  return { status: 'available', files };
}

function present(path: string, content: string): EnvExampleSnapshot {
  return { status: 'present', path, content };
}

function absent(path = '.env.example'): EnvExampleSnapshot {
  return { status: 'absent', path };
}

function syntaxInput(): EnvSecretDetectorInput {
  return {
    candidateFiles: [
      file(
        'src/runtime-env.ts',
        [
          'const node = process.env.NODE_ENV;',
          'const resend = process.env["RESEND_API_KEY"];',
          "const stripe = process.env['STRIPE_SECRET_KEY'];",
          'const vite = import.meta.env.VITE_API_URL;',
          "const deno = Deno.env.get('DENO_KV_URL');",
          'const bun = Bun.env.BUN_REGION;',
          'const publicSite = import.meta.env.PUBLIC_SITE_URL;',
          'const publicAnalytics = process.env.NEXT_PUBLIC_ANALYTICS_ID;',
          'const directVite = import.meta.env.VITE_DIRECT_REFERENCE;',
          'const duplicate = process.env.NODE_ENV;',
          'const dynamic = process.env[variableName];',
          "const note = 'VITE_NOT_A_REFERENCE';",
          '// NEXT_PUBLIC_COMMENT_ONLY',
        ].join('\n')
      ),
      file('.env.example', 'VITE_UNUSED='),
    ],
    baseFiles: available([]),
    candidateEnvExample: present(
      '.env.example',
      [
        'NODE_ENV=',
        'RESEND_API_KEY=',
        'STRIPE_SECRET_KEY=',
        'VITE_API_URL=',
        'DENO_KV_URL=',
        'BUN_REGION=',
        'PUBLIC_SITE_URL=',
        'NEXT_PUBLIC_ANALYTICS_ID=',
        'VITE_DIRECT_REFERENCE=',
      ].join('\n')
    ),
    baseEnvExample: absent(),
  };
}

function coverageInput(): EnvSecretDetectorInput {
  return {
    candidateFiles: [
      file(
        'src/config.ts',
        [
          'export const databaseUrl = process.env.DATABASE_URL;',
          'export const resendKey = process.env.RESEND_API_KEY;',
        ].join('\n')
      ),
      file('src/public-config.ts', 'export const endpoint = import.meta.env.VITE_PUBLIC_ENDPOINT;'),
    ],
    baseFiles: available([
      file(
        'src/config.ts',
        [
          'export const databaseUrl = process.env.DATABASE_URL;',
          'export const removed = process.env.REMOVED_BASE_VAR;',
        ].join('\n')
      ),
      file('src/public-config.ts', 'export const existingPublic = import.meta.env.VITE_EXISTING;'),
    ]),
    candidateEnvExample: present(
      '.env.example',
      [
        '# Values are intentionally omitted from examples.',
        'DATABASE_URL=',
        'VITE_EXISTING = ignored-example-placeholder',
        'export RESEND_FROM=',
        'INVALID-NAME=',
      ].join('\n')
    ),
    baseEnvExample: present(
      '.env.example',
      ['DATABASE_URL=', 'REMOVED_BASE_VAR=', 'VITE_EXISTING='].join('\n')
    ),
  };
}

function committedEnvInput(): EnvSecretDetectorInput {
  return {
    candidateFiles: [
      file('.env', 'ROOT_SECRET=synthetic-root-secret-value'),
      file('config/.env.local', 'LOCAL_SECRET=synthetic-local-secret-value'),
      file('apps/web/.env.production', 'PROD_SECRET=synthetic-prod-secret-value'),
      file('apps/api/.env.development.local', 'DEV_SECRET=synthetic-development-secret-value'),
      file('.env.example', 'ROOT_SECRET='),
      file('config/.env.sample', 'LOCAL_SECRET='),
      file('apps/web/.env.template', 'PROD_SECRET='),
      file('apps/api/.env.dist', 'DEV_SECRET='),
      file('apps/web/.env.production.example', 'PROD_SECRET='),
      file('apps/web/.env.local.template', 'LOCAL_SECRET='),
      file('apps/api/.env.sample.local', 'DEV_SECRET='),
    ],
    baseFiles: available([]),
    candidateEnvExample: present('.env.example', 'ROOT_SECRET='),
    baseEnvExample: absent(),
  };
}

function secretPatternInput(): EnvSecretDetectorInput {
  return {
    candidateFiles: [
      file(
        'src/config.ts',
        [
          "const apiKey = 'synthetic-credential-Q7v9L2m4P8x6';",
          "const placeholderKey = 'your-api-key-here';",
          "const token = '[REDACTED]';",
          "const provider = 'sk-proj-syntheticQ7v9L2m4P8x6N3c5';",
          '"apiKey": "ordinary-but-sensitive-value",',
          "const serviceToken = 'short-but-real-looking-secret';",
          "const providerPlaceholder = 'sk-proj-your-api-key-placeholder-value';",
        ].join('\n')
      ),
      file(
        'config/runtime.env',
        [
          'API_KEY=ordinary-but-sensitive-value',
          'GITHUB_TOKEN=github_pat_syntheticQ7v9L2m4P8x6N3c5R1t8Y6u4',
        ].join('\n')
      ),
      file(
        'config/private-key.ts',
        [
          'const key = `-----BEGIN PRIVATE KEY-----',
          'c3ludGhldGljLXByaXZhdGUta2V5LWZpeHR1cmU=',
          '-----END PRIVATE KEY-----`;',
        ].join('\n')
      ),
      file('config/opaque.ts', "export const opaque = 'Q7v9L2m4P8x6N3c5R1t8Y6u4I2o9A7s5D3f1G8h6';"),
    ],
    baseFiles: available([]),
    candidateEnvExample: absent(),
    baseEnvExample: absent(),
  };
}

function unavailableBaseInput(): EnvSecretDetectorInput {
  return {
    candidateFiles: [file('src/config.ts', 'export const value = process.env.ONLY_CANDIDATE;')],
    baseFiles: {
      status: 'unavailable',
      limitation: {
        source: 'github_base',
        message: 'Base source excerpts were unavailable for environment comparison.',
        confidenceImpact: 'low',
      },
    },
    candidateEnvExample: absent(),
    baseEnvExample: {
      status: 'unavailable',
      path: '.env.example',
      limitation: {
        source: 'github_base',
        message: 'Base environment example was unavailable.',
        confidenceImpact: 'low',
      },
    },
  };
}

const FIXTURES = {
  syntaxes: syntaxInput,
  coverage: coverageInput,
  'committed-env-files': committedEnvInput,
  'secret-patterns': secretPatternInput,
  'unavailable-base': unavailableBaseInput,
} satisfies Record<string, () => EnvSecretDetectorInput>;

export function createEnvSecretDetectorFixture(name: string): EnvSecretDetectorFixture {
  if (!Object.prototype.hasOwnProperty.call(FIXTURES, name)) {
    throw new Error(`Unknown env/secret detector fixture: ${name}`);
  }

  return {
    input: structuredClone(FIXTURES[name as keyof typeof FIXTURES]()),
  };
}
