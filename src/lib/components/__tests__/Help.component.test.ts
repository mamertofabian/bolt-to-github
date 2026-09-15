/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Help from '../Help.svelte';

vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('Help GitHub App-only guidance', () => {
  beforeEach(() => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 42 }] as chrome.tabs.Tab[]);
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue(undefined);
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("What's New preserves the content-script message behavior", async () => {
    const user = userEvent.setup();
    render(Help);

    await user.click(screen.getByRole('button', { name: /what's new/i }));

    await waitFor(() => {
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        type: 'SHOW_WHATS_NEW_MODAL',
      });
      expect(window.close).toHaveBeenCalledOnce();
    });
  });

  it('help replaces PAT setup with Bolt2GitHub sign-in and GitHub App installation guidance', async () => {
    const user = userEvent.setup();
    render(Help);

    await user.click(screen.getByRole('button', { name: /github app setup/i }));

    expect(screen.getByText(/sign in to your bolt2github account/i)).toBeInTheDocument();
    expect(screen.getByText(/install the github app/i)).toBeInTheDocument();
    expect(screen.getByText(/choose which repositories/i)).toBeInTheDocument();
  });

  it('help contains no classic fine-grained or token creation instructions', () => {
    const { container } = render(Help);
    const text = container.textContent?.toLowerCase() ?? '';

    expect(text).not.toContain('classic personal access token');
    expect(text).not.toContain('fine-grained access token');
    expect(text).not.toContain('generate token');
    expect(container.querySelector('a[href*="settings/tokens"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href*="personal-access-tokens"]')).not.toBeInTheDocument();
  });

  it('private repository and security help describe GitHub App permissions without PAT language', async () => {
    const user = userEvent.setup();
    render(Help);

    await user.click(screen.getByRole('button', { name: /private repository access/i }));
    expect(screen.getByText(/repository access granted to the github app/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /security & privacy/i }));
    expect(screen.getByText(/short-lived installation credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/revoke access by uninstalling the github app/i)).toBeInTheDocument();
    expect(screen.queryByText(/rotate your token/i)).not.toBeInTheDocument();
  });
});
