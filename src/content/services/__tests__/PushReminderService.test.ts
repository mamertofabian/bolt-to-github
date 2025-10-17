import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushReminderService } from '../PushReminderService';
import type { MessageHandler } from '../../MessageHandler';
import type { INotificationManager } from '../../types/ManagerInterfaces';
import { ActivityMonitor } from '../../infrastructure/ActivityMonitor';
import { OperationStateManager } from '../OperationStateManager';

vi.mock('../../infrastructure/ActivityMonitor');
vi.mock('../OperationStateManager');
vi.mock('../../../lib/stores', () => ({
  isPremium: { subscribe: vi.fn(() => vi.fn()) },
  pushStatisticsActions: {
    hasPushAttempts: vi.fn().mockResolvedValue(false),
  },
  get: vi.fn((store) => {
    if (store === mockIsPremium) {
      return false;
    }
    return undefined;
  }),
}));
vi.mock('../../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockIsPremium = { subscribe: vi.fn(() => vi.fn()) };

describe('PushReminderService', () => {
  let service: PushReminderService;
  let mockMessageHandler: MessageHandler;
  let mockNotificationManager: INotificationManager;
  let mockActivityMonitor: ActivityMonitor;
  let mockOperationStateManager: OperationStateManager;
  let mockChrome: typeof chrome;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });

    mockMessageHandler = {} as MessageHandler;

    mockNotificationManager = {
      showNotification: vi.fn(),
      getReminderNotificationCount: vi.fn().mockReturnValue(0),
      hideNotification: vi.fn(),
      showError: vi.fn(),
      showSuccess: vi.fn(),
    } as unknown as INotificationManager;

    mockActivityMonitor = {
      start: vi.fn(),
      stop: vi.fn(),
      isUserIdle: vi.fn().mockReturnValue(true),
      isBoltIdle: vi.fn().mockReturnValue(true),
      isSystemIdle: vi.fn().mockReturnValue(true),
      getTimeSinceUserActivity: vi.fn().mockReturnValue(5 * 60 * 1000),
      getTimeSinceBoltActivity: vi.fn().mockReturnValue(5 * 60 * 1000),
      recordUserActivity: vi.fn(),
      recordBoltActivity: vi.fn(),
      getDebugInfo: vi.fn().mockReturnValue({}),
    } as unknown as ActivityMonitor;

    mockOperationStateManager = {
      hasOngoingOperations: vi.fn().mockReturnValue(false),
      getOngoingOperationsByType: vi.fn().mockReturnValue([]),
      startOperation: vi.fn(),
      completeOperation: vi.fn(),
      getDebugInfo: vi.fn().mockReturnValue({}),
    } as unknown as OperationStateManager;

    vi.mocked(ActivityMonitor).mockImplementation(() => mockActivityMonitor);
    vi.mocked(OperationStateManager.getInstance).mockReturnValue(mockOperationStateManager);

    mockChrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
      runtime: {
        sendMessage: vi.fn(),
      },
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', mockChrome);

    service = new PushReminderService(mockMessageHandler, mockNotificationManager);
  });

  afterEach(() => {
    if (service) {
      service.cleanup();
    }
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      const settings = service.getSettings();

      expect(settings).toEqual({
        enabled: true,
        reminderInterval: 20,
        snoozeInterval: 10,
        minimumChanges: 3,
        maxRemindersPerSession: 5,
        scheduledEnabled: false,
        scheduledInterval: 15,
        maxScheduledPerSession: 10,
      });
    });

    it('should default scheduledEnabled to false for new users', () => {
      const settings = service.getSettings();

      expect(settings.scheduledEnabled).toBe(false);
    });

    it('should allow scheduled reminders to be enabled via settings', async () => {
      const settings = service.getSettings();
      expect(settings.scheduledEnabled).toBe(false);

      await service.updateSettings({ scheduledEnabled: true });

      const updatedSettings = service.getSettings();
      expect(updatedSettings.scheduledEnabled).toBe(true);
    });

    it('should initialize with default state', () => {
      const state = service.getState();

      expect(state).toMatchObject({
        lastReminderTime: 0,
        lastSnoozeTime: 0,
        reminderCount: 0,
        lastScheduledReminderTime: 0,
        scheduledReminderCount: 0,
      });
      expect(state.sessionStartTime).toBeGreaterThan(0);
    });

    it('should start activity monitor on initialization', async () => {
      await vi.waitFor(() => {
        expect(mockActivityMonitor.start).toHaveBeenCalledOnce();
      });
    });

    it('should set up check interval on initialization', () => {
      const debugInfo = service.getDebugInfo();

      expect(debugInfo).toBeDefined();
    });

    it('should load settings from storage on initialization', async () => {
      const customSettings = {
        enabled: false,
        reminderInterval: 30,
        snoozeInterval: 15,
      };

      mockChrome.storage.local.get = vi.fn().mockResolvedValue({
        pushReminderSettings: customSettings,
      });

      const newService = new PushReminderService(mockMessageHandler, mockNotificationManager);
      await vi.waitFor(() => {
        const settings = newService.getSettings();
        expect(settings.enabled).toBe(false);
        expect(settings.reminderInterval).toBe(30);
        expect(settings.snoozeInterval).toBe(15);
      });

      newService.cleanup();
    });

    it('should handle storage errors gracefully during initialization', async () => {
      mockChrome.storage.local.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      const newService = new PushReminderService(mockMessageHandler, mockNotificationManager);
      const settings = newService.getSettings();

      expect(settings).toMatchObject({
        enabled: true,
        reminderInterval: 20,
      });

      newService.cleanup();
    });
  });

  describe('Enable/Disable', () => {
    it('should enable reminders', () => {
      service.disable();
      service.enable();

      const debugInfo = service.getDebugInfo() as { isEnabled: boolean };
      expect(debugInfo.isEnabled).toBe(true);
    });

    it('should disable reminders', () => {
      service.disable();

      const debugInfo = service.getDebugInfo() as { isEnabled: boolean };
      expect(debugInfo.isEnabled).toBe(false);
    });

    it('should not check for reminders when disabled', async () => {
      service.disable();

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('Settings Management', () => {
    it('should update settings', async () => {
      await service.updateSettings({
        reminderInterval: 30,
        minimumChanges: 5,
      });

      const settings = service.getSettings();
      expect(settings.reminderInterval).toBe(30);
      expect(settings.minimumChanges).toBe(5);
    });

    it('should persist settings to storage', async () => {
      await service.updateSettings({ reminderInterval: 30 });

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pushReminderSettings: expect.objectContaining({
          reminderInterval: 30,
        }),
      });
    });

    it('should restart scheduled reminders when scheduledEnabled changes', async () => {
      await service.updateSettings({ scheduledEnabled: false });

      const settings = service.getSettings();
      expect(settings.scheduledEnabled).toBe(false);
    });

    it('should restart scheduled reminders when scheduledInterval changes', async () => {
      await service.updateSettings({ scheduledInterval: 30 });

      const settings = service.getSettings();
      expect(settings.scheduledInterval).toBe(30);
    });

    it('should get current settings', () => {
      const settings = service.getSettings();

      expect(settings).toHaveProperty('enabled');
      expect(settings).toHaveProperty('reminderInterval');
      expect(settings).toHaveProperty('snoozeInterval');
      expect(settings).toHaveProperty('minimumChanges');
      expect(settings).toHaveProperty('maxRemindersPerSession');
    });

    it('should return a copy of settings', () => {
      const settings1 = service.getSettings();
      const settings2 = service.getSettings();

      expect(settings1).not.toBe(settings2);
      expect(settings1).toEqual(settings2);
    });
  });

  describe('State Management', () => {
    it('should get current state', () => {
      const state = service.getState();

      expect(state).toHaveProperty('lastReminderTime');
      expect(state).toHaveProperty('lastSnoozeTime');
      expect(state).toHaveProperty('reminderCount');
      expect(state).toHaveProperty('sessionStartTime');
    });

    describe('Enhanced Snooze Duration', () => {
      it('should snooze for 30 minutes', async () => {
        const beforeTime = Date.now();
        await service.snoozeForDuration(30);

        const state = service.getState();
        expect(state.lastSnoozeTime).toBeGreaterThanOrEqual(beforeTime);
        expect(state.snoozeEndTime).toBe(beforeTime + 30 * 60 * 1000);
      });

      it('should snooze for 60 minutes (1 hour)', async () => {
        const beforeTime = Date.now();
        await service.snoozeForDuration(60);

        const state = service.getState();
        expect(state.snoozeEndTime).toBe(beforeTime + 60 * 60 * 1000);
      });

      it('should snooze for 180 minutes (3 hours)', async () => {
        const beforeTime = Date.now();
        await service.snoozeForDuration(180);

        const state = service.getState();
        expect(state.snoozeEndTime).toBe(beforeTime + 180 * 60 * 1000);
      });

      it('should calculate "until tomorrow" correctly (next day at midnight)', async () => {
        // Set time to 10 PM
        const now = new Date('2024-01-01T22:00:00.000Z');
        vi.setSystemTime(now);

        await service.snoozeForDuration('untilTomorrow');

        const state = service.getState();
        const expectedTomorrow = new Date('2024-01-02T00:00:00.000Z').getTime();

        expect(state.snoozeEndTime).toBe(expectedTomorrow);
      });

      it('should handle "until tomorrow" across midnight correctly', async () => {
        // Set time to 11:59 PM
        const now = new Date('2024-01-01T23:59:00.000Z');
        vi.setSystemTime(now);

        await service.snoozeForDuration('untilTomorrow');

        const state = service.getState();
        const expectedTomorrow = new Date('2024-01-02T00:00:00.000Z').getTime();

        expect(state.snoozeEndTime).toBe(expectedTomorrow);
      });

      it('should handle "until tomorrow" early in the day', async () => {
        // Set time to 8 AM
        const now = new Date('2024-01-01T08:00:00.000Z');
        vi.setSystemTime(now);

        await service.snoozeForDuration('untilTomorrow');

        const state = service.getState();
        const expectedTomorrow = new Date('2024-01-02T00:00:00.000Z').getTime();

        expect(state.snoozeEndTime).toBe(expectedTomorrow);
      });

      it('should persist snooze end time to storage', async () => {
        await service.snoozeForDuration(30);
        await vi.advanceTimersByTimeAsync(1100); // Wait for debounced save

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
          pushReminderState: expect.objectContaining({
            snoozeEndTime: expect.any(Number),
          }),
        });
      });

      it('should check snooze status using snooze end time', async () => {
        await service.snoozeForDuration(10); // 10 minutes

        // Advance time by 5 minutes (still in snooze)
        vi.advanceTimersByTime(5 * 60 * 1000);

        await service.forceReminderCheck();
        expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();

        // Advance time by another 6 minutes (past snooze period)
        vi.advanceTimersByTime(6 * 60 * 1000);

        const debugInfo = service.getDebugInfo() as { isInSnooze: boolean };
        expect(debugInfo.isInSnooze).toBe(false);
      });
    });

    it('should return a copy of state', () => {
      const state1 = service.getState();
      const state2 = service.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should reset reminder state', () => {
      service.snoozeReminders();
      vi.advanceTimersByTime(1000);

      service.resetReminderState();

      const state = service.getState();
      expect(state.reminderCount).toBe(0);
      expect(state.scheduledReminderCount).toBe(0);
    });

    it('should snooze reminders', () => {
      const beforeTime = Date.now();
      service.snoozeReminders();

      const state = service.getState();
      expect(state.lastSnoozeTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should respect snooze interval', async () => {
      service.snoozeReminders();

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should allow reminders after snooze interval expires', async () => {
      service.snoozeReminders();

      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      const debugInfo = service.getDebugInfo() as { isInSnooze: boolean };
      expect(debugInfo.isInSnooze).toBe(false);
    });
  });

  describe('Reminder Opportunity Checking', () => {
    beforeEach(() => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(
            new Map([
              ['file1.ts', { status: 'modified' }],
              ['file2.ts', { status: 'added' }],
              ['file3.ts', { status: 'modified' }],
            ])
          ),
        })),
      }));
    });

    it('should not show reminder when disabled', async () => {
      service.disable();

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show reminder when settings.enabled is false', async () => {
      await service.updateSettings({ enabled: false });

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show reminder when max reminders reached', async () => {
      await service.updateSettings({ maxRemindersPerSession: 2 });

      await service.forceShowReminder();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // Advance past global rate limit
      await service.forceShowReminder();
      await service.forceReminderCheck();

      const state = service.getState();
      expect(state.reminderCount).toBe(2);
    });

    it('should not show reminder when in snooze period', async () => {
      service.snoozeReminders();

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show reminder when operations are ongoing', async () => {
      vi.mocked(mockOperationStateManager.hasOngoingOperations).mockReturnValue(true);

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show reminder when system is not idle', async () => {
      vi.mocked(mockActivityMonitor.isSystemIdle).mockReturnValue(false);

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show reminder when interval has not passed', async () => {
      await service.forceShowReminder();

      vi.advanceTimersByTime(1000);

      await service.forceReminderCheck();

      const state = service.getState();
      expect(state.reminderCount).toBe(1);
    });

    it('should not show reminder when no significant changes', async () => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(new Map()),
        })),
      }));

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should check for push operations as conflicting', async () => {
      vi.mocked(mockOperationStateManager.hasOngoingOperations).mockReturnValue(true);
      vi.mocked(mockOperationStateManager.getOngoingOperationsByType).mockReturnValue([
        { type: 'push', id: 'push-1', startTime: Date.now(), description: 'Pushing' },
      ]);

      await service.forceReminderCheck();

      expect(mockOperationStateManager.hasOngoingOperations).toHaveBeenCalledWith([
        'push',
        'import',
        'clone',
        'sync',
        'comparison',
      ]);
    });

    it('should check for import operations as conflicting', async () => {
      vi.mocked(mockOperationStateManager.hasOngoingOperations).mockReturnValue(true);

      await service.forceReminderCheck();

      expect(mockOperationStateManager.hasOngoingOperations).toHaveBeenCalledWith(
        expect.arrayContaining(['import'])
      );
    });

    it('should check for comparison operations as conflicting', async () => {
      vi.mocked(mockOperationStateManager.hasOngoingOperations).mockReturnValue(true);

      await service.forceReminderCheck();

      expect(mockOperationStateManager.hasOngoingOperations).toHaveBeenCalledWith(
        expect.arrayContaining(['comparison'])
      );
    });

    it('should check UI upload state for ongoing uploads', async () => {
      mockChrome.storage.local.get = vi.fn().mockResolvedValue({
        uploadState: { uploadStatus: 'uploading' },
      });

      await service.forceReminderCheck();

      expect(mockChrome.storage.local.get).toHaveBeenCalledWith(['uploadState']);
    });
  });

  describe('Reminder Display', () => {
    beforeEach(() => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(
            new Map([
              ['file1.ts', { status: 'modified' }],
              ['file2.ts', { status: 'added' }],
              ['file3.ts', { status: 'deleted' }],
            ])
          ),
        })),
      }));
    });

    it('should show reminder with correct message format', async () => {
      await service.forceShowReminder();

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: expect.stringContaining('unsaved changes'),
          duration: 0,
        })
      );
    });

    it('should include changes summary in message', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      expect(call.message).toContain('3 unsaved changes');
    });

    it('should include breakdown in summary', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      expect(call.message).toContain('1 new');
      expect(call.message).toContain('1 modified');
      expect(call.message).toContain('1 deleted');
    });

    it('should provide Push to GitHub action', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      expect(call.actions).toBeDefined();
      expect(call.actions).toHaveLength(2);
      expect(call.actions?.[0].text).toBe('Push to GitHub');
      expect(call.actions?.[0].variant).toBe('primary');
    });

    it('should provide Snooze action', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      expect(call.actions?.[1].text).toBe('Snooze');
      expect(call.actions?.[1].variant).toBe('ghost');
    });

    it('should send PUSH_TO_GITHUB message when action clicked', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const pushAction = call.actions?.[0].action;

      await pushAction?.();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'PUSH_TO_GITHUB',
      });
    });

    it('should reset state when Push to GitHub clicked', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const pushAction = call.actions?.[0].action;

      await pushAction?.();

      const state = service.getState();
      expect(state.reminderCount).toBe(0);
    });

    it('should snooze when Snooze action clicked', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const snoozeAction = call.actions?.[1].action;

      snoozeAction?.();

      const state = service.getState();
      expect(state.lastSnoozeTime).toBeGreaterThan(0);
    });

    it('should increment reminder count when showing reminder', async () => {
      const stateBefore = service.getState();

      await service.forceShowReminder();

      const stateAfter = service.getState();
      expect(stateAfter.reminderCount).toBe(stateBefore.reminderCount + 1);
    });

    it('should update lastReminderTime when showing reminder', async () => {
      const beforeTime = Date.now();

      await service.forceShowReminder();

      const state = service.getState();
      expect(state.lastReminderTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should handle errors when showing reminder', async () => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockRejectedValue(new Error('Failed')),
        })),
      }));

      await expect(service.forceShowReminder()).resolves.not.toThrow();
    });

    it('should handle errors in push action gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const pushAction = call.actions?.[0].action;

      mockChrome.runtime.sendMessage = vi.fn(() => {
        throw new Error('Send failed');
      });

      pushAction?.();

      consoleSpy.mockRestore();
    });
  });

  describe('Scheduled Reminders', () => {
    beforeEach(() => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(
            new Map([
              ['file1.ts', { status: 'modified' }],
              ['file2.ts', { status: 'added' }],
              ['file3.ts', { status: 'modified' }],
            ])
          ),
        })),
      }));
    });

    it('should set up scheduled reminder interval on initialization when enabled', async () => {
      await service.updateSettings({ scheduledEnabled: true });
      const settings = service.getSettings();

      expect(settings.scheduledEnabled).toBe(true);
    });

    it('should not show scheduled reminder when scheduledEnabled is false', async () => {
      await service.updateSettings({ scheduledEnabled: false });

      await service.forceScheduledReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show scheduled reminder when service disabled', async () => {
      service.disable();

      await service.forceScheduledReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show scheduled reminder when max scheduled reminders reached', async () => {
      await service.updateSettings({ maxScheduledPerSession: 2 });

      await service.forceShowScheduledReminder();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // Advance past global rate limit
      await service.forceShowScheduledReminder();
      await service.forceScheduledReminderCheck();

      const state = service.getState();
      expect(state.scheduledReminderCount).toBe(2);
    });

    it('should not show scheduled reminder in snooze period', async () => {
      service.snoozeReminders();

      await service.forceScheduledReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should not show scheduled reminder during ongoing operations', async () => {
      vi.mocked(mockOperationStateManager.hasOngoingOperations).mockReturnValue(true);

      await service.forceScheduledReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should show scheduled reminder with correct message format', async () => {
      await service.forceShowScheduledReminder();

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: expect.stringContaining('Scheduled reminder'),
        })
      );
    });

    it('should increment scheduled reminder count', async () => {
      const stateBefore = service.getState();

      await service.forceShowScheduledReminder();

      const stateAfter = service.getState();
      expect(stateAfter.scheduledReminderCount).toBe(stateBefore.scheduledReminderCount + 1);
    });

    it('should update lastScheduledReminderTime', async () => {
      const beforeTime = Date.now();

      await service.forceShowScheduledReminder();

      const state = service.getState();
      expect(state.lastScheduledReminderTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should reset scheduled reminder count when user pushes', () => {
      service.resetReminderState();

      const state = service.getState();
      expect(state.scheduledReminderCount).toBe(0);
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug mode', () => {
      service.enableDebugMode();

      const debugInfo = service.getDebugInfo() as { debugMode: boolean };
      expect(debugInfo.debugMode).toBe(true);
    });

    it('should disable debug mode', () => {
      service.enableDebugMode();
      service.disableDebugMode();

      const debugInfo = service.getDebugInfo() as { debugMode: boolean };
      expect(debugInfo.debugMode).toBe(false);
    });

    it('should restart intervals when enabling debug mode', () => {
      service.enableDebugMode();

      const debugInfo = service.getDebugInfo() as { debugMode: boolean };
      expect(debugInfo.debugMode).toBe(true);
    });

    it('should restart intervals when disabling debug mode', () => {
      service.enableDebugMode();
      service.disableDebugMode();

      const debugInfo = service.getDebugInfo() as { debugMode: boolean };
      expect(debugInfo.debugMode).toBe(false);
    });

    it('should provide debug information', () => {
      const debugInfo = service.getDebugInfo();

      expect(debugInfo).toHaveProperty('settings');
      expect(debugInfo).toHaveProperty('state');
      expect(debugInfo).toHaveProperty('isEnabled');
      expect(debugInfo).toHaveProperty('debugMode');
      expect(debugInfo).toHaveProperty('isInSnooze');
      expect(debugInfo).toHaveProperty('hasIntervalPassed');
    });

    it('should force reminder check', async () => {
      await service.forceReminderCheck();

      expect(mockActivityMonitor.isSystemIdle).toHaveBeenCalled();
    });

    it('should force show reminder', async () => {
      await service.forceShowReminder();

      expect(mockNotificationManager.showNotification).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should stop activity monitor on cleanup', () => {
      service.cleanup();

      expect(mockActivityMonitor.stop).toHaveBeenCalled();
    });

    it('should clear check interval on cleanup', () => {
      service.cleanup();

      expect(mockActivityMonitor.stop).toHaveBeenCalled();
    });

    it('should clear scheduled interval on cleanup', () => {
      service.cleanup();

      expect(mockActivityMonitor.stop).toHaveBeenCalled();
    });

    it('should handle cleanup when intervals are null', () => {
      const newService = new PushReminderService(mockMessageHandler, mockNotificationManager);
      newService.cleanup();

      expect(() => newService.cleanup()).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(
            new Map([
              ['file1.ts', { status: 'modified' }],
              ['file2.ts', { status: 'added' }],
              ['file3.ts', { status: 'modified' }],
            ])
          ),
        })),
      }));
    });

    it('should handle complete reminder workflow', async () => {
      await service.forceShowReminder();

      const state1 = service.getState();
      expect(state1.reminderCount).toBe(1);

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const pushAction = call.actions?.[0].action;
      await pushAction?.();

      const state2 = service.getState();
      expect(state2.reminderCount).toBe(0);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'PUSH_TO_GITHUB',
      });
    });

    it('should handle snooze workflow', async () => {
      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const snoozeAction = call.actions?.[1].action;
      snoozeAction?.();

      const state = service.getState();
      expect(state.lastSnoozeTime).toBeGreaterThan(0);

      await service.forceReminderCheck();

      expect(vi.mocked(mockNotificationManager.showNotification)).toHaveBeenCalledOnce();
    });

    it('should respect max reminders per session', async () => {
      await service.updateSettings({ maxRemindersPerSession: 3 });

      await service.forceShowReminder();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // Advance past global rate limit
      await service.forceShowReminder();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // Advance past global rate limit
      await service.forceShowReminder();

      const state = service.getState();
      expect(state.reminderCount).toBe(3);
    });

    it('should handle mixed idle and scheduled reminders', async () => {
      await service.forceShowReminder();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // Advance past global rate limit
      await service.forceShowScheduledReminder();

      const state = service.getState();
      expect(state.reminderCount).toBe(1);
      expect(state.scheduledReminderCount).toBe(1);
    });

    it('should reset both reminder types on push', () => {
      service.resetReminderState();

      const state = service.getState();
      expect(state.reminderCount).toBe(0);
      expect(state.scheduledReminderCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty changes gracefully', async () => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(new Map()),
        })),
      }));

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should handle FileChangeHandler errors', async () => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockRejectedValue(new Error('Failed to get changes')),
        })),
      }));

      await expect(service.forceReminderCheck()).resolves.not.toThrow();
    });

    it('should handle unchanged files correctly', async () => {
      vi.doMock('../../handlers/FileChangeHandler', () => ({
        FileChangeHandler: vi.fn().mockImplementation(() => ({
          getChangedFiles: vi.fn().mockResolvedValue(
            new Map([
              ['file1.ts', { status: 'unchanged' }],
              ['file2.ts', { status: 'unchanged' }],
            ])
          ),
        })),
      }));

      await service.forceReminderCheck();

      expect(mockNotificationManager.showNotification).not.toHaveBeenCalled();
    });

    it('should handle rapid enable/disable cycles', () => {
      for (let i = 0; i < 10; i++) {
        service.enable();
        service.disable();
      }

      const debugInfo = service.getDebugInfo() as { isEnabled: boolean };
      expect(debugInfo.isEnabled).toBe(false);
    });

    it('should handle rapid snooze calls', () => {
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        service.snoozeReminders();
        times.push(service.getState().lastSnoozeTime);
      }

      expect(times.every((t) => t > 0)).toBe(true);
    });

    it('should handle multiple cleanup calls', () => {
      service.cleanup();
      service.cleanup();

      expect(mockActivityMonitor.stop).toHaveBeenCalled();
    });

    it('should handle missing chrome.runtime.sendMessage', async () => {
      const chromeWithoutRuntime = {
        ...mockChrome,
        runtime: undefined,
      } as unknown as typeof chrome;
      vi.stubGlobal('chrome', chromeWithoutRuntime);

      await service.forceShowReminder();

      const call = vi.mocked(mockNotificationManager.showNotification).mock.calls[0][0];
      const pushAction = call.actions?.[0].action;

      await expect(pushAction?.()).resolves.not.toThrow();
    });
  });

  describe('Premium Integration', () => {
    it('should set premium service reference', () => {
      const mockPremiumService = {} as never;
      service.setPremiumService(mockPremiumService);

      expect(() => service.setPremiumService(mockPremiumService)).not.toThrow();
    });
  });

  describe('Phase 1: Tab Visibility & Notification Management', () => {
    let phaseService: PushReminderService;
    let storageData: Record<string, unknown> = {};
    let listeners: Map<string, ((...args: unknown[]) => void)[]>;
    let mockDoc: {
      visibilityState: string;
      addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
      removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
      dispatchEvent: (event: Event) => boolean;
    };

    beforeEach(() => {
      storageData = {};
      listeners = new Map();

      // Override chrome mock with storage support
      const mockChromeWithStorage = {
        storage: {
          local: {
            get: vi.fn((keys) => {
              if (Array.isArray(keys)) {
                const result: Record<string, unknown> = {};
                keys.forEach((key) => {
                  if (key in storageData) result[key] = storageData[key];
                });
                return Promise.resolve(result);
              }
              return Promise.resolve(storageData);
            }),
            set: vi.fn((items) => {
              Object.assign(storageData, items);
              return Promise.resolve();
            }),
          },
        },
        runtime: { sendMessage: vi.fn() },
      } as unknown as typeof chrome;

      vi.stubGlobal('chrome', mockChromeWithStorage);

      // Mock document with event dispatching
      mockDoc = {
        visibilityState: 'visible',
        addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event)!.push(handler);
        }),
        removeEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          const eventListeners = listeners.get(event);
          if (eventListeners) {
            const index = eventListeners.indexOf(handler);
            if (index > -1) eventListeners.splice(index, 1);
          }
        }),
        dispatchEvent: vi.fn((event: Event) => {
          const eventListeners = listeners.get(event.type);
          if (eventListeners) eventListeners.forEach((handler) => handler(event));
          return true;
        }),
      };

      vi.stubGlobal('document', mockDoc);

      // Create new service for phase tests
      phaseService = new PushReminderService(mockMessageHandler, mockNotificationManager);
    });

    afterEach(() => {
      if (phaseService) {
        phaseService.cleanup();
      }
    });

    describe('Tab Visibility Detection', () => {
      it('should track visibility state and pause/resume timers', async () => {
        // Wait for initialization to complete
        await vi.waitFor(() => {
          expect(mockDoc.addEventListener).toHaveBeenCalled();
        });

        mockDoc.visibilityState = 'hidden';
        mockDoc.dispatchEvent(new Event('visibilitychange'));

        const debugInfo = phaseService.getDebugInfo() as { timersActive: boolean };
        expect(debugInfo.timersActive).toBe(false);

        mockDoc.visibilityState = 'visible';
        mockDoc.dispatchEvent(new Event('visibilitychange'));

        const debugInfoAfter = phaseService.getDebugInfo() as { timersActive: boolean };
        expect(debugInfoAfter.timersActive).toBe(true);
      });

      it('should queue notifications when tab is hidden', async () => {
        // Wait for initialization to complete
        await vi.waitFor(() => {
          expect(mockDoc.addEventListener).toHaveBeenCalled();
        });

        phaseService.enableDebugMode();

        vi.doMock('../../handlers/FileChangeHandler', () => ({
          FileChangeHandler: vi.fn().mockImplementation(() => ({
            getChangedFiles: vi.fn().mockResolvedValue(
              new Map([
                ['file1.ts', { status: 'added', path: 'file1.ts' }],
                ['file2.ts', { status: 'modified', path: 'file2.ts' }],
                ['file3.ts', { status: 'added', path: 'file3.ts' }],
              ])
            ),
          })),
        }));

        mockDoc.visibilityState = 'hidden';
        mockDoc.dispatchEvent(new Event('visibilitychange'));

        await phaseService.forceShowReminder();

        const debugInfo = phaseService.getDebugInfo() as { pendingNotificationQueue?: unknown[] };
        expect(debugInfo.pendingNotificationQueue).toBeDefined();
        expect(debugInfo.pendingNotificationQueue!.length).toBeGreaterThan(0);
      });
    });

    describe('Notification Deduplication', () => {
      it('should prevent duplicate notifications within cooldown period', async () => {
        phaseService.enableDebugMode();

        vi.doMock('../../handlers/FileChangeHandler', () => ({
          FileChangeHandler: vi.fn().mockImplementation(() => ({
            getChangedFiles: vi.fn().mockResolvedValue(
              new Map([
                ['file1.ts', { status: 'added', path: 'file1.ts' }],
                ['file2.ts', { status: 'modified', path: 'file2.ts' }],
                ['file3.ts', { status: 'added', path: 'file3.ts' }],
              ])
            ),
          })),
        }));

        await phaseService.forceShowReminder();
        const firstCallCount = vi.mocked(mockNotificationManager.showNotification).mock.calls
          .length;

        await phaseService.forceShowReminder();
        const secondCallCount = vi.mocked(mockNotificationManager.showNotification).mock.calls
          .length;

        expect(secondCallCount).toBe(firstCallCount);
      });
    });
  });

  describe('Phase 2: State Persistence & Session Management', () => {
    let phaseService: PushReminderService;
    let storageData: Record<string, unknown> = {};
    let mockDoc: {
      visibilityState: string;
      addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
      removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
      dispatchEvent: (event: Event) => boolean;
    };
    let listeners: Map<string, ((...args: unknown[]) => void)[]>;

    beforeEach(() => {
      storageData = {};
      listeners = new Map();

      const mockChromeWithStorage = {
        storage: {
          local: {
            get: vi.fn((keys) => {
              if (Array.isArray(keys)) {
                const result: Record<string, unknown> = {};
                keys.forEach((key) => {
                  if (key in storageData) result[key] = storageData[key];
                });
                return Promise.resolve(result);
              }
              return Promise.resolve(storageData);
            }),
            set: vi.fn((items) => {
              Object.assign(storageData, items);
              return Promise.resolve();
            }),
          },
        },
        runtime: { sendMessage: vi.fn() },
      } as unknown as typeof chrome;

      vi.stubGlobal('chrome', mockChromeWithStorage);

      // Mock document with event dispatching
      mockDoc = {
        visibilityState: 'visible',
        addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event)!.push(handler);
        }),
        removeEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          const eventListeners = listeners.get(event);
          if (eventListeners) {
            const index = eventListeners.indexOf(handler);
            if (index > -1) eventListeners.splice(index, 1);
          }
        }),
        dispatchEvent: vi.fn((event: Event) => {
          const eventListeners = listeners.get(event.type);
          if (eventListeners) eventListeners.forEach((handler) => handler(event));
          return true;
        }),
      };

      vi.stubGlobal('document', mockDoc);

      // Create new service for phase tests
      phaseService = new PushReminderService(mockMessageHandler, mockNotificationManager);
    });

    afterEach(() => {
      if (phaseService) {
        phaseService.cleanup();
      }
    });

    describe('State Persistence', () => {
      it('should persist state changes to storage', async () => {
        phaseService.enableDebugMode();

        vi.doMock('../../handlers/FileChangeHandler', () => ({
          FileChangeHandler: vi.fn().mockImplementation(() => ({
            getChangedFiles: vi.fn().mockResolvedValue(
              new Map([
                ['file1.ts', { status: 'added', path: 'file1.ts' }],
                ['file2.ts', { status: 'modified', path: 'file2.ts' }],
                ['file3.ts', { status: 'added', path: 'file3.ts' }],
              ])
            ),
          })),
        }));

        await phaseService.forceShowReminder();
        await vi.advanceTimersByTimeAsync(1100);

        expect(storageData['pushReminderState']).toBeDefined();
      });
    });

    describe('Session Reset Logic', () => {
      it('should provide manual reset method', async () => {
        const initialState = phaseService.getState();

        await phaseService.resetSession();

        const newState = phaseService.getState();
        expect(newState.reminderCount).toBe(0);
        expect(newState.scheduledReminderCount).toBe(0);
        expect(newState.sessionStartTime).toBeGreaterThanOrEqual(initialState.sessionStartTime);
      });

      it('should emit events when session resets', async () => {
        const resetHandler = vi.fn();
        phaseService.onSessionReset(resetHandler);

        await phaseService.resetSession();

        expect(resetHandler).toHaveBeenCalledTimes(1);
        expect(resetHandler).toHaveBeenCalledWith({
          timestamp: expect.any(Number),
          reason: 'manual',
        });
      });
    });

    describe('Pending Notification Queue', () => {
      it('should limit queue size to prevent memory issues', async () => {
        phaseService.enableDebugMode();

        vi.doMock('../../handlers/FileChangeHandler', () => ({
          FileChangeHandler: vi.fn().mockImplementation(() => ({
            getChangedFiles: vi.fn().mockResolvedValue(
              new Map([
                ['file1.ts', { status: 'added', path: 'file1.ts' }],
                ['file2.ts', { status: 'modified', path: 'file2.ts' }],
                ['file3.ts', { status: 'added', path: 'file3.ts' }],
              ])
            ),
          })),
        }));

        mockDoc.visibilityState = 'hidden';
        mockDoc.dispatchEvent(new Event('visibilitychange'));

        for (let i = 0; i < 10; i++) {
          await phaseService.forceShowReminder();
        }

        const debugInfo = phaseService.getDebugInfo() as { pendingNotificationQueue?: unknown[] };
        expect(debugInfo.pendingNotificationQueue).toBeDefined();
        expect(debugInfo.pendingNotificationQueue!.length).toBeLessThanOrEqual(5);
      });
    });
  });
});
