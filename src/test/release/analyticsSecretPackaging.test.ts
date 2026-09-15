import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assertAnalyticsSecretNotBundled } from '../../lib/utils/analyticsReleasePolicy';

const repositoryRoot = resolve(__dirname, '../../..');
const Ga4CollectionHost = 'https://www.google-analytics.com/*';

describe('paused extension analytics release packaging', () => {
  it('rejects a configured GA4 API secret before Vite builds', () => {
    expect(() => assertAnalyticsSecretNotBundled('test-secret')).toThrow(/GA4 API secret/i);
    expect(() => assertAnalyticsSecretNotBundled(undefined)).not.toThrow();
  });

  it('Vite config refuses a secret-bearing production build', () => {
    const build = spawnSync('pnpm', ['build'], {
      cwd: repositoryRoot,
      env: { ...process.env, VITE_GA4_API_SECRET: 'must-never-ship' },
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(build.status).not.toBe(0);
    expect(`${build.stdout}\n${build.stderr}`).toMatch(/GA4 API secret/i);
  });

  it('release workflow never supplies a GA4 API secret', () => {
    const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/release.yml'), 'utf8');

    expect(workflow).not.toContain('VITE_GA4_API_SECRET');
  });

  it('packaged extension does not request the GA4 collection host', () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'manifest.json'), 'utf8')) as {
      host_permissions: string[];
    };

    expect(manifest.host_permissions).not.toContain(Ga4CollectionHost);
  });

  it('clean production package omits the GA4 collection permission', () => {
    const build = spawnSync('pnpm', ['build'], {
      cwd: repositoryRoot,
      env: { ...process.env, VITE_GA4_API_SECRET: '' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(build.status).toBe(0);

    const packagedManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'dist/manifest.json'), 'utf8')
    ) as { host_permissions: string[] };
    expect(packagedManifest.host_permissions).not.toContain(Ga4CollectionHost);
  });
});
