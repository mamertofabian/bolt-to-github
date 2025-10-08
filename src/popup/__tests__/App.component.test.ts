/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from '../App.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/card');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

vi.mock('../components/FileChangesModal.svelte', async () => {
  const mock = await import('./__mocks__/FileChangesModal.svelte');
  return { default: mock.default };
});

vi.mock('../components/TempRepoModal.svelte', async () => {
  const mock = await import('./__mocks__/TempRepoModal.svelte');
  return { default: mock.default };
});

vi.mock('../components/PushReminderSettings.svelte', async () => {
  const mock = await import('./__mocks__/PushReminderSettings.svelte');
  return { default: mock.default };
});

vi.mock('../components/UpgradeModal.svelte', async () => {
  const mock = await import('./__mocks__/UpgradeModal.svelte');
  return { default: mock.default };
});

vi.mock('../components/FeedbackModal.svelte', async () => {
  const mock = await import('./__mocks__/FeedbackModal.svelte');
  return { default: mock.default };
});

vi.mock('$lib/components/NewsletterModal.svelte', async () => {
  const mock = await import('./__mocks__/NewsletterModal.svelte');
  return { default: mock.default };
});

vi.mock('$lib/components/SuccessToast.svelte', async () => {
  const mock = await import('./__mocks__/SuccessToast.svelte');
  return { default: mock.default };
});

vi.mock('$lib/components/IssueManager.svelte', async () => {
  const mock = await import('./__mocks__/IssueManager.svelte');
  return { default: mock.default };
});

vi.mock('../components/TabsView.svelte', async () => {
  const mock = await import('./__mocks__/TabsView.svelte');
  return { default: mock.default };
});

vi.mock('../components/OnboardingView.svelte', async () => {
  const mock = await import('./__mocks__/OnboardingView.svelte');
  return { default: mock.default };
});

