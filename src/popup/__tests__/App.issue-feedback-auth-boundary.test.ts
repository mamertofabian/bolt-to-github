import { describe, expect, it, vi } from 'vitest';
import App from '../App.svelte';
import appSource from '../App.svelte?raw';

vi.mock('../App.svelte', () => ({ default: vi.fn() }));

describe('popup issue and feedback authentication boundary', () => {
  it('popup app no longer forwards PAT capabilities to issue and feedback modals', () => {
    expect(App).toBeDefined();
    expect(appSource).not.toContain('effectiveGithubToken');
    expect(appSource).not.toMatch(/<FeedbackModal[\s\S]*?githubToken=/);
    expect(appSource).not.toMatch(/<IssueManager[\s\S]*?githubToken=/);
  });
});
