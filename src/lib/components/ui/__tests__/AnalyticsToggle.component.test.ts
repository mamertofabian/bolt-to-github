/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import AnalyticsToggle from '../AnalyticsToggle.svelte';

vi.mock('../../../../services/AnalyticsService', () => ({
  analytics: {
    isAnalyticsEnabled: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
  },
}));

vi.mock('../../../utils/analytics', () => ({
  sendAnalyticsToBackground: vi.fn(),
}));

import { analytics } from '../../../../services/AnalyticsService';
import { sendAnalyticsToBackground } from '../../../utils/analytics';

const mockAnalytics = analytics as ReturnType<typeof vi.mocked<typeof analytics>>;
const mockSendAnalytics = sendAnalyticsToBackground as ReturnType<
  typeof vi.mocked<typeof sendAnalyticsToBackground>
>;

describe('AnalyticsToggle', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();

    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      analyticsEnabled: true,
    });
    mockAnalytics.isAnalyticsEnabled.mockResolvedValue(true);
    mockAnalytics.setAnalyticsEnabled.mockResolvedValue(undefined);
    mockSendAnalytics.mockResolvedValue(undefined);
  });

  describe('Component Rendering', () => {
    it('should render the privacy and analytics section', async () => {
      render(AnalyticsToggle);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Privacy & Analytics' })).toBeInTheDocument();
      });
    });

    it('should render the privacy description', async () => {
      render(AnalyticsToggle);

      await waitFor(() => {
        expect(
          screen.getByText(/help us improve the extension with anonymous usage analytics/i)
        ).toBeInTheDocument();
      });
    });

    it('should render the privacy badge', async () => {
      render(AnalyticsToggle);

      await waitFor(() => {
        expect(screen.getByText('Privacy')).toBeInTheDocument();
      });
    });

    it('should render the toggle label', async () => {
      render(AnalyticsToggle);

      await waitFor(() => {
        expect(screen.getByText('Share anonymous usage analytics')).toBeInTheDocument();
      });
    });

    it('should render the expandable details section', async () => {
      render(AnalyticsToggle);

      await waitFor(() => {
        expect(screen.getByText('What data do we collect?')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should allow user to expand and collapse the data collection details', async () => {
      render(AnalyticsToggle);

      const detailsSummary = screen.getByText('What data do we collect?');
      expect(detailsSummary).toBeInTheDocument();

      await user.click(detailsSummary);

      await waitFor(() => {
        expect(
          screen.getByText('Extension usage patterns (buttons clicked, features used)')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Performance metrics (upload times, success/failure rates)')
        ).toBeInTheDocument();
        expect(screen.getByText('Error reports for debugging purposes')).toBeInTheDocument();
        expect(
          screen.getByText('General usage statistics (installations, updates)')
        ).toBeInTheDocument();
      });

      await user.click(detailsSummary);
    });

    it('should show privacy protection information when expanded', async () => {
      render(AnalyticsToggle);

      const detailsSummary = screen.getByText('What data do we collect?');
      await user.click(detailsSummary);

      await waitFor(() => {
        expect(screen.getByText('Privacy Protected')).toBeInTheDocument();
        const elements = screen.getAllByText((content, element) => {
          return (
            element?.textContent?.includes(
              'We never collect your code, repository contents, GitHub tokens'
            ) || false
          );
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state initially', () => {
      render(AnalyticsToggle);

      expect(
        screen.queryByRole('checkbox', { name: 'Share anonymous usage analytics' })
      ).not.toBeInTheDocument();

      expect(screen.getByText('Share anonymous usage analytics')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Storage unavailable')
      );

      render(AnalyticsToggle);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Privacy & Analytics' })).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', async () => {
      render(AnalyticsToggle);

      const heading = await screen.findByRole('heading', { name: 'Privacy & Analytics' });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H3');
    });

    it('should have accessible details/summary structure', async () => {
      render(AnalyticsToggle);

      const detailsSummary = screen.getByText('What data do we collect?');
      expect(detailsSummary).toBeInTheDocument();

      expect(detailsSummary.closest('summary')).toBeInTheDocument();
    });

    it('should have proper label for toggle', async () => {
      render(AnalyticsToggle);

      const label = screen.getByText('Share anonymous usage analytics');
      expect(label).toBeInTheDocument();
      expect(label.tagName).toBe('LABEL');
      expect(label).toHaveAttribute('for', 'analytics-toggle');
    });
  });
});
