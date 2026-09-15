import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VerifyReleaseTag = resolve(process.cwd(), 'scripts/verify-release-tag.sh');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'b2g-release-tag-'));
const remote = join(temporaryRoot, 'remote.git');
const checkout = join(temporaryRoot, 'checkout');
const emptyHooks = join(temporaryRoot, 'empty-hooks');
let taggedCommit = '';
let newerCommit = '';

function git(...args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
}

function verify(tag: string, commit: string) {
  return spawnSync('bash', [VerifyReleaseTag, tag, commit], {
    cwd: checkout,
    encoding: 'utf8',
  });
}

describe('release tag target verification', () => {
  beforeAll(() => {
    execFileSync('git', ['init', '-q', '--bare', remote]);
    mkdirSync(checkout);
    mkdirSync(emptyHooks);
    git('init', '-q');
    git('config', 'core.hooksPath', emptyHooks);
    git('config', 'user.name', 'Release Gate Test');
    git('config', 'user.email', 'release-gate@example.invalid');
    writeFileSync(join(checkout, 'fixture.txt'), 'first\n');
    git('add', 'fixture.txt');
    git('commit', '-m', 'first');
    taggedCommit = git('rev-parse', 'HEAD');
    git('tag', 'v2.0.0');
    git('tag', '-a', 'v2.0.1', '-m', 'annotated');
    git('remote', 'add', 'origin', remote);
    git('push', 'origin', '--tags');
    git('commit', '--allow-empty', '-m', 'second');
    newerCommit = git('rev-parse', 'HEAD');
  });

  afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  it('allows a missing tag for creation at the built commit', () => {
    expect(verify('v2.0.2', newerCommit).status).toBe(0);
  });

  it('accepts matching lightweight and annotated tags', () => {
    expect(verify('v2.0.0', taggedCommit).status).toBe(0);
    expect(verify('v2.0.1', taggedCommit).status).toBe(0);
  });

  it('rejects an existing tag pointing to another commit', () => {
    const result = verify('v2.0.0', newerCommit);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/points to a different commit/i);
  });

  it('fails closed when the tag remote is unavailable', () => {
    git('remote', 'set-url', 'origin', join(temporaryRoot, 'missing.git'));
    try {
      const result = verify('v2.0.0', taggedCommit);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/could not read remote release tags/i);
    } finally {
      git('remote', 'set-url', 'origin', remote);
    }
  });
});
