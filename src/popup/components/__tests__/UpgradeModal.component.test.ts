/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import UpgradeModal from '../UpgradeModal.svelte';
import type { PremiumFeature } from '$lib/constants/premiumFeatures';

const mockChromeTabsCreate = vi.fn();
const mockChromeRuntimeSendMessage = vi.fn();

Object.defineProperty(window, 'chrome', {
  value: {
    tabs: {
      create: mockChromeTabsCreate,
    },
    runtime: {
      sendMessage: mockChromeRuntimeSendMessage,
    },
  },
  writable: true,
  configurable: true,
});

const mockIsAuthenticated = vi.fn();
const mockPremiumStatus = vi.fn();

vi.mock('$lib/stores/premiumStore', () => ({
  premiumStatusActions: {
    refresh: vi.fn(),
  },
}));

vi.mock('$lib/stores', () => ({
  isAuthenticated: {
    subscribe: (fn: (value: boolean) => void) => {
      fn(mockIsAuthenticated());
      return () => {};
    },
  },
}));

vi.mock('$lib/stores/premiumStore', () => ({
  default: {
    subscribe: (fn: (value: Record<string, unknown>) => void) => {
      fn(mockPremiumStatus());
      return () => {};
    },
  },
  premiumStatusActions: {
    refresh: vi.fn(),
  },
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('UpgradeModal', () => {
  const mockFeatures: PremiumFeature[] = [
    {
      id: 'view-file-changes',
      name: 'Detailed File Changes',
      description: 'View and compare file changes with GitHub repositories',
      benefits: ['See exactly what changed in each file', 'Side-by-side diff comparison'],
      icon: '📁',
    },
    {
      id: 'push-reminders',
      name: 'Smart Push Reminders',
      description: 'Intelligent reminders to push your changes',
      benefits: ['Never lose work with automatic alerts', 'Customizable reminder intervals'],
      icon: '⏰',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated.mockReturnValue(false);
    mockPremiumStatus.mockReturnValue({
      isPremium: false,
      plan: 'free',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should not render when show is false', () => {
      render(UpgradeModal, {
        props: {
          show: false,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.queryByText('✨ Upgrade to Pro')).not.toBeInTheDocument();
    });

    it('should render when show is true', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('✨ Upgrade to Pro')).toBeInTheDocument();
    });
  });

  describe('Header and Content', () => {
    it('should display upgrade title and feature-specific subtitle', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('✨ Upgrade to Pro')).toBeInTheDocument();
      expect(screen.getByText('Unlock Detailed File Changes')).toBeInTheDocument();
    });

    it('should display correct title for push-reminders feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'push-reminders',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Unlock Smart Push Reminders')).toBeInTheDocument();
    });

    it('should display correct title for issues feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'issues',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Unlock GitHub Issues Management')).toBeInTheDocument();
    });

    it('should display feature-specific message', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          reason: 'Custom reason for upgrade',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Custom reason for upgrade')).toBeInTheDocument();
    });

    it('should display default message when no reason provided', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText(
          'Get detailed file change analysis and comparisons with GitHub repositories. Upgrade for full access!'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Pricing Display', () => {
    it('should display pricing information', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('$4/mo')).toBeInTheDocument();
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('$40/yr')).toBeInTheDocument();
      expect(screen.getByText('Save $8')).toBeInTheDocument();
      expect(screen.getByText('Cancel anytime')).toBeInTheDocument();
    });

    it('should display trust indicators', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('1,000+ developers • Secure payment')).toBeInTheDocument();
    });
  });

  describe('Premium Features Accordion', () => {
    it('should display all provided features', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Pro Features:')).toBeInTheDocument();
      expect(screen.getByText('📁')).toBeInTheDocument();
      expect(screen.getByText('Detailed File Changes')).toBeInTheDocument();
      expect(screen.getByText('⏰')).toBeInTheDocument();
      expect(screen.getByText('Smart Push Reminders')).toBeInTheDocument();
    });

    it('should not display features section when no features provided', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: [],
        },
      });

      expect(screen.queryByText('Pro Features:')).not.toBeInTheDocument();
    });

    it('should toggle feature expansion on click', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      const firstFeatureButton = screen.getByText('Detailed File Changes').closest('button');
      expect(firstFeatureButton).toBeInTheDocument();

      expect(
        screen.queryByText('View and compare file changes with GitHub repositories')
      ).not.toBeInTheDocument();

      await user.click(firstFeatureButton!);

      expect(
        screen.getByText('View and compare file changes with GitHub repositories')
      ).toBeInTheDocument();
      expect(screen.getByText('See exactly what changed in each file')).toBeInTheDocument();
      expect(screen.getByText('Side-by-side diff comparison')).toBeInTheDocument();

      await user.click(firstFeatureButton!);

      expect(
        screen.queryByText('View and compare file changes with GitHub repositories')
      ).not.toBeInTheDocument();
    });

    it('should only allow one feature to be expanded at a time', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      const firstFeatureButton = screen.getByText('Detailed File Changes').closest('button');
      const secondFeatureButton = screen.getByText('Smart Push Reminders').closest('button');

      await user.click(firstFeatureButton!);
      expect(
        screen.getByText('View and compare file changes with GitHub repositories')
      ).toBeInTheDocument();

      await user.click(secondFeatureButton!);
      expect(screen.getByText('Intelligent reminders to push your changes')).toBeInTheDocument();

      expect(
        screen.queryByText('View and compare file changes with GitHub repositories')
      ).not.toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should display upgrade and later buttons', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByRole('button', { name: /upgrade now/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
    });

    it('should open upgrade page when upgrade button is clicked', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      await user.click(screen.getByRole('button', { name: /upgrade now/i }));

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/upgrade',
      });
    });
  });

  describe('Authentication States', () => {
    it('should show sign in link for unauthenticated users', () => {
      mockIsAuthenticated.mockReturnValue(false);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Already upgraded?')).toBeInTheDocument();
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });

    it('should not show sign in link for authenticated users', () => {
      mockIsAuthenticated.mockReturnValue(true);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.queryByText('Already upgraded?')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign in to your account')).not.toBeInTheDocument();
    });

    it('should open sign in page when sign in link is clicked', async () => {
      const user = userEvent.setup();
      mockIsAuthenticated.mockReturnValue(false);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      await user.click(screen.getByText('Sign in to your account'));

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/login',
      });
    });
  });

  describe('Refresh Functionality', () => {
    beforeEach(() => {
      mockIsAuthenticated.mockReturnValue(true);
    });

    it('should show refresh button for authenticated users', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('Already upgraded? Refresh status')).toBeInTheDocument();
    });

    it('should not show refresh button for unauthenticated users', () => {
      mockIsAuthenticated.mockReturnValue(false);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.queryByText('Already upgraded? Refresh status')).not.toBeInTheDocument();
    });

    it('should refresh subscription when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const { premiumStatusActions } = await import('$lib/stores/premiumStore');
      vi.mocked(premiumStatusActions.refresh).mockResolvedValue(undefined);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      await user.click(screen.getByText('Already upgraded? Refresh status'));

      expect(mockChromeRuntimeSendMessage).toHaveBeenCalledWith({
        type: 'FORCE_SUBSCRIPTION_REFRESH',
      });
      expect(premiumStatusActions.refresh).toHaveBeenCalled();
    });

    it('should show loading state while refreshing', async () => {
      const user = userEvent.setup();
      const { premiumStatusActions } = await import('$lib/stores/premiumStore');
      vi.mocked(premiumStatusActions.refresh).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      const refreshButton = screen.getByText('Already upgraded? Refresh status');
      await user.click(refreshButton);

      expect(screen.getByText('Checking subscription...')).toBeInTheDocument();
      expect(refreshButton.closest('button')).toBeDisabled();
    });

    it('should show success feedback after refresh', async () => {
      const user = userEvent.setup();
      const { premiumStatusActions } = await import('$lib/stores/premiumStore');
      vi.mocked(premiumStatusActions.refresh).mockResolvedValue(undefined);
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      await user.click(screen.getByText('Already upgraded? Refresh status'));

      await waitFor(() => {
        expect(screen.getByText('Refreshed!')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle refresh errors gracefully', async () => {
      const user = userEvent.setup();
      const { premiumStatusActions } = await import('$lib/stores/premiumStore');
      vi.mocked(premiumStatusActions.refresh).mockRejectedValue(new Error('Refresh failed'));

      mockIsAuthenticated.mockReturnValue(true);

      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      await user.click(screen.getByText('Already upgraded? Refresh status'));

      await waitFor(() => {
        expect(screen.getByText('Already upgraded? Refresh status')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles and labels', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByRole('button', { name: /upgrade now/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /✕/i })).toBeInTheDocument();
    });

    it('should have accessible feature accordion buttons', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      const featureButtons = screen.getAllByRole('button');
      const featureButtonsWithText = featureButtons.filter(
        (button) =>
          button.textContent?.includes('Detailed File Changes') ||
          button.textContent?.includes('Smart Push Reminders')
      );

      expect(featureButtonsWithText).toHaveLength(2);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      const upgradeButton = screen.getByRole('button', { name: /upgrade now/i });
      upgradeButton.focus();
      expect(upgradeButton).toHaveFocus();

      await user.tab();
      const laterButton = screen.getByRole('button', { name: /later/i });
      expect(laterButton).toHaveFocus();
    });
  });

  describe('Feature-Specific Messages', () => {
    it('should display correct message for file-changes feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText(
          'Get detailed file change analysis and comparisons with GitHub repositories. Upgrade for full access!'
        )
      ).toBeInTheDocument();
    });

    it('should display correct message for push-reminders feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'push-reminders',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText(
          'Stay on top of your work with intelligent push reminders that notify you when you have unsaved changes.'
        )
      ).toBeInTheDocument();
    });

    it('should display correct message for branch-selector feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'branch-selector',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText(
          'Choose specific branches when importing private repositories for better organization.'
        )
      ).toBeInTheDocument();
    });

    it('should display correct message for issues feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'issues',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText(
          'Create, view, and manage GitHub Issues directly from Bolt. Upgrade to streamline your issue tracking workflow!'
        )
      ).toBeInTheDocument();
    });

    it('should display default message for unknown feature', () => {
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'unknown-feature',
          features: mockFeatures,
        },
      });

      expect(
        screen.getByText('Unlock powerful features to enhance your development workflow.')
      ).toBeInTheDocument();
    });
  });

  describe('Modal Behavior', () => {
    it('should close modal when close button is clicked', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('✨ Upgrade to Pro')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /✕/i }));

      await waitFor(() => {
        expect(screen.queryByText('✨ Upgrade to Pro')).not.toBeInTheDocument();
      });
    });

    it('should close modal when later button is clicked', async () => {
      const user = userEvent.setup();
      render(UpgradeModal, {
        props: {
          show: true,
          feature: 'file-changes',
          features: mockFeatures,
        },
      });

      expect(screen.getByText('✨ Upgrade to Pro')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /later/i }));

      await waitFor(() => {
        expect(screen.queryByText('✨ Upgrade to Pro')).not.toBeInTheDocument();
      });
    });
  });
});
