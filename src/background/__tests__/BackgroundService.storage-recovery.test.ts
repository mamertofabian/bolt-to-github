/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundService } from '../BackgroundService';

const mocks = vi.hoisted(() => {
  const forceCheck = vi.fn(async () => undefined);
  const syncGitHubApp = vi.fn(async () => true);
  const addAuthStateListener = vi.fn();
  const removeAuthStateListener = vi.fn();
  const processZipFile = vi.fn(async () => undefined);
  const unifiedGitHubService = vi.fn((authConfig?: string | { type: string }) => ({
    authConfig,
    needsRenewal: vi.fn(async () => false),
    refreshAuth: vi.fn(async () => undefined),
  }));
  const zipHandler = vi.fn(() => ({
    processZipFile,
  }));
  const backgroundTempRepoManager = vi.fn(() => ({
    cleanupTempRepos: vi.fn(async () => undefined),
    handlePrivateRepoImport: vi.fn(async () => undefined),
    destroy: vi.fn(),
  }));

  return {
    forceCheck,
    syncGitHubApp,
    addAuthStateListener,
    removeAuthStateListener,
    processZipFile,
    unifiedGitHubService,
    zipHandler,
    backgroundTempRepoManager,
  };
});

vi.mock('../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: mocks.unifiedGitHubService,
}));

vi.mock('../../services/zipHandler', () => ({
  ZipHandler: mocks.zipHandler,
}));

const mockGetGitHubSettings = vi.fn(async () => ({
  gitHubSettings: {
    repoOwner: 'test-owner',
    repoName: 'test-repo',
    branch: 'main',
  },
}));
const mockGetProjectId = vi.fn(async () => 'bolt-project');
const mockSetProjectId = vi.fn(async () => undefined);

vi.mock('../StateManager', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getGitHubSettings: mockGetGitHubSettings,
      getProjectId: mockGetProjectId,
      setProjectId: mockSetProjectId,
    })),
  },
}));

vi.mock('../TempRepoManager', () => ({
  BackgroundTempRepoManager: mocks.backgroundTempRepoManager,
}));

