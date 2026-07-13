import { describe, expect, it } from 'vitest';
import {
  detectEnvAndSecretSignals,
  type EnvExampleSnapshot,
  type EnvSecretDetectionResult,
  type EnvSecretDetectorInput,
  type PrsTextFile,
  type TextFileSnapshot,
} from '../envSecretDetector';
import {
  extractEnvExampleVariables,
  extractEnvReferences,
  type EnvReference,
} from '../../rules/env-patterns';
import {
  detectSecretLikePatterns,
  type SecretPatternClass,
  type SecretPatternMatch,
} from '../../rules/secret-patterns';
import {
  createEnvSecretDetectorFixture,
  type EnvSecretDetectorFixture,
} from '../../test-fixtures/prs/env-secrets';
import type { PartialDataNotice } from '../../domain';

function signal(result: EnvSecretDetectionResult, id: string) {
  return result.signals.find((candidate) => candidate.id === id);
}

function evidenceLabels(result: EnvSecretDetectionResult, id: string): string[] | undefined {
  return signal(result, id)?.evidence.map(({ label }) => label);
}

function resultIds(result: EnvSecretDetectionResult): string[] {
  return result.signals.map(({ id }) => id);
}

describe('Production Readiness Snapshot env and secret detector', () => {
  it('detects env references across supported syntaxes', () => {
    const { input }: EnvSecretDetectorFixture = createEnvSecretDetectorFixture('syntaxes');
    const sourceText = input.candidateFiles[0].content;
    const expected: EnvReference[] = [
      { name: 'BUN_REGION', public: false },
      { name: 'DENO_KV_URL', public: false },
      { name: 'NEXT_PUBLIC_ANALYTICS_ID', public: true },
      { name: 'NODE_ENV', public: false },
      { name: 'PUBLIC_SITE_URL', public: true },
      { name: 'RESEND_API_KEY', public: false },
      { name: 'STRIPE_SECRET_KEY', public: false },
      { name: 'VITE_API_URL', public: true },
      { name: 'VITE_DIRECT_REFERENCE', public: true },
    ];

    expect(extractEnvReferences(sourceText)).toEqual(expected);
    expect(detectEnvAndSecretSignals(input).detectedVariables).toEqual(
      expected.map(({ name }) => name)
    );
    expect(
      extractEnvReferences(
        [
          'process.env[name];',
          'Deno.env.get(variable);',
          'public_value;',
          'VITE_UNUSED=',
          "const note = 'Use process.env.NOT_A_REFERENCE';",
          '// import.meta.env.VITE_COMMENT_ONLY',
          '/* Deno.env.get("DENO_COMMENT_ONLY") */',
          'const template = `Bun.env.BUN_STRING_ONLY`;',
        ].join('\n')
      )
    ).toEqual([]);
    expect(
      extractEnvReferences(
        [
          "import { PUBLIC_API_URL } from '$env/static/public';",
          "import { env as publicEnv } from '$env/dynamic/public';",
          'console.log(PUBLIC_API_URL, publicEnv.PUBLIC_RUNTIME_URL);',
        ].join('\n')
      )
    ).toEqual([
      { name: 'PUBLIC_API_URL', public: true },
      { name: 'PUBLIC_RUNTIME_URL', public: true },
    ]);
    expect(
      extractEnvReferences(
        [
          '<!-- process.env.HTML_COMMENT_ONLY -->',
          "<p>It's okay</p>",
          '<p>Use process.env.DOCUMENTATION_ONLY in production.</p>',
          '<p>{process.env.SVELTE_EXPRESSION}</p>',
          '<div data-env={process.env.SVELTE_ATTRIBUTE}></div>',
          '<a href="{process.env.QUOTED_ATTRIBUTE}/docs">Docs</a>',
          '<div data-ready={count > process.env.AFTER_COMPARATOR}></div>',
          '<div><!-- {process.env.HTML_COMMENT_EXPR} --><span>{process.env.NESTED_ACTUAL}</span></div>',
          '<p>{a<b&&process.env.TEXT_COMPARATOR>c}</p>',
          '<script>const value = process.env.ACTUAL;</script>',
          '<script>if(a<b&&process.env.MINIFIED_SCRIPT>c)run();</script>',
        ].join('\n')
      )
    ).toEqual([
      { name: 'ACTUAL', public: false },
      { name: 'AFTER_COMPARATOR', public: false },
      { name: 'MINIFIED_SCRIPT', public: false },
      { name: 'NESTED_ACTUAL', public: false },
      { name: 'QUOTED_ATTRIBUTE', public: false },
      { name: 'SVELTE_ATTRIBUTE', public: false },
      { name: 'SVELTE_EXPRESSION', public: false },
      { name: 'TEXT_COMPARATOR', public: false },
    ]);
    expect(
      extractEnvReferences(
        [
          'if(a<b&&process.env.PLAIN_COMPACT>c)run();',
          'const value = `${a<b&&process.env.TEMPLATE_COMPACT>c}`;',
        ].join('\n')
      )
    ).toEqual([
      { name: 'PLAIN_COMPACT', public: false },
      { name: 'TEMPLATE_COMPACT', public: false },
    ]);
    expect(
      extractEnvReferences(
        [
          'if(a<b && process.env.PARTIAL_AND>c)run();',
          'if(a<b || process.env.PARTIAL_OR>c)run();',
          'if(a<b',
          '&&process.env.NEWLINE_COMPARISON>c)run();',
          'const value = `${a<b && process.env.TEMPLATE_PARTIAL>c}`;',
        ].join('\n')
      )
    ).toEqual([
      { name: 'NEWLINE_COMPARISON', public: false },
      { name: 'PARTIAL_AND', public: false },
      { name: 'PARTIAL_OR', public: false },
      { name: 'TEMPLATE_PARTIAL', public: false },
    ]);
    expect(resultIds(detectEnvAndSecretSignals(input))).not.toContain('env:example-coverage');
  });

  it('reports new env vars and stale env example coverage', () => {
    const fixture = createEnvSecretDetectorFixture('coverage');
    const inputSnapshot = JSON.stringify(fixture.input);
    const result = detectEnvAndSecretSignals(fixture.input);

    expect(result.detectedVariables).toEqual([
      'DATABASE_URL',
      'RESEND_API_KEY',
      'VITE_PUBLIC_ENDPOINT',
    ]);
    const candidateExample: EnvExampleSnapshot = fixture.input.candidateEnvExample;
    expect(candidateExample.status).toBe('present');
    if (candidateExample.status !== 'present') {
      throw new Error('Expected a present candidate environment example fixture.');
    }
    expect(extractEnvExampleVariables(candidateExample.content)).toEqual([
      'DATABASE_URL',
      'RESEND_FROM',
      'VITE_EXISTING',
    ]);
    expect(evidenceLabels(result, 'env:new-references')).toEqual([
      'RESEND_API_KEY',
      'VITE_PUBLIC_ENDPOINT',
    ]);
    expect(evidenceLabels(result, 'env:removed-references')).toEqual([
      'REMOVED_BASE_VAR',
      'VITE_EXISTING',
    ]);
    expect(signal(result, 'env:public-references')).toMatchObject({
      category: 'secrets_config',
      severity: 'high',
      message: expect.stringContaining('client-side exposure'),
      evidence: [
        expect.objectContaining({
          kind: 'env_var',
          label: 'VITE_PUBLIC_ENDPOINT',
          redacted: false,
        }),
      ],
    });
    expect(signal(result, 'env:example-coverage')).toMatchObject({
      severity: 'high',
      evidence: [
        expect.objectContaining({ label: 'RESEND_API_KEY', path: '.env.example' }),
        expect.objectContaining({ label: 'VITE_PUBLIC_ENDPOINT', path: '.env.example' }),
      ],
    });
    expect(result.limitations).toEqual([]);
    expect(result.redactionApplied).toBe(false);
    expect(JSON.stringify(fixture.input)).toBe(inputSnapshot);

    const reordered = createEnvSecretDetectorFixture('coverage').input;
    reordered.candidateFiles = [...reordered.candidateFiles].reverse();
    if (reordered.baseFiles.status === 'available') {
      reordered.baseFiles.files = [...reordered.baseFiles.files].reverse();
    }
    expect(detectEnvAndSecretSignals(reordered)).toEqual(result);

    const removedExample = createEnvSecretDetectorFixture('coverage').input;
    removedExample.candidateEnvExample = { status: 'absent', path: '.env.example' };
    expect(
      signal(detectEnvAndSecretSignals(removedExample), 'env:example-coverage')?.message
    ).toContain('removed');

    const unavailable = createEnvSecretDetectorFixture('unavailable-base').input;
    const unavailableBase: TextFileSnapshot = unavailable.baseFiles;
    expect(unavailableBase.status).toBe('unavailable');
    const unavailableResult = detectEnvAndSecretSignals(unavailable);
    expect(unavailableResult.detectedVariables).toEqual(['ONLY_CANDIDATE']);
    expect(unavailableResult.signals.map(({ id }) => id)).toEqual(['env:example-coverage']);
    expect(unavailableResult.limitations).toEqual([
      {
        source: 'github_base',
        message: 'Base environment example was unavailable.',
        confidenceImpact: 'low',
      },
      {
        source: 'github_base',
        message: 'Base source excerpts were unavailable for environment comparison.',
        confidenceImpact: 'low',
      },
    ]);

    unavailable.candidateEnvExample = {
      status: 'unavailable',
      path: '.env.example',
      limitation: {
        source: 'zip_scan',
        message: 'Candidate environment example text was unavailable.',
        confidenceImpact: 'medium',
      },
    };
    const unavailableExampleResult = detectEnvAndSecretSignals(unavailable);
    expect(signal(unavailableExampleResult, 'env:example-coverage')).toBeUndefined();
    expect(unavailableExampleResult.limitations).toHaveLength(3);
  });

  it('reports committed env files without displaying their values', () => {
    const fixture = createEnvSecretDetectorFixture('committed-env-files');
    const inputSnapshot = JSON.stringify(fixture.input);
    const result = detectEnvAndSecretSignals(fixture.input);

    expect(signal(result, 'secret:committed-env-files')).toMatchObject({
      category: 'secrets_config',
      severity: 'critical',
      title: 'Environment files included in export',
      message: expect.stringContaining('Do not commit real secrets'),
      evidence: [
        expect.objectContaining({ path: '.env', redacted: true }),
        expect.objectContaining({ path: 'apps/api/.env.development.local', redacted: true }),
        expect.objectContaining({ path: 'apps/web/.env.production', redacted: true }),
        expect.objectContaining({ path: 'config/.env.local', redacted: true }),
      ],
    });
    expect(signal(result, 'secret:committed-env-files')?.evidence).toHaveLength(4);
    expect(result.redactionApplied).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic-root-secret|synthetic-local-secret|synthetic-prod-secret|synthetic-development-secret/
    );
    expect(JSON.stringify(fixture.input)).toBe(inputSnapshot);
  });

  it('redacts secret looking values from all detector output', () => {
    const fixture = createEnvSecretDetectorFixture('secret-patterns');
    const rawValues = [
      'synthetic-credential-Q7v9L2m4P8x6',
      'sk-proj-syntheticQ7v9L2m4P8x6N3c5',
      'ordinary-but-sensitive-value',
      'short-but-real-looking-secret',
      'github_pat_syntheticQ7v9L2m4P8x6N3c5R1t8Y6u4',
      'c3ludGhldGljLXByaXZhdGUta2V5LWZpeHR1cmU=',
      'Q7v9L2m4P8x6N3c5R1t8Y6u4I2o9A7s5D3f1G8h6',
    ];
    const source = fixture.input.candidateFiles.map(({ content }) => content).join('\n');

    const expectedPatternOrder: SecretPatternClass[] = [
      'credential_assignment',
      'provider_key_prefix',
      'private_key_block',
      'high_entropy_literal',
    ];
    const expectedPatterns: SecretPatternMatch[] = expectedPatternOrder.map((pattern) => ({
      pattern,
      redacted: true,
    }));
    expect(detectSecretLikePatterns(source)).toEqual(expectedPatterns);
    expect(
      detectSecretLikePatterns(
        [
          'API_KEY=ordinary-but-sensitive-value',
          '"apiKey": "ordinary-but-sensitive-value"',
          "const serviceToken = 'short-but-real-looking-secret';",
          'GITHUB_TOKEN=github_pat_syntheticQ7v9L2m4P8x6N3c5R1t8Y6u4',
        ].join('\n')
      )
    ).toEqual([
      { pattern: 'credential_assignment', redacted: true },
      { pattern: 'provider_key_prefix', redacted: true },
    ]);
    expect(
      detectSecretLikePatterns("const provider = 'sk-proj-your-api-key-placeholder-value';")
    ).toEqual([]);
    expect(
      detectSecretLikePatterns(
        [
          'apiKey: string | undefined;',
          'token: Promise<string>;',
          'privateKey: CryptoKey | null;',
          'accessKey: keyof Credentials;',
        ].join('\n')
      )
    ).toEqual([]);
    expect(
      detectSecretLikePatterns(
        [
          'type CommentedCredentialShape =',
          '',
          '// explanatory comment',
          '{',
          "  token: 'ordinary-but-sensitive-value';",
          '}',
        ].join('\n')
      )
    ).toEqual([]);
    expect(
      detectSecretLikePatterns(
        [
          'interface Credentials {',
          "  token: 'ordinary-but-sensitive-value';",
          '}',
          'declare const DeclaredCredentials: {',
          "  apiKey: 'ordinary-but-sensitive-value';",
          '};',
        ].join('\n')
      )
    ).toEqual([]);
    expect(
      detectSecretLikePatterns(
        [
          'type CredentialShape = {',
          "  token: 'ordinary-but-sensitive-value';",
          '}',
          "const apiKey: string = 'ordinary-but-sensitive-value';",
        ].join('\n')
      )
    ).toEqual([{ pattern: 'credential_assignment', redacted: true }]);

    const hostileSource = `const serviceToken = '${'a'.repeat(64 * 1024)}`;
    const hostileStartedAt = performance.now();
    expect(detectSecretLikePatterns(hostileSource)).toEqual([]);
    expect(performance.now() - hostileStartedAt).toBeLessThan(1_000);

    const result = detectEnvAndSecretSignals(fixture.input);
    expect(signal(result, 'secret:possible-values')).toMatchObject({
      category: 'secrets_config',
      severity: 'critical',
      title: 'Possible secret-looking values detected',
      message: expect.stringContaining('Values are hidden'),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: 'pattern',
          label: 'Credential-like assignment',
          path: 'src/config.ts',
          redacted: true,
        }),
        expect.objectContaining({
          kind: 'pattern',
          label: 'Private key block',
          path: 'config/private-key.ts',
          redacted: true,
        }),
      ]),
    });
    expect(result.redactionApplied).toBe(true);
    for (const rawValue of rawValues) {
      expect(JSON.stringify(result)).not.toContain(rawValue);
    }

    const placeholderInput: EnvSecretDetectorInput = {
      candidateFiles: [
        {
          path: 'src/placeholders.ts',
          content: [
            "const apiKey = 'your-api-key-here';",
            "const token = '[REDACTED]';",
            "const privateKey = 'example-private-key';",
            'const token = process.env.API_TOKEN;',
            'const privateKey = importedKeyMaterial;',
          ].join('\n'),
        },
      ],
      baseFiles: { status: 'available', files: [] },
      candidateEnvExample: { status: 'absent', path: '.env.example' },
      baseEnvExample: { status: 'absent', path: '.env.example' },
    };
    const placeholderResult = detectEnvAndSecretSignals(placeholderInput);
    expect(signal(placeholderResult, 'secret:possible-values')).toBeUndefined();
    expect(placeholderResult.redactionApplied).toBe(false);

    const accessorSecret = 'synthetic-accessor-secret-Q7v9L2m4P8x6';
    let contentReads = 0;
    const accessorFile: PrsTextFile = {
      path: 'src/accessor.ts',
      get content(): string {
        contentReads += 1;
        return `const secret = '${accessorSecret}';\u0000`;
      },
    };
    const accessorResult = detectEnvAndSecretSignals({
      ...placeholderInput,
      candidateFiles: [accessorFile],
    });
    expect(contentReads).toBe(1);
    expect(JSON.stringify(accessorResult)).not.toContain(accessorSecret);
    expect(JSON.stringify(accessorResult)).not.toContain('\\u0000');

    const thrownContentSecret = 'synthetic-thrown-content-secret-Q7v9L2m4';
    const throwingFile: PrsTextFile = {
      path: '.env.production',
      get content(): string {
        throw new Error(thrownContentSecret);
      },
    };
    let throwingFileResult: EnvSecretDetectionResult | undefined;
    expect(() => {
      throwingFileResult = detectEnvAndSecretSignals({
        ...placeholderInput,
        candidateFiles: [throwingFile],
        baseFiles: {
          status: 'available',
          files: [{ path: 'src/base.ts', content: 'const value = process.env.BASE_ONLY;' }],
        },
      });
    }).not.toThrow();
    expect(JSON.stringify(throwingFileResult)).not.toContain(thrownContentSecret);
    expect(signal(throwingFileResult!, 'env:removed-references')).toBeUndefined();
    expect(
      signal(throwingFileResult!, 'secret:committed-env-files')?.evidence.map(({ path }) => path)
    ).toEqual(['.env.production']);
    expect(throwingFileResult?.redactionApplied).toBe(true);
    expect(throwingFileResult?.limitations).toContainEqual({
      source: 'detector',
      message: 'A candidate source excerpt could not be read safely and was skipped.',
      confidenceImpact: 'medium',
    });

    const thrownExampleSecret = 'synthetic-thrown-example-secret-Q7v9L2m4';
    const throwingExample: EnvExampleSnapshot = {
      status: 'present',
      path: '.env.example',
      get content(): string {
        throw new Error(thrownExampleSecret);
      },
    };
    let throwingExampleResult: EnvSecretDetectionResult | undefined;
    expect(() => {
      throwingExampleResult = detectEnvAndSecretSignals({
        ...placeholderInput,
        candidateFiles: [
          { path: 'src/config.ts', content: 'const value = process.env.EXAMPLE_VALUE;' },
        ],
        candidateEnvExample: throwingExample,
      });
    }).not.toThrow();
    expect(JSON.stringify(throwingExampleResult)).not.toContain(thrownExampleSecret);
    expect(throwingExampleResult?.limitations).toContainEqual({
      source: 'detector',
      message: 'The candidate environment example could not be read safely.',
      confidenceImpact: 'medium',
    });

    const secondReadSecret = 'synthetic-second-read-secret-Q7v9L2m4';
    let limitationMessageReads = 0;
    const accessorLimitation: PartialDataNotice = {
      source: 'github_base',
      get message() {
        limitationMessageReads += 1;
        return limitationMessageReads === 1
          ? 'Base source excerpts were unavailable.'
          : secondReadSecret;
      },
      confidenceImpact: 'low',
    };
    const limitationResult = detectEnvAndSecretSignals({
      ...placeholderInput,
      baseFiles: { status: 'unavailable', limitation: accessorLimitation },
    });
    expect(limitationMessageReads).toBe(1);
    expect(limitationResult.limitations).toEqual([
      {
        source: 'github_base',
        message: 'Base source excerpts were unavailable.',
        confidenceImpact: 'low',
      },
    ]);
    expect(JSON.stringify(limitationResult)).not.toContain(secondReadSecret);

    const secondPathSecret = 'synthetic-second-path-secret-Q7v9L2m4';
    let examplePathReads = 0;
    const accessorExample: EnvExampleSnapshot = {
      status: 'absent',
      get path() {
        examplePathReads += 1;
        return examplePathReads === 1 ? '.env.example' : secondPathSecret;
      },
    };
    const pathResult = detectEnvAndSecretSignals({
      ...placeholderInput,
      candidateFiles: [
        { path: 'src/config.ts', content: 'const value = process.env.EXAMPLE_VALUE;' },
      ],
      baseFiles: {
        status: 'available',
        files: [{ path: 'src/config.ts', content: 'const value = process.env.EXAMPLE_VALUE;' }],
      },
      candidateEnvExample: accessorExample,
    });
    expect(examplePathReads).toBe(1);
    expect(JSON.stringify(pathResult)).not.toContain(secondPathSecret);

    for (const name of ['missing', '__proto__', 'constructor', 'toString']) {
      expect(() => createEnvSecretDetectorFixture(name)).toThrow(
        `Unknown env/secret detector fixture: ${name}`
      );
    }
  });
});
