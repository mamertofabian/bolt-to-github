import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');
const ReleaseQualityGate = [
  ['Lint', 'pnpm lint'],
  ['Check types', 'pnpm check'],
  ['Run unit tests', 'pnpm test:ci'],
  [
    'Validate MAID behavioral contracts',
    './scripts/maid validate --manifest-dir manifests --mode behavioral',
  ],
  [
    'Validate MAID implementation contracts',
    './scripts/maid validate --manifest-dir manifests --mode implementation',
  ],
] as const;
const ReleaseVersionGate = 'Verify release version';

function stepPosition(name: string): number {
  return workflow.indexOf(`      - name: ${name}`);
}

function stepBody(name: string): string {
  const start = stepPosition(name);
  if (start < 0) return '';
  const next = workflow.indexOf('\n      - name:', start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

describe('release workflow gate', () => {
  it('publishing follows lint type unit and MAID validation gates', () => {
    const publish = stepPosition('Create Release');
    const packageBuild = stepPosition('Build project');
    expect(publish).toBeGreaterThan(0);

    for (const [name, command] of ReleaseQualityGate) {
      const position = stepPosition(name);
      expect(position, `${name} is present`).toBeGreaterThan(0);
      expect(position, `${name} precedes build`).toBeLessThan(packageBuild);
      expect(stepBody(name)).toContain(`run: ${command}`);
    }
    expect(packageBuild).toBeLessThan(stepPosition('Zip build artifacts'));
    expect(stepPosition('Zip build artifacts')).toBeLessThan(publish);
  });

  it('browser release slice runs under Xvfb after the production build', () => {
    const install = stepBody('Install Chromium for browser tests');
    const browser = stepBody('Run browser release tests');

    expect(install).toContain('pnpm exec playwright install --with-deps chromium');
    expect(browser).toContain('xvfb-run -a pnpm exec playwright test');
    for (const spec of ['auth', 'lifecycle', 'error-flow-product', 'manual-repo']) {
      expect(browser).toContain(`e2e/${spec}.spec.ts`);
    }
    expect(stepPosition('Install Chromium for browser tests')).toBeLessThan(
      stepPosition('Run browser release tests')
    );
    expect(stepPosition('Build project')).toBeLessThan(stepPosition('Run browser release tests'));
    expect(stepPosition('Run browser release tests')).toBeLessThan(
      stepPosition('Zip build artifacts')
    );
  });

  it('version gate rejects mismatched release tags before publication', () => {
    const gate = stepBody(ReleaseVersionGate);

    expect(gate).toContain('PACKAGE_VERSION');
    expect(gate).toContain('MANIFEST_VERSION');
    expect(gate).toContain('VERSION');
    expect(gate).toContain('test "$VERSION" = "v$PACKAGE_VERSION"');
    expect(gate).toContain('test "$PACKAGE_VERSION" = "$MANIFEST_VERSION"');
    expect(stepPosition(ReleaseVersionGate)).toBeLessThan(stepPosition('Build project'));
    expect(workflow).not.toContain("default: 'manual-build'");
    expect(stepBody('Create Release')).toContain('tag_name: ${{ env.VERSION }}');
  });

  it('no release step bypasses failed gates', () => {
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(workflow).not.toMatch(/if:\s*\$\{\{\s*always\(\)/);
    expect(stepBody('Create Release')).toContain('softprops/action-gh-release@v2');
    for (const name of [
      'Set version',
      'Verify release version',
      ...ReleaseQualityGate.map(([gate]) => gate),
      'Build project',
      'Install Chromium for browser tests',
      'Run browser release tests',
      'Verify release tag target',
      'Zip build artifacts',
      'Create Release',
    ]) {
      expect(stepBody(name), `${name} is present`).not.toBe('');
      expect(stepBody(name), `${name} is unconditional`).not.toMatch(/^\s+if:/m);
    }
  });

  it('CI installs and pins MAID Runner before validation', () => {
    expect(stepBody('Setup uv')).toContain('astral-sh/setup-uv@v6');
    expect(workflow).toContain('MAID_RUNNER_SPEC: maid-runner[all]@2.27.5');
    expect(stepPosition('Setup uv')).toBeLessThan(
      stepPosition('Validate MAID behavioral contracts')
    );
  });

  it('release tag is bound to the packaged commit', () => {
    const tagCheck = stepBody('Verify release tag target');

    expect(tagCheck).toContain('bash scripts/verify-release-tag.sh "$VERSION" "$GITHUB_SHA"');
    expect(stepPosition('Verify release tag target')).toBeLessThan(stepPosition('Create Release'));
    expect(stepBody('Create Release')).toContain('target_commitish: ${{ github.sha }}');
  });
});
