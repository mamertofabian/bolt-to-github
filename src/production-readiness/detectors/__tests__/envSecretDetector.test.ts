import { describe, expect, it } from 'vitest';

import {
  detectEnvAndSecretSignals,
  type EnvSecretDetectionResult,
  type EnvSecretDetectorInput,
  type PrsTextFile,
} from '../envSecretDetector';
import { extractEnvReferences, type EnvReference } from '../../rules/env-patterns';
import { detectSecretLikePatterns, type SecretPatternMatch } from '../../rules/secret-patterns';

function input(overrides: Partial<EnvSecretDetectorInput> = {}): EnvSecretDetectorInput {
  return {
    candidateFiles: [],
    baseFiles: [],
    baseFilesAvailable: true,
    candidateEnvExample: null,
    baseEnvExample: null,
    ...overrides,
  };
}

describe('Production Readiness Snapshot environment and secret detector', () => {
  it('detects env references across supported syntaxes', () => {
    const references = extractEnvReferences(`
      const database = process.env.DATABASE_URL;
      const bracket = process.env["BRACKET_VALUE"];
      const single = process.env['SINGLE_QUOTED'];
      const vite = import.meta.env.VITE_API_URL;
      const deno = Deno.env.get("DENO_TOKEN");
      const bun = Bun.env.PUBLIC_ORIGIN;
      const nextPublic = NEXT_PUBLIC_ASSET_URL;
      const duplicate = process.env.DATABASE_URL;
    `);
    const expectedReferences: EnvReference[] = [
      { name: 'BRACKET_VALUE', public: false },
      { name: 'DATABASE_URL', public: false },
      { name: 'DENO_TOKEN', public: false },
      { name: 'NEXT_PUBLIC_ASSET_URL', public: true },
      { name: 'PUBLIC_ORIGIN', public: true },
      { name: 'SINGLE_QUOTED', public: false },
      { name: 'VITE_API_URL', public: true },
    ];

    expect(references).toEqual(expectedReferences);
  });

  it('reports new env vars and stale env example coverage', () => {
    const result: EnvSecretDetectionResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/config.ts',
            content: `
              export const existing = process.env.EXISTING;
              export const server = process.env.NEW_SERVER_KEY;
              export const browser = import.meta.env.VITE_NEW_PUBLIC;
            `,
          },
        ],
        baseFiles: [
          {
            path: 'src/config.ts',
            content: `
              export const existing = process.env.EXISTING;
              export const removed = process.env.REMOVED_KEY;
            `,
          },
        ],
        candidateEnvExample: 'EXISTING=',
        baseEnvExample: 'EXISTING=\\nREMOVED_KEY=',
      })
    );

    expect(result.detectedVariables).toEqual(['EXISTING', 'NEW_SERVER_KEY', 'VITE_NEW_PUBLIC']);
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'env-example-missing-coverage',
      'env-public-variable-introduced',
      'env-variable-introduced',
      'env-variable-removed',
    ]);
    expect(result.signals[0].evidence.map((evidence) => evidence.label)).toEqual([
      'NEW_SERVER_KEY',
      'VITE_NEW_PUBLIC',
    ]);
    expect(result.signals[1].evidence).toEqual([
      {
        kind: 'env_var',
        label: 'VITE_NEW_PUBLIC',
        path: 'src/config.ts',
      },
    ]);
    expect(result.signals[2].evidence.map((evidence) => evidence.label)).toEqual([
      'NEW_SERVER_KEY',
      'VITE_NEW_PUBLIC',
    ]);
    expect(result.signals[3].evidence.map((evidence) => evidence.label)).toEqual(['REMOVED_KEY']);

    const unavailableComparison = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/config.ts',
            content: 'export const key = process.env.CANDIDATE_ONLY;',
          },
        ],
        baseFilesAvailable: false,
        candidateEnvExample: 'CANDIDATE_ONLY=',
      })
    );

    expect(unavailableComparison.signals.map((signal) => signal.id)).toEqual([
      'env-comparison-unavailable',
    ]);
    expect(unavailableComparison.signals.some((signal) => signal.id.includes('introduced'))).toBe(
      false
    );

    const documentedOnly = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          { path: '.env.example', content: 'VITE_DOC_ONLY=' },
          {
            path: 'README.md',
            content: 'Set NEXT_PUBLIC_DOCUMENTED_ONLY before starting the app.',
          },
        ],
        candidateEnvExample: 'VITE_DOC_ONLY=\nNEXT_PUBLIC_DOCUMENTED_ONLY=',
      })
    );
    expect(documentedOnly.detectedVariables).toEqual([]);
    expect(documentedOnly.signals).toEqual([]);
  });

  it('reports committed env files without displaying their values', () => {
    const secretValues = [
      ['stripe', 'live', 'value'].join('-'),
      ['local', 'database', 'password'].join('-'),
      ['production', 'token', 'value'].join('-'),
    ];
    const candidateFiles: PrsTextFile[] = [
      { path: '.env', content: `STRIPE_KEY=${secretValues[0]}` },
      { path: '.env.local', content: `DATABASE_PASSWORD=${secretValues[1]}` },
      { path: 'config/.env.production', content: `API_TOKEN=${secretValues[2]}` },
      { path: '.env.example', content: 'STRIPE_KEY=' },
      { path: '.env.test.example', content: 'SAFE_SAMPLE=' },
    ];
    const result = detectEnvAndSecretSignals(
      input({
        candidateFiles,
      })
    );

    const envFileSignal = result.signals.find((signal) => signal.id === 'env-file-in-export');
    expect(envFileSignal?.severity).toBe('critical');
    expect(envFileSignal?.evidence).toEqual([
      {
        kind: 'file',
        label: 'Environment file included in export',
        path: '.env',
        redacted: true,
      },
      {
        kind: 'file',
        label: 'Environment file included in export',
        path: '.env.local',
        redacted: true,
      },
      {
        kind: 'file',
        label: 'Environment file included in export',
        path: 'config/.env.production',
        redacted: true,
      },
    ]);
    expect(result.redactionApplied).toBe(true);

    const serialized = JSON.stringify(result);
    expect(secretValues.some((value) => serialized.includes(value))).toBe(false);
  });

  it('redacts secret looking values from all detector output', () => {
    const providerKey = ['sk', 'live', 'A'.repeat(28)].join('_');
    const messagingKey = ['xoxb', 'b'.repeat(20)].join('-');
    const privateKeyBody = 'C'.repeat(48);
    const highEntropyValue = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tV0xY1z';
    const sourceText = `
      export const apiKey = '${providerKey}';
      export const integration = '${messagingKey}';
      export const privateKey = '-----BEGIN PRIVATE KEY-----${privateKeyBody}-----END PRIVATE KEY-----';
      export const opaqueConfig = '${highEntropyValue}';
      export const token = getToken();
    `;

    const expectedMatches: SecretPatternMatch[] = [
      { pattern: 'credential-assignment', redacted: true },
      { pattern: 'high-entropy-config-value', redacted: true },
      { pattern: 'pem-private-key', redacted: true },
      { pattern: 'provider-key-prefix', redacted: true },
    ];
    expect(detectSecretLikePatterns(sourceText)).toEqual(expectedMatches);

    const result = detectEnvAndSecretSignals(
      input({
        candidateFiles: [{ path: 'src/config.ts', content: sourceText }],
      })
    );
    const signal = result.signals.find((candidate) => candidate.id === 'possible-secret-value');

    expect(signal?.title).toContain('Possible');
    expect(signal?.message).not.toContain('vulnerability');
    expect(
      signal?.evidence.map(({ label, path, redacted }) => ({ label, path, redacted }))
    ).toEqual([
      {
        label: 'credential-assignment',
        path: 'src/config.ts',
        redacted: true,
      },
      {
        label: 'high-entropy-config-value',
        path: 'src/config.ts',
        redacted: true,
      },
      {
        label: 'pem-private-key',
        path: 'src/config.ts',
        redacted: true,
      },
      {
        label: 'provider-key-prefix',
        path: 'src/config.ts',
        redacted: true,
      },
    ]);
    expect(result.redactionApplied).toBe(true);

    const serialized = JSON.stringify(result);
    const secretValues = [providerKey, messagingKey, privateKeyBody, highEntropyValue];
    expect(secretValues.some((value) => serialized.includes(value))).toBe(false);

    const ordinaryLiterals = `
      export const token = 'development';
      export const buildLabel = 'ordinaryMixedCaseIdentifier2026Alpha';
    `;
    expect(detectSecretLikePatterns(ordinaryLiterals)).toEqual([]);

    const nonConfigResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/components/Identifier.ts',
            content: `export const identifier = '${highEntropyValue}';`,
          },
        ],
      })
    );
    expect(
      nonConfigResult.signals.some((candidate) => candidate.id === 'possible-secret-value')
    ).toBe(false);

    const compoundCredentialResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/service.ts',
            content: `
              export const clientSecret = '${highEntropyValue}';
              export const authToken = '${highEntropyValue}';
              export const databasePassword = '${highEntropyValue}';
              export const serviceCredential = '${highEntropyValue}';
            `,
          },
        ],
      })
    );
    expect(
      compoundCredentialResult.signals.find((candidate) => candidate.id === 'possible-secret-value')
        ?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'credential-assignment',
        path: 'src/service.ts',
        redacted: true,
      },
    ]);

    const templateCredentialSource = ['export const clientSecret = `', highEntropyValue, '`;'].join(
      ''
    );
    expect(detectSecretLikePatterns(templateCredentialSource)).toEqual([
      { pattern: 'credential-assignment', redacted: true },
      { pattern: 'high-entropy-config-value', redacted: true },
    ]);

    const quotedCredentialResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/object.ts',
            content: `export const options = { "clientSecret": "${highEntropyValue}" };`,
          },
        ],
      })
    );
    expect(
      quotedCredentialResult.signals.find((candidate) => candidate.id === 'possible-secret-value')
        ?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'credential-assignment',
        path: 'src/object.ts',
        redacted: true,
      },
    ]);

    const typedCredentialResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/typed.ts',
            content: `export const clientSecret: string = "${highEntropyValue}";`,
          },
        ],
      })
    );
    expect(
      typedCredentialResult.signals.find((candidate) => candidate.id === 'possible-secret-value')
        ?.evidence
    ).toEqual([
      {
        kind: 'pattern',
        label: 'credential-assignment',
        path: 'src/typed.ts',
        redacted: true,
      },
    ]);

    const siblingFalsePositive = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/safe-object.ts',
            content: `export const options = { clientSecret: false, buildLabel: "${highEntropyValue}" };`,
          },
        ],
      })
    );
    expect(
      siblingFalsePositive.signals.some((candidate) => candidate.id === 'possible-secret-value')
    ).toBe(false);

    const adjacentCredentials = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          {
            path: 'src/adjacent-object.ts',
            content: `export const options = { enabled: true, clientSecret: "${highEntropyValue}" };`,
          },
          {
            path: 'src/typed-parameter.ts',
            content: `export function connect(options: SomeType, clientSecret: string = "${highEntropyValue}") {}`,
          },
        ],
      })
    );
    expect(
      adjacentCredentials.signals
        .find((candidate) => candidate.id === 'possible-secret-value')
        ?.evidence.map((evidence) => evidence.path)
    ).toEqual(['src/adjacent-object.ts', 'src/typed-parameter.ts']);

    const canonicalConfigResult = detectEnvAndSecretSignals(
      input({
        candidateFiles: [
          { path: 'settings.json', content: `"identifier": "${highEntropyValue}"` },
          { path: 'appsettings.json', content: `"identifier": "${highEntropyValue}"` },
          { path: 'credentials.json', content: `"identifier": "${highEntropyValue}"` },
          { path: 'deployment.yaml', content: `identifier: "${highEntropyValue}"` },
          { path: 'src/ä-config.ts', content: `identifier = "${highEntropyValue}"` },
          { path: 'src/Z-config.ts', content: `identifier = "${highEntropyValue}"` },
        ],
      })
    );
    expect(
      canonicalConfigResult.signals
        .find((candidate) => candidate.id === 'possible-secret-value')
        ?.evidence.map((evidence) => evidence.path)
    ).toEqual([
      'appsettings.json',
      'credentials.json',
      'deployment.yaml',
      'settings.json',
      'src/Z-config.ts',
      'src/ä-config.ts',
    ]);
  });
});