vi.mock('../../content/services/SupabaseAuthService', () => ({
  SupabaseAuthService: {
    getInstance: vi.fn(() => ({
      forceCheck: mocks.forceCheck,
      syncGitHubApp: mocks.syncGitHubApp,
      getAuthState: vi.fn(() => ({ isAuthenticated: true })),
      addAuthStateListener: mocks.addAuthStateListener,
      removeAuthStateListener: mocks.removeAuthStateListener,
      isPremium: vi.fn(() => false),
      forceSubscriptionRevalidation: vi.fn(async () => undefined),
      forceSyncToPopup: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('../../content/services/OperationStateManager', () => ({
  OperationStateManager: {
    getInstance: vi.fn(() => ({
      startOperation: vi.fn(async () => undefined),
      completeOperation: vi.fn(async () => undefined),
      failOperation: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('../../lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  getLogStorage: vi.fn(() => ({
    getLogs: vi.fn(async () => []),
    rotateLogs: vi.fn(),
  })),
}));

vi.mock('../UsageTracker', () => ({
  UsageTracker: vi.fn(() => ({
    initializeUsageData: vi.fn(async () => undefined),
    updateUsageStats: vi.fn(async () => undefined),
    trackError: vi.fn(async () => undefined),
    setUninstallURL: vi.fn(async () => undefined),
  })),
}));

vi.mock('../WindowManager', () => ({
  WindowManager: {
    getInstance: vi.fn(() => ({
      openPopupWindow: vi.fn(async () => ({ id: 1 })),
      closePopupWindow: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('../../services/BoltProjectSyncService', () => ({
  BoltProjectSyncService: vi.fn(() => ({
    performOutwardSync: vi.fn(async () => null),
    performInwardSync: vi.fn(async () => null),
  })),
}));

vi.mock('../../services/AnalyticsService', () => ({
  analytics: {
    trackEvent: vi.fn(async () => undefined),
    trackError: vi.fn(async () => undefined),
    trackExtensionEvent: vi.fn(async () => undefined),
    trackGitHubOperation: vi.fn(async () => undefined),
  },
}));

type StorageChanges = { [key: string]: chrome.storage.StorageChange };
type StorageListener = (changes: StorageChanges, namespace: string) => void;
type PortMessageListener = (message: any) => void | Promise<void>;

const createChromeAPIMock = () => {
  const localData: Record<string, unknown> = {};
  const syncData: Record<string, unknown> = {
    repoOwner: 'test-owner',
    projectSettings: {
      'bolt-project': {
        repoName: 'test-repo',
        branch: 'main',
      },
    },
  };
  const storageListeners: StorageListener[] = [];
  const connectListeners: Array<(port: any) => void> = [];
  const alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];

  const readFrom = async (source: Record<string, unknown>, keys?: string | string[] | null) => {
    if (!keys) return { ...source };
    if (typeof keys === 'string') return { [keys]: source[keys] };
    return keys.reduce<Record<string, unknown>>((result, key) => {
      result[key] = source[key];
      return result;
    }, {});
  };

  return {
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: {
        addListener: vi.fn((handler) => alarmListeners.push(handler)),
        removeListener: vi.fn((handler) => {
          const index = alarmListeners.indexOf(handler);
          if (index !== -1) alarmListeners.splice(index, 1);
        }),
      },
    },
    storage: {
      local: {
        get: vi.fn((keys?: string | string[] | null) => readFrom(localData, keys)),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(localData, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete localData[key];
        }),
      },
      sync: {
        get: vi.fn((keys?: string | string[] | null) => readFrom(syncData, keys)),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(syncData, items);
        }),
      },
      onChanged: {
        addListener: vi.fn((handler: StorageListener) => storageListeners.push(handler)),
        removeListener: vi.fn((handler: StorageListener) => {
          const index = storageListeners.indexOf(handler);
          if (index !== -1) storageListeners.splice(index, 1);
        }),
      },
    },
    runtime: {
      id: 'test-extension-id',
      reload: vi.fn(),
      onInstalled: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn((handler) => connectListeners.push(handler)) },
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      lastError: null,
      getManifest: vi.fn(() => ({ version: '1.0.0' })),
      sendMessage: vi.fn(),
    },
    tabs: {
      get: vi.fn(async () => ({ url: 'https://bolt.new/~/bolt-project' })),
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      query: vi.fn(async () => []),
      create: vi.fn(),
      sendMessage: vi.fn(),
    },
    action: {
      openPopup: vi.fn(async () => undefined),
    },
    _localData: localData,
    _triggerStorageChange: (changes: StorageChanges, namespace: string) => {
      storageListeners.forEach((listener) => listener(changes, namespace));
    },
    _connectBoltPort: () => {
      let messageListener: PortMessageListener | null = null;
      const port = {
        name: 'bolt-content',
        sender: { tab: { id: 42 } },
        postMessage: vi.fn(),
        onDisconnect: { addListener: vi.fn() },
        onMessage: {
          addListener: vi.fn((handler: PortMessageListener) => {
            messageListener = handler;
          }),
        },
      };

      connectListeners.forEach((listener) => listener(port));

      if (!messageListener) {
        throw new Error('Port message listener not registered');
      }

      return {
        port,
        send: (message: any) => messageListener?.(message),
      };
    },
  };
};

const triggerLocalChange = (
  chromeMock: ReturnType<typeof createChromeAPIMock>,
  key: string,
  oldValue: unknown,
  newValue: unknown
) => {
  chromeMock._localData[key] = newValue;
  chromeMock._triggerStorageChange({ [key]: { oldValue, newValue } }, 'local');
};

const settleInitialization = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
};

describe('BackgroundService - Auth Storage Recovery', () => {
  let chromeMock: ReturnType<typeof createChromeAPIMock>;
  let service: BackgroundService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    chromeMock = createChromeAPIMock();
    global.chrome = chromeMock as any;

    service = new BackgroundService();
    await settleInitialization();

    mocks.forceCheck.mockClear();
    mocks.syncGitHubApp.mockClear();
    mocks.unifiedGitHubService.mockClear();
    mocks.zipHandler.mockClear();
    mocks.backgroundTempRepoManager.mockClear();
    mocks.processZipFile.mockClear();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  it('reinitializes GitHub service when auth tokens are restored in local storage', async () => {
    triggerLocalChange(chromeMock, 'supabaseToken', undefined, 'restored-token');
    chromeMock._localData.authenticationMethod = 'github_app';

    await vi.advanceTimersByTimeAsync(1100);

    expect(mocks.unifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
    expect(mocks.zipHandler).toHaveBeenCalled();
    expect(mocks.backgroundTempRepoManager).toHaveBeenCalledWith(
      expect.anything(),
      'test-owner',
      expect.any(Function)
    );

    const boltPort = chromeMock._connectBoltPort();
    await boltPort.send({
      type: 'ZIP_DATA',
      data: {
        data: 'UEs=',
        projectId: 'bolt-project',
      },
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(mocks.processZipFile).toHaveBeenCalledWith(
      expect.any(Blob),
      'bolt-project',
      'Commit from Bolt to GitHub'
    );
  });

  it('late GitHub authentication failure remains actionable instead of becoming a ZIP error', async () => {
    triggerLocalChange(chromeMock, 'supabaseToken', undefined, 'restored-token');
    chromeMock._localData.authenticationMethod = 'github_app';
    await vi.advanceTimersByTimeAsync(1100);

    mocks.processZipFile.mockRejectedValueOnce(
      new Error('GitHub App authentication expired. Please re-authenticate via bolt2github.com')
    );
    const boltPort = chromeMock._connectBoltPort();

    await boltPort.send({
      type: 'ZIP_DATA',
      data: { data: 'UEs=', projectId: 'bolt-project' },
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(boltPort.port.postMessage).toHaveBeenLastCalledWith({
      type: 'UPLOAD_STATUS',
      status: {
        status: 'error',
        message: 'GitHub App authentication expired. Please re-authenticate via bolt2github.com',
      },
    });
    expect(boltPort.port.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({
          message: expect.stringContaining('Failed to process ZIP data'),
        }),
      })
    );
  });

  it('forces auth check when authenticationMethod is restored to github_app', async () => {
    triggerLocalChange(chromeMock, 'authenticationMethod', undefined, 'github_app');

    await vi.advanceTimersByTimeAsync(1100);

    expect(mocks.forceCheck).toHaveBeenCalledTimes(1);
    expect(mocks.unifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
  });

  it('ignores unrelated local storage keys such as keepAliveTimestamp', async () => {
    triggerLocalChange(chromeMock, 'keepAliveTimestamp', 100, 200);
    triggerLocalChange(chromeMock, 'lastKeepAlive', 100, 200);

    await vi.advanceTimersByTimeAsync(1500);

    expect(mocks.forceCheck).not.toHaveBeenCalled();
    expect(mocks.unifiedGitHubService).not.toHaveBeenCalled();
    expect(mocks.zipHandler).not.toHaveBeenCalled();
  });

  it('does not loop when its own auth check writes token state back to storage', async () => {
    mocks.forceCheck.mockImplementationOnce(async () => {
      chromeMock._triggerStorageChange(
        {
          supabaseToken: {
            oldValue: 'restored-token',
            newValue: 'restored-token',
          },
          supabaseAuthState: {
            oldValue: { isAuthenticated: true },
            newValue: { isAuthenticated: true },
          },
        },
        'local'
      );
    });

    chromeMock._localData.authenticationMethod = 'github_app';
    triggerLocalChange(chromeMock, 'supabaseToken', undefined, 'restored-token');

    await vi.advanceTimersByTimeAsync(1900);

    expect(mocks.forceCheck).toHaveBeenCalledTimes(1);
    expect(mocks.unifiedGitHubService).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid successive auth storage changes into one recovery pass', async () => {
    triggerLocalChange(chromeMock, 'supabaseToken', undefined, 'restored-token');
    triggerLocalChange(chromeMock, 'supabaseTokenExpiry', undefined, Date.now() + 60_000);
    triggerLocalChange(chromeMock, 'authenticationMethod', undefined, 'github_app');
    triggerLocalChange(chromeMock, 'githubAppInstallationId', undefined, '12345');

    await vi.advanceTimersByTimeAsync(1100);

    expect(mocks.forceCheck).toHaveBeenCalledTimes(1);
    expect(mocks.unifiedGitHubService).toHaveBeenCalledTimes(1);
    expect(mocks.zipHandler).toHaveBeenCalledTimes(1);
  });

  it('newer disconnected recovery prevents an older connected recovery from restoring stale dependencies', async () => {
    let resolveOlderConnection!: (connected: boolean) => void;
    mocks.syncGitHubApp
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveOlderConnection = resolve;
          })
      )
      .mockResolvedValue(false);

    triggerLocalChange(chromeMock, 'supabaseToken', undefined, 'older-token');
    await vi.advanceTimersByTimeAsync(1100);

    triggerLocalChange(chromeMock, 'supabaseToken', 'older-token', 'newer-token');
    await vi.advanceTimersByTimeAsync(1100);

    resolveOlderConnection(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.unifiedGitHubService).toHaveBeenCalledTimes(1);
    expect(mocks.zipHandler).not.toHaveBeenCalled();
    expect(mocks.backgroundTempRepoManager).not.toHaveBeenCalled();
  });
});
