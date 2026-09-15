/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import AnalyticsToggle from '../AnalyticsToggle.svelte';

vi.mock('svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('svelte')>();
  return { ...actual, onMount: (callback: () => void) => callback() };
});

vi.mock('../../../../services/AnalyticsService', () => ({
  analytics: { setAnalyticsEnabled: vi.fn().mockResolvedValue(undefined) },
}));

import { analytics } from '../../../../services/AnalyticsService';

describe('AnalyticsToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      analyticsEnabled: true,
    });
    Object.assign(chrome.runtime, { setUninstallURL: vi.fn().mockResolvedValue(undefined) });
  });

  it('shows GA4 is paused and discloses uninstall feedback usage', () => {
    render(AnalyticsToggle);

    expect(
      screen.getByText(/Google Analytics event tracking is paused for v2\.0\.0/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/feedback link can include anonymous usage counts/i)
    ).toBeInTheDocument();
  });

  it('offers a separate uninstall feedback usage opt-out', async () => {
    render(AnalyticsToggle);

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Include anonymous usage counts in uninstall feedback',
    });
    await waitFor(() => expect(chrome.storage.sync.get).toHaveBeenCalledWith(['analyticsEnabled']));
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(checkbox).not.toBeDisabled();
  });

  it('turning off uninstall feedback clears its URL and saves the preference', async () => {
    render(AnalyticsToggle);
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Include anonymous usage counts in uninstall feedback',
    });
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    await userEvent.setup().click(checkbox);

    await waitFor(() => {
      expect(chrome.runtime.setUninstallURL).toHaveBeenCalledWith('');
      expect(analytics.setAnalyticsEnabled).toHaveBeenCalledWith(false);
    });
    expect(checkbox).not.toBeChecked();
  });
});
