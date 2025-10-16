/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PremiumStatus from '../PremiumStatus.svelte';

vi.mock('$lib/stores/premiumStore', () => ({
  default: {
    subscribe: vi.fn(),
  },
  isPremium: {
    subscribe: vi.fn(),
  },
  isAuthenticated: {
    subscribe: vi.fn(),
  },
  premiumStatusActions: {
    logout: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
};

const mockWindowOpen = vi.fn();

describe('PremiumStatus', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockPremiumStatusStore: { subscribe: ReturnType<typeof vi.fn> };
  let mockIsPremium: { subscribe: ReturnType<typeof vi.fn> };
  let mockIsAuthenticated: { subscribe: ReturnType<typeof vi.fn> };
  let mockPremiumStatusActions: {
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    user = userEvent.setup();

    const premiumStoreModule = await import('$lib/stores/premiumStore');
    mockPremiumStatusStore = premiumStoreModule.default as unknown as {
      subscribe: ReturnType<typeof vi.fn>;
    };
    mockIsPremium = premiumStoreModule.isPremium as unknown as {
      subscribe: ReturnType<typeof vi.fn>;
    };
    mockIsAuthenticated = premiumStoreModule.isAuthenticated as unknown as {
      subscribe: ReturnType<typeof vi.fn>;
    };
    mockPremiumStatusActions = premiumStoreModule.premiumStatusActions as unknown as {
      refresh: ReturnType<typeof vi.fn>;
      logout: ReturnType<typeof vi.fn>;
    };

    Object.defineProperty(window, 'chrome', {
      value: mockChrome,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'open', {
      value: mockWindowOpen,
      writable: true,
      configurable: true,
    });

    setupFreeUserState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setupFreeUserState() {
    mockPremiumStatusStore.subscribe.mockImplementation(
      (callback: (value: Record<string, unknown>) => void) => {
        callback({
          isAuthenticated: false,
          isPremium: false,
          plan: 'free',
          expiresAt: undefined,
          features: {
            viewFileChanges: false,
            pushReminders: false,
            branchSelector: false,
            githubIssues: false,
          },
          lastUpdated: 0,
        });
        return () => {};
      }
    );

    mockIsPremium.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(false);
      return () => {};
    });

    mockIsAuthenticated.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(false);
      return () => {};
    });
  }

  function setupPremiumUserState() {
    mockPremiumStatusStore.subscribe.mockImplementation(
      (callback: (value: Record<string, unknown>) => void) => {
        callback({
          isAuthenticated: true,
          isPremium: true,
          plan: 'premium',
          expiresAt: new Date('2025-12-31').getTime(),
          features: {
            viewFileChanges: true,
            pushReminders: true,
            branchSelector: true,
            githubIssues: true,
          },
          lastUpdated: Date.now(),
        });
        return () => {};
      }
    );

    mockIsPremium.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(true);
      return () => {};
    });

    mockIsAuthenticated.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(true);
      return () => {};
    });
  }

  function setupAuthenticatedNonPremiumUserState() {
    mockPremiumStatusStore.subscribe.mockImplementation(
      (callback: (value: Record<string, unknown>) => void) => {
        callback({
          isAuthenticated: true,
          isPremium: false,
          plan: 'free',
          expiresAt: undefined,
          features: {
            viewFileChanges: false,
            pushReminders: false,
            branchSelector: false,
            githubIssues: false,
          },
          lastUpdated: Date.now(),
        });
        return () => {};
      }
    );

    mockIsPremium.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(false);
      return () => {};
    });

    mockIsAuthenticated.subscribe.mockImplementation((callback: (value: boolean) => void) => {
      callback(true);
      return () => {};
    });
  }

  describe('Free User Display', () => {
    it('should display free plan information and upgrade options', () => {
      render(PremiumStatus);

      expect(
        screen.getByRole('heading', { level: 3, name: /premium status/i })
      ).toBeInTheDocument();

      expect(screen.getByText('Free Plan')).toBeInTheDocument();
      expect(screen.getByText('Basic features included')).toBeInTheDocument();

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      expect(upgradeButton).toBeInTheDocument();
      expect(upgradeButton).not.toBeDisabled();

      expect(screen.getByText('Already upgraded?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in to your account/i })).toBeInTheDocument();
    });

    it('should display free plan limitations', () => {
      render(PremiumStatus);

      expect(screen.getByText('Limited to basic repository sync')).toBeInTheDocument();
      expect(screen.getByText('No advanced features')).toBeInTheDocument();
    });

    it('should not show premium features or PRO badge', () => {
      render(PremiumStatus);

      expect(screen.queryByText('PRO')).not.toBeInTheDocument();
      expect(screen.queryByText('File changes analysis')).not.toBeInTheDocument();
      expect(screen.queryByText('Smart push reminders')).not.toBeInTheDocument();
      expect(screen.queryByText('Branch selector')).not.toBeInTheDocument();
      expect(screen.queryByText('Priority support')).not.toBeInTheDocument();
    });
  });

  describe('Premium User Display', () => {
    beforeEach(() => {
      setupPremiumUserState();
    });

    it('should display premium plan information and features', () => {
      render(PremiumStatus);

      expect(
        screen.getByRole('heading', { level: 3, name: /premium status/i })
      ).toBeInTheDocument();

      expect(screen.getByText('Premium Plan')).toBeInTheDocument();
      expect(screen.getByText('All premium features unlocked')).toBeInTheDocument();

      expect(screen.getByText('PRO')).toBeInTheDocument();

      expect(screen.getByText('File changes analysis')).toBeInTheDocument();
      expect(screen.getByText('Smart push reminders')).toBeInTheDocument();
      expect(screen.getByText('Branch selector')).toBeInTheDocument();
      expect(screen.getByText('Priority support')).toBeInTheDocument();
    });

    it('should show renewal information when subscription expires', () => {
      render(PremiumStatus);

      expect(screen.getByText(/renews on/i)).toBeInTheDocument();
    });

    it('should show manage subscription button instead of upgrade options', () => {
      render(PremiumStatus);

      const manageButton = screen.getByRole('button', { name: /manage subscription/i });
      expect(manageButton).toBeInTheDocument();
      expect(manageButton).not.toBeDisabled();

      expect(screen.queryByRole('button', { name: /upgrade to premium/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Already upgraded?')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated Non-Premium User Display', () => {
    beforeEach(() => {
      setupAuthenticatedNonPremiumUserState();
    });

    it('should show upgrade options and account management buttons', () => {
      render(PremiumStatus);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      expect(upgradeButton).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /refresh status/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();

      expect(screen.queryByText('Already upgraded?')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /sign in to your account/i })
      ).not.toBeInTheDocument();
    });

    it('should display account active message for authenticated users', () => {
      render(PremiumStatus);

      expect(screen.getByText('Account active - upgrade for premium features')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    describe('Upgrade Button', () => {
      it('should dispatch upgrade event when clicked', async () => {
        const { component } = render(PremiumStatus);
        const upgradeHandler = vi.fn();
        component.$on('upgrade', upgradeHandler);

        const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
        await user.click(upgradeButton);

        expect(upgradeHandler).toHaveBeenCalled();
      });
    });

    describe('Sign In Button', () => {
      it('should open sign in page when clicked', async () => {
        render(PremiumStatus);

        const signInButton = screen.getByRole('button', { name: /sign in to your account/i });
        await user.click(signInButton);

        expect(mockWindowOpen).toHaveBeenCalledWith('https://bolt2github.com/login', '_blank');
      });
    });

    describe('Manage Subscription Button', () => {
      beforeEach(() => {
        setupPremiumUserState();
      });

      it('should open dashboard when clicked', async () => {
        render(PremiumStatus);

        const manageButton = screen.getByRole('button', { name: /manage subscription/i });
        await user.click(manageButton);

        expect(mockWindowOpen).toHaveBeenCalledWith('https://bolt2github.com/dashboard', '_blank');
      });
    });

    describe('Refresh Button', () => {
      beforeEach(() => {
        setupAuthenticatedNonPremiumUserState();
      });

      it('should show loading state and success feedback when clicked', async () => {
        mockPremiumStatusActions.refresh.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );
        mockChrome.runtime.sendMessage.mockResolvedValue(undefined);

        render(PremiumStatus);

        const refreshButton = screen.getByRole('button', { name: /refresh status/i });
        await user.click(refreshButton);

        expect(screen.getByText('Refreshing...')).toBeInTheDocument();
        expect(refreshButton).toBeDisabled();

        await waitFor(() => {
          expect(screen.getByText('Refreshed!')).toBeInTheDocument();
        });
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockPremiumStatusActions.refresh.mockRejectedValue(new Error('Refresh failed'));
        mockChrome.runtime.sendMessage.mockResolvedValue(undefined);

        render(PremiumStatus);

        const refreshButton = screen.getByRole('button', { name: /refresh status/i });
        await user.click(refreshButton);

        await waitFor(() => {
          expect(refreshButton).not.toBeDisabled();
        });

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Logout Button', () => {
      beforeEach(() => {
        setupAuthenticatedNonPremiumUserState();
      });

      it('should show loading state and success feedback when clicked', async () => {
        mockPremiumStatusActions.logout.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        render(PremiumStatus);

        const logoutButton = screen.getByRole('button', { name: /logout/i });
        await user.click(logoutButton);

        expect(screen.getByText('Logging out...')).toBeInTheDocument();
        expect(logoutButton).toBeDisabled();

        await waitFor(() => {
          expect(screen.getByText('Logged out!')).toBeInTheDocument();
        });
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockPremiumStatusActions.logout.mockRejectedValue(new Error('Logout failed'));

        render(PremiumStatus);

        const logoutButton = screen.getByRole('button', { name: /logout/i });
        await user.click(logoutButton);

        await waitFor(() => {
          expect(logoutButton).not.toBeDisabled();
        });

        consoleErrorSpy.mockRestore();
      });

      it('should prevent multiple clicks while processing', async () => {
        mockPremiumStatusActions.logout.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        render(PremiumStatus);

        const logoutButton = screen.getByRole('button', { name: /logout/i });
        await user.click(logoutButton);
        await user.click(logoutButton);

        expect(mockPremiumStatusActions.logout).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure and button roles', () => {
      render(PremiumStatus);

      expect(
        screen.getByRole('heading', { level: 3, name: /premium status/i })
      ).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in to your account/i })).toBeInTheDocument();
    });

    it('should have proper button states for disabled buttons', async () => {
      setupAuthenticatedNonPremiumUserState();
      mockPremiumStatusActions.refresh.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      mockChrome.runtime.sendMessage.mockResolvedValue(undefined);

      render(PremiumStatus);

      const refreshButton = screen.getByRole('button', { name: /refresh status/i });
      await user.click(refreshButton);

      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle premium user without expiration date', () => {
      mockPremiumStatusStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({
            isAuthenticated: true,
            isPremium: true,
            plan: 'premium',
            expiresAt: undefined,
            features: {
              viewFileChanges: true,
              pushReminders: true,
              branchSelector: true,
              githubIssues: true,
            },
            lastUpdated: Date.now(),
          });
          return () => {};
        }
      );

      mockIsPremium.subscribe.mockImplementation((callback: (value: boolean) => void) => {
        callback(true);
        return () => {};
      });

      mockIsAuthenticated.subscribe.mockImplementation((callback: (value: boolean) => void) => {
        callback(true);
        return () => {};
      });

      render(PremiumStatus);

      expect(screen.getByText('Premium Plan')).toBeInTheDocument();
      expect(screen.queryByText(/renews on/i)).not.toBeInTheDocument();
    });

    it('should render without errors for different user states', () => {
      render(PremiumStatus);

      expect(screen.getByText('Premium Status')).toBeInTheDocument();
    });
  });
});
