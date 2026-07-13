import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { whatsNewContent, type WhatsNewVersion } from '../whatsNewContent';

function textBefore(contents: string, marker: string): string {
  const markerIndex = contents.indexOf(marker);
  return markerIndex >= 0 ? contents.slice(0, markerIndex) : contents;
}

describe('whatsNewContent', () => {
  it('keeps package and Chrome manifest versions aligned for 1.3.22', () => {
    const packageMetadata = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    ) as { version: string };
    const chromeManifest = JSON.parse(
      readFileSync(join(process.cwd(), 'manifest.json'), 'utf8')
    ) as { version: string };
    const developmentGuide = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8');

    expect(packageMetadata.version).toBe('1.3.22');
    expect(chromeManifest.version).toBe('1.3.22');
    expect(developmentGuide).toContain('**Current Version**: v1.3.22');
  });

  it('keeps the v1.3.22 release surfaces final and user-facing', () => {
    const release = whatsNewContent['1.3.22'];
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const currentChangelog = textBefore(changelog, '## 2026-07-13 - Version 1.3.21');
    const currentReadme = textBefore(readme, '### Previous Version: v1.3.21');

    expect(release).toBeDefined();
    expect(release.date).toBe('2026-07-13');
    expect(release.type).toBe('patch');
    expect(changelog).toContain('## 2026-07-13 - Version 1.3.22');
    expect(readme).toContain('### Latest Version: v1.3.22');
    expect(readme).toContain('Bolt2GitHub account');
    expect(readme).toContain('GitHub App');
    expect(
      [release.details, ...release.highlights, currentChangelog, currentReadme].join(' ')
    ).not.toMatch(/TBD|In Development|MAID|Vitest|Playwright/);
  });

  it('GitHub App-only release notes explain the required account migration without zero-usage claims', () => {
    const release = whatsNewContent['1.3.22'];
    const releaseNotes = [
      release?.details,
      ...(release?.highlights ?? []),
      textBefore(
        readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8'),
        '## 2026-07-13 - Version 1.3.21'
      ),
      textBefore(
        readFileSync(join(process.cwd(), 'README.md'), 'utf8'),
        '### Previous Version: v1.3.21'
      ),
    ].join(' ');

    expect(releaseNotes).toMatch(/Bolt2GitHub account/i);
    expect(releaseNotes).toMatch(/GitHub App/i);
    expect(releaseNotes).toMatch(/personal access token support (?:has )?ended/i);
    expect(releaseNotes).toMatch(/repository (?:and project )?mappings? (?:are )?preserved/i);
    expect(releaseNotes).not.toMatch(/(?:zero|no) PAT users|nobody uses PAT|telemetry proved/i);
    expect(releaseNotes).not.toMatch(/database (?:count|query).*PAT/i);
  });

  it('accessible release history no longer advertises PAT or dual authentication as a current option', () => {
    const appIntroduction = whatsNewContent['1.3.2'];
    const historicalCopy = [appIntroduction.details, ...appIntroduction.highlights].join(' ');

    expect(historicalCopy).toContain('GitHub App');
    expect(historicalCopy).not.toMatch(/\bPAT\b|personal access token|dual auth/i);
  });

  it('keeps package and Chrome manifest versions aligned for 1.3.21', () => {
    const PackageVersion_1_3_21 = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    ) as { version: string };
    const ChromeManifestVersion_1_3_21 = JSON.parse(
      readFileSync(join(process.cwd(), 'manifest.json'), 'utf8')
    ) as { version: string };
    const DevelopmentGuideVersion_1_3_21 = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8');

    expect(PackageVersion_1_3_21.version).toBe('1.3.22');
    expect(ChromeManifestVersion_1_3_21.version).toBe('1.3.22');
    expect(DevelopmentGuideVersion_1_3_21).toContain('**Current Version**: v1.3.22');
    expect(whatsNewContent['1.3.21']).toBeDefined();
  });

  it('keeps the v1.3.21 release surfaces final and user-facing', () => {
    const release = whatsNewContent['1.3.21'];
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(release.date).toBe('2026-07-13');
    expect(changelog).toContain('## 2026-07-13 - Version 1.3.21');
    expect(readme).toContain('### Previous Version: v1.3.21');
  });

  it('keeps the v1.3.21 release in accessible history', () => {
    const release: WhatsNewVersion = whatsNewContent['1.3.21'];
    const releaseText = [release.details, ...release.highlights].join(' ');
    const Version_1_3_21_Changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const Version_1_3_21_Readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(release.date).toBe('2026-07-13');
    expect(release.type).toBe('patch');
    expect(release.highlights).toEqual(
      expect.arrayContaining([
        expect.stringContaining('First Install'),
        expect.stringContaining('Login Tabs'),
        expect.stringContaining('Recovery Preserved'),
        expect.stringContaining('GitHub App Retry Loop'),
        expect.stringContaining('Stable Background Checks'),
        expect.stringContaining('Pro Follow-Up'),
      ])
    );
    expect(releaseText).not.toMatch(/TBD|In Development|MAID|Vitest|Playwright/);

    expect(Version_1_3_21_Changelog).toContain('## 2026-07-13 - Version 1.3.21');
    expect(Version_1_3_21_Changelog).toContain('Fresh-Install Login Tab Fix');
    expect(Version_1_3_21_Readme).toContain('### Previous Version: v1.3.21');
    expect(Version_1_3_21_Readme).toContain(
      '#### Version 1.3.21 - Cleaner First-Install Onboarding (July 2026)'
    );
    expect(Version_1_3_21_Readme).toContain('### Previous Version: v1.3.20');
  });

  it('keeps the 1.3.20 modal focused on final user-facing release notes', () => {
    const release: WhatsNewVersion = whatsNewContent['1.3.20'];
    const releaseText = [release.details, ...release.highlights].join(' ');

    expect(release.date).toBe('2026-07-12');
    expect(release.type).toBe('patch');
    expect(release.highlights).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GitHub App'),
        expect.stringContaining('Background Checks'),
        expect.stringContaining('Pro'),
      ])
    );
    expect(releaseText).not.toMatch(/TBD|2026-XX-XX|In Development/);
    expect(releaseText).not.toMatch(
      /\b(MAID|Vitest|Playwright|Edge Function|storage listener|manifest)\b/i
    );
  });

  it('keeps the v1.3.20 changelog and README release-ready', () => {
    const Version_1_3_20_Changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const Version_1_3_20_Readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(Version_1_3_20_Changelog).toContain('## 2026-07-12 - Version 1.3.20');
    expect(Version_1_3_20_Changelog).toContain('Auth Invocation Loop Containment');
    expect(Version_1_3_20_Changelog).toContain('Post-Push Pro Teaser');
    expect(Version_1_3_20_Changelog).not.toMatch(/Version 1\.3\.20[\s\S]{0,400}\bTBD\b/);

    expect(Version_1_3_20_Readme).toContain(
      '#### Version 1.3.20 - Auth Containment & Post-Push Guidance (July 2026)'
    );
    expect(Version_1_3_20_Readme).not.toMatch(/Version 1\.3\.20 - In Development/);
    expect(Version_1_3_20_Readme).not.toMatch(/Version 1\.3\.20[\s\S]{0,300}\bTBD\b/);
  });

  it('keeps the 1.3.19 modal entry focused on user-facing release notes', () => {
    const release: WhatsNewVersion = whatsNewContent['1.3.19'];
    const releaseText = [release.details, ...release.highlights].join(' ');

    expect(release.date).toBe('2026-07-03');
    expect(release.type).toBe('patch');
    expect(release.highlights).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Clearer Push Errors'),
        expect.stringContaining('More Reliable Auth Recovery'),
        expect.stringContaining('GitHub App Stays Connected'),
        expect.stringContaining('Repository Name Validation'),
        expect.stringContaining('Reconnect Notices'),
      ])
    );
    expect(releaseText).toContain('retry right away');
    expect(releaseText).toContain('GitHub App connections survive normal re-authentication');
    expect(releaseText).toContain('page refresh is needed');
    expect(releaseText).not.toMatch(
      /\b(MAID|Vitest|Playwright|BackgroundAuthClient|AuthMessageRouter|manifest|content-script)\b/
    );
  });

  it('keeps the v1.3.19 changelog as the developer-facing release record', () => {
    const Version_1_3_19_Changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');

    expect(Version_1_3_19_Changelog).toContain('## 2026-07-03 - Version 1.3.19');
    expect(Version_1_3_19_Changelog).toContain('Auth Self-Healing Execution');
    expect(Version_1_3_19_Changelog).toContain('Background Auth Storage Recovery');
    expect(Version_1_3_19_Changelog).toContain('GitHub App Re-auth Preservation');
    expect(Version_1_3_19_Changelog).toContain('Single Background Auth Authority');
    expect(Version_1_3_19_Changelog).toContain('Orphaned Content-Script Recovery');
    expect(Version_1_3_19_Changelog).toContain('Auth Lifecycle Manifest Set');
  });
});