vi.mock('$lib/stores', () => {
  function createStore<T>(initialValue: T) {
    let value = initialValue;
    const subscribers = new Set<(value: T) => void>();

    return {
      subscribe: (callback: (value: T) => void) => {
        subscribers.add(callback);
        callback(value);
        return () => subscribers.delete(callback);
      },
      set: (newValue: T) => {
        value = newValue;
        subscribers.forEach((callback) => callback(value));
      },
      update: (updater: (value: T) => T) => {
        value = updater(value);
        subscribers.forEach((callback) => callback(value));
      },
      get: () => value,
    };
  }

  const githubSettingsStore = createStore({
    hasInitialSettings: false,
    repoOwner: '',
    githubToken: '',
    repoName: '',
    branch: 'main',
    authenticationMethod: 'pat' as 'pat' | 'github_app',
    githubAppInstallationId: null as number | null,
  });

  const projectSettingsStore = createStore({
    version: '1.3.12',
  });

  const uiStateStore = createStore({
    activeTab: 'home' as const,
    statusMessage: '',
    showTempRepoModal: false,
    tempRepoData: null,
    hasDeletedTempRepo: false,
    hasUsedTempRepoName: false,
  });

  const fileChangesStore = createStore({
    showModal: false,
    fileChanges: new Map(),
  });

  const isSettingsValid = createStore(false);
  const isAuthenticationValid = createStore(false);
  const isOnBoltProject = createStore(false);
  const currentProjectId = createStore<string | null>(null);
  const isAuthenticated = createStore(false);
  const isPremium = createStore(false);

  return {
    githubSettingsStore,
    projectSettingsStore,
    uiStateStore,
    fileChangesStore,
    isSettingsValid,
    isAuthenticationValid,
    isOnBoltProject,
    currentProjectId,
    isAuthenticated,
    isPremium,
    githubSettingsActions: {
      initialize: vi.fn().mockResolvedValue(undefined),
      loadProjectSettings: vi.fn(),
      setProjectSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue({ success: true }),
      setRepoName: vi.fn(),
      setAuthenticationMethod: vi.fn(),
    },
    projectSettingsActions: {
      initialize: vi.fn().mockResolvedValue(undefined),
      detectCurrentProject: vi.fn().mockResolvedValue(undefined),
    },
    uiStateActions: {
      setActiveTab: vi.fn((tab: string) => {
        uiStateStore.update((state) => ({ ...state, activeTab: tab as never }));
      }),
      showStatus: vi.fn(),
      clearStatus: vi.fn(),
      showTempRepoModal: vi.fn(),
      hideTempRepoModal: vi.fn(),
      markTempRepoDeleted: vi.fn(),
      markTempRepoNameUsed: vi.fn(),
      canCloseTempRepoModal: vi.fn().mockResolvedValue(true),
    },
    fileChangesActions: {
      processFileChangesMessage: vi.fn(),
      setFileChanges: vi.fn(),
      showModal: vi.fn(),
      loadStoredFileChanges: vi.fn().mockResolvedValue(false),
      requestFileChangesFromContentScript: vi.fn().mockResolvedValue(undefined),
    },
    uploadStateActions: {
      initializePort: vi.fn(),
      disconnect: vi.fn(),
      handleUploadStatusMessage: vi.fn(),
    },
    premiumStatusActions: {
      initialize: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: {
    addPortMessageHandler: vi.fn(),
    sendDeleteTempRepoMessage: vi.fn(),
    cleanup: vi.fn(),
  },
}));

vi.mock('$lib/services/chromeStorage', () => ({
  ChromeStorageService: {
    saveProjectSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/SubscriptionService', () => ({
  SubscriptionService: {
    getSubscriptionStatus: vi.fn().mockResolvedValue({ subscribed: false }),
    incrementInteractionCount: vi.fn().mockResolvedValue(undefined),
    shouldShowSubscriptionPrompt: vi.fn().mockResolvedValue(false),
    updateLastPromptDate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('$lib/utils/windowMode', () => ({
  isWindowMode: vi.fn().mockReturnValue(false),
  openPopupWindow: vi.fn().mockResolvedValue(undefined),
  closePopupWindow: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('$lib/utils/upgradeModal', () => ({
  setUpgradeModalState: vi.fn((type, callback) => {
    callback('premium', 'Test reason', []);
  }),
  getUpgradeModalConfig: vi.fn(() => ({
    feature: 'general',
    reason: 'Test reason',
    features: [],
  })),
}));

describe('App.svelte - Component Tests', () => {
  let chromeMocks: {
    runtime: {
      sendMessage: ReturnType<typeof vi.fn>;
      getManifest: ReturnType<typeof vi.fn>;
      onMessage: {
        addListener: ReturnType<typeof vi.fn>;
      };
    };
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
      sync: {
        get: ReturnType<typeof vi.fn>;
      };
    };
    tabs: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stores: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const storesModule = await import('$lib/stores');
    stores = storesModule;

    stores.githubSettingsStore.set({
      hasInitialSettings: false,
      repoOwner: '',
      githubToken: '',
      repoName: '',
      branch: 'main',
      authenticationMethod: 'pat' as 'pat' | 'github_app',
      githubAppInstallationId: null as number | null,
    });
    stores.projectSettingsStore.set({ version: '1.3.12' });
    stores.uiStateStore.set({
      activeTab: 'home' as const,
      statusMessage: '',
      showTempRepoModal: false,
      tempRepoData: null,
      hasDeletedTempRepo: false,
      hasUsedTempRepoName: false,
    });
    stores.fileChangesStore.set({
      showModal: false,
      fileChanges: new Map(),
    });
    stores.isSettingsValid.set(false);
    stores.isAuthenticationValid.set(false);
    stores.isOnBoltProject.set(false);
    stores.currentProjectId.set(null);
    stores.isAuthenticated.set(false);
    stores.isPremium.set(false);

    chromeMocks = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getManifest: vi.fn().mockReturnValue({ version: '1.3.12' }),
        onMessage: {
          addListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
        },
      },
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, 'documentElement', {
      value: {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    });

    window.addEventListener = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render the app header with title and version', () => {
      render(App);

      expect(screen.getByText('Bolt to GitHub')).toBeInTheDocument();
      expect(screen.getByText('v1.3.12')).toBeInTheDocument();
    });

    it('should render the app description', () => {
      render(App);

      expect(screen.getByText('Upload and sync your Bolt projects to GitHub')).toBeInTheDocument();
    });

    it('should display the app icon', () => {
      render(App);

      const icon = screen.getByAltText('Bolt to GitHub');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('src', '/assets/icons/icon48.png');
    });

    it('should have correct dimensions (400x600)', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('w-[400px]');
      expect(main).toHaveClass('h-[600px]');
    });

    it('should apply dark mode styling', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('bg-slate-950');
      expect(main).toHaveClass('text-slate-50');
    });
  });

  describe('Onboarding View', () => {
    it('should display onboarding view when no valid authentication', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: false,
        repoOwner: '',
        githubToken: '',
        repoName: '',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });

      render(App);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('should not display tabs when in onboarding mode', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: false,
        repoOwner: '',
        githubToken: '',
        repoName: '',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });

      render(App);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  describe('Tabs View', () => {
    beforeEach(() => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isAuthenticationValid.set(true);
    });

    it('should display tabs view when authentication is valid', () => {
      render(App);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should display tabs when authenticated with GitHub App', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: '',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'github_app' as 'pat' | 'github_app',
        githubAppInstallationId: 12345 as number | null,
      });

      render(App);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });

  describe('Premium Features', () => {
    it('should show upgrade button when user is not premium', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isOnBoltProject.set(true);
      stores.isPremium.set(false);

      render(App);

      expect(screen.getByRole('button', { name: /✨ Upgrade/i })).toBeInTheDocument();
    });

    it('should show PRO badge when user is premium', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isPremium.set(true);

      render(App);

      expect(screen.getByText('PRO')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /✨ Upgrade/i })).not.toBeInTheDocument();
    });

    it('should show sign in link when user is not authenticated', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isOnBoltProject.set(true);
      stores.isAuthenticated.set(false);
      stores.isPremium.set(false);

      render(App);

      const signInButton = screen.getByText('Sign in');
      expect(signInButton).toBeInTheDocument();
    });

    it('should not show sign in link when user is authenticated', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isOnBoltProject.set(true);
      stores.isAuthenticated.set(true);
      stores.isPremium.set(false);

      render(App);

      expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should open sign in page when sign in button is clicked', async () => {
      const user = userEvent.setup();

      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isOnBoltProject.set(true);
      stores.isAuthenticated.set(false);

      render(App);

      const signInButton = screen.getByText('Sign in');
      await user.click(signInButton);

      expect(chromeMocks.tabs.create).toHaveBeenCalledWith({
        url: 'https://bolt2github.com/login',
      });
    });

    it('should handle upgrade button click', async () => {
      const user = userEvent.setup();

      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isOnBoltProject.set(true);
      stores.isPremium.set(false);

      render(App);

      const upgradeButton = screen.getByRole('button', { name: /✨ Upgrade/i });
      await user.click(upgradeButton);

      await waitFor(() => {
        expect(upgradeButton).toBeInTheDocument();
      });
    });
  });

  describe('Window Mode', () => {
    it('should show pop-out button in popup mode (default)', () => {
      render(App);

      const popOutButton = screen.getByTitle('Open in window');
      expect(popOutButton).toBeInTheDocument();

      expect(screen.queryByTitle('Pop back in')).not.toBeInTheDocument();
    });

    it('should handle pop-out button click', async () => {
      const user = userEvent.setup();
      const windowMode = await import('$lib/utils/windowMode');

      render(App);

      const popOutButton = screen.getByTitle('Open in window');
      await user.click(popOutButton);

      await waitFor(() => {
        expect(windowMode.openPopupWindow).toHaveBeenCalled();
      });
    });

    it('should call closePopupWindow when window mode is active', async () => {
      const windowMode = await import('$lib/utils/windowMode');

      expect(windowMode.closePopupWindow).toBeDefined();
      expect(typeof windowMode.closePopupWindow).toBe('function');

      const result = await windowMode.closePopupWindow();
      expect(result).toEqual({ success: true });
    });
  });

  describe('Link Navigation', () => {
    it('should have correct homepage link', () => {
      render(App);

      const link = screen.getByRole('link', { name: /Bolt to GitHub/i });
      expect(link).toHaveAttribute('href', 'https://bolt2github.com');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should display app icon in header link', () => {
      render(App);

      const link = screen.getByRole('link', { name: /Bolt to GitHub/i });
      const icon = link.querySelector('img');
      expect(icon).toHaveAttribute('src', '/assets/icons/icon48.png');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible header structure', () => {
      render(App);

      const heading = screen.getByText('Bolt to GitHub');
      expect(heading).toBeInTheDocument();

      const h3 = heading.closest('h3');
      expect(h3).toBeInTheDocument();
    });

    it('should have accessible buttons with titles', () => {
      render(App);

      const popOutButton = screen.getByTitle('Open in window');
      expect(popOutButton).toBeInTheDocument();
      expect(popOutButton).toHaveAttribute('title');
    });

    it('should have accessible images with alt text', () => {
      render(App);

      const icon = screen.getByAltText('Bolt to GitHub');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Dark Mode', () => {
    it('should apply dark mode classes to main container', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('bg-slate-950');
      expect(main).toHaveClass('text-slate-50');
    });

    it('should apply dark theme to card components', () => {
      const { container } = render(App);

      const card = container.querySelector('[class*="border-slate-800"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Responsive Layout', () => {
    it('should have fixed width for popup', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('w-[400px]');
    });

    it('should have fixed height for popup', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('h-[600px]');
    });

    it('should have proper padding', () => {
      const { container } = render(App);

      const main = container.querySelector('main');
      expect(main).toHaveClass('p-3');
    });
  });

  describe('Store Integration', () => {
    it('should reactively update when premium status changes', async () => {
      const { rerender } = render(App);

      expect(screen.queryByText('PRO')).not.toBeInTheDocument();

      stores.isPremium.set(true);
      await rerender({});

      expect(screen.getByText('PRO')).toBeInTheDocument();
    });

    it('should reactively update when authentication changes', async () => {
      const { rerender } = render(App);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        githubToken: 'test-token',
        repoName: 'test-repo',
        branch: 'main',
        authenticationMethod: 'pat' as const,
        githubAppInstallationId: null,
      });
      stores.isAuthenticationValid.set(true);
      await rerender({});

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });
});
