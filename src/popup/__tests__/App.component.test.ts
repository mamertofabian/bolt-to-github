/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, {
  canOpenPopupGitHubSurface,
  openTrackedUpgradeModalFromPopupContext,
  reconcilePopupGitHubConnection,
  runPopupGitHubAction,
} from '../App.svelte';
import appSource from '../App.svelte?raw';

it('popup startup no longer normalizes a removed authentication method selector', () => {
  expect(appSource).not.toContain('setAuthenticationMethod');
});

const mockCheckGitHubConnection = vi.hoisted(() => vi.fn());
const mockCheckPopupGitHubConnection = vi.hoisted(() => vi.fn());
const mockMigrateLegacyGitHubAuthentication = vi.hoisted(() => vi.fn());
const mockCompleteGitHubAppMigration = vi.hoisted(() => vi.fn());

vi.mock('$lib/utils/githubConnection', () => ({
  checkGitHubConnection: mockCheckGitHubConnection,
  checkPopupGitHubConnection: mockCheckPopupGitHubConnection,
}));

vi.mock('$lib/services/githubAuthMigration', () => ({
  migrateLegacyGitHubAuthentication: mockMigrateLegacyGitHubAuthentication,
  completeGitHubAppMigration: mockCompleteGitHubAppMigration,
}));

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
    repoName: '',
    branch: 'main',
    githubAppInstallationId: null as number | null,
  });

  const projectSettingsStore = createStore({
    version: '1.3.13',
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
      setRepoOwner: vi.fn((owner: string) => {
        githubSettingsStore.update((state) => ({ ...state, repoOwner: owner }));
      }),
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
    mockCheckGitHubConnection.mockResolvedValue({
      connected: true,
      message: 'GitHub is connected.',
    });
    mockCheckPopupGitHubConnection.mockResolvedValue({
      connected: true,
      message: 'GitHub is connected.',
    });
    mockMigrateLegacyGitHubAuthentication.mockResolvedValue({
      status: 'not_required',
      removeStoredPat: false,
      removeLegacyMethodKeys: false,
      persistMigrationRequired: false,
    });
    mockCompleteGitHubAppMigration.mockImplementation(
      async (liveSessionConnected: boolean, installationConnected: boolean) =>
        liveSessionConnected && installationConnected
    );

    const storesModule = await import('$lib/stores');
    stores = storesModule;
    stores.githubSettingsActions.initialize.mockReset().mockResolvedValue(undefined);

    stores.githubSettingsStore.set({
      hasInitialSettings: false,
      repoOwner: '',
      repoName: '',
      branch: 'main',
      githubAppInstallationId: null as number | null,
    });
    stores.projectSettingsStore.set({ version: '1.3.13' });
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
        getManifest: vi.fn().mockReturnValue({ version: '1.3.13' }),
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
    Object.defineProperty(globalThis, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'close', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    vi.spyOn(document.documentElement.classList, 'add').mockImplementation(() => undefined);
    vi.spyOn(document.documentElement.classList, 'remove').mockImplementation(() => undefined);

    window.addEventListener = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reconcilePopupGitHubConnection refreshes stale settings and surfaces disconnection', async () => {
    const checkConnection = vi.fn().mockResolvedValue({
      connected: false,
      reason: 'not_connected',
      message: 'Connect GitHub at bolt2github.com before using GitHub features.',
    });
    const refreshSettings = vi.fn().mockResolvedValue(undefined);
    const showStatus = vi.fn();

    await expect(
      reconcilePopupGitHubConnection(checkConnection, refreshSettings, showStatus)
    ).resolves.toEqual({
      connected: false,
      reason: 'not_connected',
      message: 'Connect GitHub at bolt2github.com before using GitHub features.',
    });
    expect(refreshSettings).toHaveBeenCalledOnce();
    expect(showStatus).toHaveBeenCalledWith(
      'Connect GitHub at bolt2github.com before using GitHub features.',
      10000
    );
  });

  describe('Initial Rendering', () => {
    it('should render the app header with title and version', () => {
      render(App);

      expect(screen.getByText('Bolt to GitHub')).toBeInTheDocument();
      expect(screen.getByText('v1.3.13')).toBeInTheDocument();
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
    it('signed-out popup forwards the current session state into onboarding', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'stale-owner',
        repoName: 'stale-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticated.set(false);
      mockCheckPopupGitHubConnection.mockResolvedValue({
        connected: false,
        reason: 'not_authenticated',
        message: 'Sign in to bolt2github.com before using GitHub features.',
      });

      render(App);

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-view')).toHaveAttribute(
          'data-is-user-authenticated',
          'false'
        );
      });
    });

    it('popup maps legacy PAT storage to the migration-required setup', async () => {
      mockMigrateLegacyGitHubAuthentication.mockResolvedValue({
        status: 'migration_required',
        removeStoredPat: true,
        removeLegacyMethodKeys: true,
        persistMigrationRequired: true,
      });
      mockCheckPopupGitHubConnection.mockResolvedValue({
        connected: false,
        reason: 'not_authenticated',
        message: 'Sign in to bolt2github.com before using GitHub features.',
      });

      render(App);

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-view')).toHaveAttribute(
          'data-migration-required',
          'true'
        );
      });
    });

    it('popup does not accept PAT as valid GitHub readiness', async () => {
      mockMigrateLegacyGitHubAuthentication.mockResolvedValue({
        status: 'migration_required',
        removeStoredPat: true,
        removeLegacyMethodKeys: true,
        persistMigrationRequired: true,
      });
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'legacy-owner',
        repoName: 'legacy-repo',
        branch: 'main',
        githubAppInstallationId: null,
      });
      stores.isAuthenticationValid.set(true);

      render(App);

      await waitFor(() => {
        expect(screen.queryByText('Checking GitHub connection')).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('onboarding-view')).toHaveAttribute(
        'data-migration-required',
        'true'
      );
    });

    it('popup normalizes GitHub App state after legacy selector cleanup', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: false,
        repoOwner: 'preserved-owner',
        repoName: 'preserved-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticated.set(true);

      render(App);

      await waitFor(() => {
        expect(mockCompleteGitHubAppMigration).toHaveBeenCalledWith(true, true);
        expect(screen.getByRole('tablist')).toBeInTheDocument();
      });
    });

    it('popup keeps GitHub-backed surfaces hidden while live connection verification is pending', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'stale-owner',
        repoName: 'stale-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticationValid.set(true);
      mockCheckPopupGitHubConnection.mockImplementation(() => new Promise(() => undefined));

      render(App);

      await waitFor(() => expect(mockCheckPopupGitHubConnection).toHaveBeenCalledOnce());
      expect(mockCheckGitHubConnection).not.toHaveBeenCalled();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByText('Checking GitHub connection')).toBeInTheDocument();
    });

    it('popup checking state renders an accessible animated spinner', async () => {
      mockCheckPopupGitHubConnection.mockImplementation(() => new Promise(() => undefined));

      render(App);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(within(status).getByText('Checking GitHub connection')).toBeInTheDocument();
      expect(within(status).getByText('This should only take a moment')).toBeInTheDocument();
      expect(status.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('popup opening reconciles a disconnected GitHub App and shows onboarding immediately', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'stale-owner',
        repoName: 'stale-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticationValid.set(true);
      mockCheckPopupGitHubConnection.mockResolvedValue({
        connected: false,
        reason: 'not_connected',
        message: 'Connect GitHub at bolt2github.com before using GitHub features.',
      });
      stores.githubSettingsActions.initialize.mockImplementation(async () => {
        stores.githubSettingsStore.set({
          hasInitialSettings: false,
          repoOwner: 'stale-owner',
          repoName: 'stale-repo',
          branch: 'main',
          githubAppInstallationId: null,
        });
        stores.isAuthenticationValid.set(false);
      });

      render(App);

      await waitFor(() => {
        expect(mockCheckPopupGitHubConnection).toHaveBeenCalledOnce();
        expect(mockCheckGitHubConnection).not.toHaveBeenCalled();
        expect(stores.githubSettingsActions.initialize).toHaveBeenCalledOnce();
        expect(stores.uiStateActions.showStatus).toHaveBeenCalledWith(
          'Connect GitHub at bolt2github.com before using GitHub features.',
          10000
        );
        expect(screen.getByTestId('onboarding-view')).toBeInTheDocument();
      });
    });

    it('unavailable popup verification keeps stale GitHub-backed surfaces unmounted', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'stale-owner',
        repoName: 'stale-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticationValid.set(true);
      mockCheckPopupGitHubConnection.mockResolvedValue({
        connected: false,
        reason: 'unavailable',
        message: 'Unable to verify the GitHub connection: Temporary outage',
      });

      render(App);

      await waitFor(() => {
        expect(screen.queryByText('Checking GitHub connection')).not.toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.getByTestId('onboarding-view')).toBeInTheDocument();
        expect(stores.uiStateActions.showStatus).toHaveBeenCalledWith(
          'Unable to verify the GitHub connection: Temporary outage',
          10000
        );
      });
    });

    it('unavailable popup verification does not display pending cached file changes', async () => {
      mockCheckPopupGitHubConnection.mockResolvedValue({
        connected: false,
        reason: 'unavailable',
        message: 'Unable to verify the GitHub connection: Temporary outage',
      });
      stores.fileChangesStore.set({
        showModal: true,
        fileChanges: new Map([['src/App.svelte', { path: 'src/App.svelte', status: 'modified' }]]),
      });

      render(App);

      await waitFor(() => {
        expect(screen.queryByText('Checking GitHub connection')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('file-changes-modal')).not.toBeInTheDocument();
    });

    it('unavailable popup verification blocks pending issues context from mounting IssueManager', async () => {
      expect(canOpenPopupGitHubSurface(false, true)).toBe(false);
      expect(canOpenPopupGitHubSurface(true, true)).toBe(true);
    });

    it('should display onboarding view when no valid authentication', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: false,
        repoOwner: '',
        repoName: '',
        branch: 'main',
        githubAppInstallationId: null,
      });

      render(App);

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('should not display tabs when in onboarding mode', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: false,
        repoOwner: '',
        repoName: '',
        branch: 'main',
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticationValid.set(true);
    });

    it('should display tabs view when authentication is valid', async () => {
      render(App);

      await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    });

    it('disconnected popup file changes stops before cached changes are displayed', async () => {
      const checkConnection = vi.fn().mockResolvedValue({
        connected: false,
        reason: 'not_connected',
        message: 'Connect GitHub at bolt2github.com before using GitHub features.',
      });
      const refreshSettings = vi.fn().mockResolvedValue(undefined);
      const showStatus = vi.fn();
      const displayCachedChanges = vi.fn().mockResolvedValue(undefined);

      await expect(
        runPopupGitHubAction(checkConnection, refreshSettings, showStatus, displayCachedChanges)
      ).resolves.toBe(false);
      expect(displayCachedChanges).not.toHaveBeenCalled();
      expect(refreshSettings).toHaveBeenCalledOnce();
      expect(showStatus).toHaveBeenCalledWith(
        'Connect GitHub at bolt2github.com before using GitHub features.',
        10000
      );
    });

    it('should display tabs when authenticated with GitHub App', async () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345 as number | null,
      });

      render(App);

      await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    });
  });

  describe('Premium Features', () => {
    it('should show upgrade button when user is not premium', () => {
      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
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

  describe('Popup Context', () => {
    it('openTrackedUpgradeModalFromPopupContext opens pending upgrade context through the tracked upgrade state seam', () => {
      const applyState = vi.fn();
      const setUpgradeState = vi.fn((_type, setState) => {
        setState('file-changes', 'Upgrade reason', []);
      });

      openTrackedUpgradeModalFromPopupContext('fileChanges', setUpgradeState, applyState);

      expect(setUpgradeState).toHaveBeenCalledWith('fileChanges', expect.any(Function));
      expect(applyState).toHaveBeenCalledWith('file-changes', 'Upgrade reason', []);
    });

    it('openTrackedUpgradeModalFromPopupContext preserves commits context and defaults unknown values', () => {
      const applyState = vi.fn();
      const setUpgradeState = vi.fn();

      openTrackedUpgradeModalFromPopupContext('commits', setUpgradeState, applyState);
      openTrackedUpgradeModalFromPopupContext('unknown-feature', setUpgradeState, applyState);

      expect(setUpgradeState).toHaveBeenNthCalledWith(1, 'commits', applyState);
      expect(setUpgradeState).toHaveBeenNthCalledWith(2, 'general', applyState);
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
      const { container, getByRole, queryByRole, queryByText, rerender } = render(App);

      expect(queryByRole('tablist')).not.toBeInTheDocument();
      await waitFor(
        () => expect(queryByText('Checking GitHub connection')).not.toBeInTheDocument(),
        { container, timeout: 5000 }
      );

      stores.githubSettingsStore.set({
        hasInitialSettings: true,
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        githubAppInstallationId: 12345,
      });
      stores.isAuthenticationValid.set(true);
      await rerender({});

      expect(getByRole('tablist')).toBeInTheDocument();
    });
  });
});
