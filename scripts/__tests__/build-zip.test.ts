import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const sourceScript = resolve(process.cwd(), 'build-zip.sh');
const BuildZipFailClosed = 'build-zip.sh';
const workspaces: string[] = [];

function workspace(buildExit: number, zipExit = 0) {
  const root = mkdtempSync(join(tmpdir(), 'b2g-build-zip-'));
  workspaces.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'stale.txt'), 'stale');
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version: '2.0.0' }));
  writeFileSync(join(root, '.env'), 'VITE_GA4_API_SECRET=must-not-ship\n');
  cpSync(sourceScript, join(root, BuildZipFailClosed));
  chmodSync(join(root, BuildZipFailClosed), 0o755);

  writeFileSync(join(bin, 'node'), '#!/bin/sh\nprintf 2.0.0\n');
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh\nprintf '%s' "\${VITE_GA4_API_SECRET-unset}" > build-secret.txt\nmkdir -p dist\nprintf fresh > dist/fresh.txt\nexit ${buildExit}\n`
  );
  writeFileSync(
    join(bin, 'zip'),
    `#!/bin/sh
printf called > ../zip-called.txt
printf partial > "$2"
exit ${zipExit}
`
  );
  for (const command of ['node', 'pnpm', 'zip']) chmodSync(join(bin, command), 0o755);

  return { root, bin };
}

function run(root: string, bin: string, cwd = root) {
  return spawnSync('bash', [join(root, BuildZipFailClosed)], {
    cwd,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('build-zip.sh', () => {
  it('failed build removes stale output and never invokes zip', () => {
    const { root, bin } = workspace(1);
    writeFileSync(join(root, 'bolt-to-github-v2.0.0-build.zip'), 'old zip');

    const result = run(root, bin);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'dist', 'stale.txt'))).toBe(false);
    expect(existsSync(join(root, 'bolt-to-github-v2.0.0-build.zip'))).toBe(false);
    expect(existsSync(join(root, 'zip-called.txt'))).toBe(false);
  });

  it('successful packaging disables GA4 and creates a versioned zip from fresh output', () => {
    const { root, bin } = workspace(0);

    const result = run(root, bin);

    expect(result.status).toBe(0);
    expect(readFileSync(join(root, 'build-secret.txt'), 'utf8')).toBe('');
    expect(existsSync(join(root, 'dist', 'fresh.txt'))).toBe(true);
    expect(existsSync(join(root, 'bolt-to-github-v2.0.0-build.zip'))).toBe(true);
  });

  it('cleanup preserves unrelated release archives', () => {
    const { root, bin } = workspace(0);
    writeFileSync(join(root, 'bolt-to-github-v1.3.21-build.zip'), 'keep');

    expect(run(root, bin).status).toBe(0);
    expect(readFileSync(join(root, 'bolt-to-github-v1.3.21-build.zip'), 'utf8')).toBe('keep');
  });

  it('invocation from another directory only changes the script workspace', () => {
    const { root, bin } = workspace(0);
    const caller = mkdtempSync(join(tmpdir(), 'b2g-build-zip-caller-'));
    workspaces.push(caller);
    mkdirSync(join(caller, 'dist'));
    writeFileSync(join(caller, 'dist', 'caller.txt'), 'keep');
    writeFileSync(join(caller, 'manifest.json'), JSON.stringify({ version: '9.9.9' }));

    expect(run(root, bin, caller).status).toBe(0);
    expect(readFileSync(join(caller, 'dist', 'caller.txt'), 'utf8')).toBe('keep');
    expect(existsSync(join(caller, 'bolt-to-github-v9.9.9-build.zip'))).toBe(false);
    expect(existsSync(join(root, 'bolt-to-github-v2.0.0-build.zip'))).toBe(true);
  });

  it('failed zip leaves no partial final archive', () => {
    const { root, bin } = workspace(0, 1);

    const result = run(root, bin);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'bolt-to-github-v2.0.0-build.zip'))).toBe(false);
    expect(existsSync(join(root, 'bolt-to-github-v2.0.0-build.zip.tmp'))).toBe(false);
  });
});
