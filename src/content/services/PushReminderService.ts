import type { MessageHandler } from '../MessageHandler';
import type { INotificationManager } from '../types/ManagerInterfaces';
import { ActivityMonitor } from '../infrastructure/ActivityMonitor';
import type { PremiumService } from './PremiumService';
import { OperationStateManager } from './OperationStateManager';
import { isPremium, pushStatisticsActions } from '../../lib/stores';
import { get } from 'svelte/store';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('PushReminderService');

export interface PushReminderSettings {
  enabled: boolean;
  reminderInterval: number; // minutes
  snoozeInterval: number; // minutes
  minimumChanges: number; // minimum files changed to trigger reminder
  maxRemindersPerSession: number;
  scheduledEnabled: boolean; // separate enable/disable for scheduled reminders
  scheduledInterval: number; // minutes - fixed interval regardless of activity
  maxScheduledPerSession: number; // max scheduled reminders per session
  globalNotificationRateLimitMinutes?: number; // global rate limit across all notification types
  perTypeRateLimits?: boolean; // whether to use separate rate limits per notification type
  activityRateLimitMinutes?: number; // rate limit for activity reminders
  scheduledRateLimitMinutes?: number; // rate limit for scheduled reminders
  showMostRecentFromQueue?: boolean; // whether to show most recent notification from queue when tab becomes visible
}

export interface ReminderState {
  lastReminderTime: number;
  lastSnoozeTime: number;
  reminderCount: number;
  sessionStartTime: number;
  lastScheduledReminderTime: number;
  scheduledReminderCount: number;
  snoozeEndTime?: number;
}

interface NotificationHistoryEntry {
  type: 'activity' | 'scheduled';
  timestamp: number;
}

interface TabVisibilityState {
  isVisible: boolean;
  lastVisibilityChange: number;
  hiddenStartTime: number;
  hiddenDuration: number;
}

interface GlobalRateLimit {
  lastNotificationTime: number;
  intervalMs: number;
}

interface PendingNotification {
  type: 'activity' | 'scheduled';
  timestamp: number;
}

/**
 * PushReminderService provides intelligent reminders to push changes to GitHub
 * when the user has been working for a while and has unsaved changes.
 */
export class PushReminderService {
  private messageHandler: MessageHandler;
  private notificationManager: INotificationManager;
  private activityMonitor: ActivityMonitor;
  private isEnabled: boolean = true;
  private checkTimeout: NodeJS.Timeout | null = null;
  private scheduledTimeout: NodeJS.Timeout | null = null;
  private state: ReminderState;
  private premiumService: PremiumService | null = null;
  private operationStateManager: OperationStateManager;

  private tabVisibility: TabVisibilityState = {
    isVisible: true,
    lastVisibilityChange: Date.now(),
    hiddenStartTime: 0,
    hiddenDuration: 0,
  };
  private visibilityChangeHandler: ((event: Event) => void) | null = null;
  private timersActive: boolean = true;

  private notificationHistory: NotificationHistoryEntry[] = [];
  private readonly NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private readonly HISTORY_CLEANUP_AGE_MS = 60 * 60 * 1000; // 1 hour
  private lastNotification: { type: string; timestamp: number } | null = null;

  private timerType = 'setTimeout' as const;
  private activeTimerId: NodeJS.Timeout | null = null;
  private nextCheckTime: number = 0;

  private globalRateLimit: GlobalRateLimit = {
    lastNotificationTime: 0,
    intervalMs: 5 * 60 * 1000, // 5 minutes default
  };

  // Default settings
  private settings: PushReminderSettings = {
    enabled: true,
    reminderInterval: 20, // 20 minutes
    snoozeInterval: 10, // 10 minutes
    minimumChanges: 3, // at least 3 files changed
    maxRemindersPerSession: 5, // max 5 reminders per session
    // Scheduled reminders default to disabled (opt-in) to reduce notification spam
    // Users can enable them via settings UI if they want fixed-interval reminders
    scheduledEnabled: false,
    scheduledInterval: 15,
    maxScheduledPerSession: 10,
  };

  private debugMode: boolean = false;

  private sessionResetHandlers: Array<(event: { timestamp: number; reason: string }) => void> = [];

  private pendingNotificationQueue: PendingNotification[] = [];
  private readonly MAX_QUEUE_SIZE = 5;

  constructor(messageHandler: MessageHandler, notificationManager: INotificationManager) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.activityMonitor = new ActivityMonitor();
    this.operationStateManager = OperationStateManager.getInstance();

    this.state = {
      lastReminderTime: 0,
      lastSnoozeTime: 0,
      reminderCount: 0,
      sessionStartTime: Date.now(),
      lastScheduledReminderTime: 0,
      scheduledReminderCount: 0,
    };

    logger.info('🔧 Push reminder: Service initializing with settings:', this.settings);
    logger.info('🔧 Push reminder: Debug mode:', this.debugMode);
    logger.info('🔧 Push reminder: Initial state:', this.state);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadSettings();
    await this.loadState();
    this.setupTabVisibilityMonitoring();
    this.setupActivityMonitoring();
  }

  private setupTabVisibilityMonitoring(): void {
    this.visibilityChangeHandler = () => {
      const isVisible = document.visibilityState === 'visible';
      const now = Date.now();

      if (!isVisible && this.tabVisibility.isVisible) {
        this.tabVisibility.hiddenStartTime = now;
        this.pauseTimers();
      } else if (isVisible && !this.tabVisibility.isVisible) {
        this.tabVisibility.hiddenDuration = now - this.tabVisibility.hiddenStartTime;
        this.resumeTimers();

        this.processPendingNotificationQueue();
      }

      this.tabVisibility.isVisible = isVisible;
      this.tabVisibility.lastVisibilityChange = now;
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  private pauseTimers(): void {
    this.timersActive = false;
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
  }

  private resumeTimers(): void {
    this.timersActive = true;
    this.scheduleNextCheck();
    if (this.settings.scheduledEnabled) {
      this.scheduleNextScheduledCheck();
    }
  }

  /**
   * Load user settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['pushReminderSettings']);
      if (result.pushReminderSettings) {
        this.settings = { ...this.settings, ...result.pushReminderSettings };
      }
    } catch (error) {
      logger.warn('Failed to load push reminder settings:', error);
    }
  }

  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['pushReminderState']);
      if (result.pushReminderState) {
        const loadedState = result.pushReminderState as ReminderState;

        const sessionAge = Date.now() - loadedState.sessionStartTime;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (sessionAge > twentyFourHours) {
          logger.info('🔄 Push reminder: Session is >24 hours old, resetting counts');
          this.state = {
            ...this.state,
            ...loadedState,
            reminderCount: 0,
            scheduledReminderCount: 0,
            sessionStartTime: Date.now(),
          };
          this.emitSessionReset({ timestamp: Date.now(), reason: 'automatic' });
        } else {
          this.state = { ...this.state, ...loadedState };
        }

        logger.info('🔧 Push reminder: Loaded state from storage:', this.state);
      }

      await this.saveState(true);
    } catch (error) {
      logger.warn('Failed to load push reminder state:', error);
    }
  }

  /**
   * Save user settings to storage
   */
  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({ pushReminderSettings: this.settings });
    } catch (error) {
      logger.warn('Failed to save push reminder settings:', error);
    }
  }

  private saveStateTimeout: NodeJS.Timeout | null = null;
  private readonly STATE_SAVE_DEBOUNCE_MS = 1000;

  private async saveState(immediate = false): Promise<void> {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
      this.saveStateTimeout = null;
    }

    if (immediate) {
      try {
        await chrome.storage.local.set({ pushReminderState: this.state });
        logger.info('💾 Push reminder: State saved to storage (immediate)');
      } catch (error) {
        logger.warn('Failed to save push reminder state:', error);
      }
      return;
    }

    this.saveStateTimeout = setTimeout(async () => {
      try {
        await chrome.storage.local.set({ pushReminderState: this.state });
        logger.info('💾 Push reminder: State saved to storage');
      } catch (error) {
        logger.warn('Failed to save push reminder state:', error);
      }
    }, this.STATE_SAVE_DEBOUNCE_MS);
  }

  private setupActivityMonitoring(): void {
    this.activityMonitor.start();

    this.scheduleNextCheck();

    this.setupScheduledReminders();
  }

  private scheduleNextCheck(): void {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }

    if (!this.timersActive) {
      return;
    }

    const checkInterval = this.debugMode ? 10 * 1000 : 2 * 60 * 1000;
    this.nextCheckTime = Date.now() + checkInterval;

    logger.info(
      `🔧 Push reminder: Scheduling next check in ${checkInterval / 1000}s (debug: ${this.debugMode})`
    );

    this.checkTimeout = setTimeout(() => {
      this.checkForReminderOpportunity();
      this.scheduleNextCheck();
    }, checkInterval);

    this.activeTimerId = this.checkTimeout;
  }

  private scheduleNextScheduledCheck(): void {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }

    if (!this.timersActive) {
      return;
    }

    const scheduledInterval = this.debugMode
      ? 60 * 1000
      : this.settings.scheduledInterval * 60 * 1000;

    this.scheduledTimeout = setTimeout(() => {
      this.checkForScheduledReminder();
      this.scheduleNextScheduledCheck();
    }, scheduledInterval);
  }

  /**
   * Main logic to determine if we should show a reminder
   */
  private async checkForReminderOpportunity(): Promise<void> {
    logger.info('🔍 Push reminder: Checking for reminder opportunity...');

    const sessionAge = Date.now() - this.state.sessionStartTime;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (sessionAge > twentyFourHours) {
      logger.info('🔄 Push reminder: Session is >24 hours old, resetting');
      await this.resetSession('automatic');
    }

    if (!this.settings.enabled || !this.isEnabled) {
      logger.info(
        '❌ Push reminder: Disabled (settings.enabled:',
        this.settings.enabled,
        ', isEnabled:',
        this.isEnabled,
        ')'
      );
      return;
    }

    // Check if the user is not premium and has no push attempts yet
    const isUserPremium = get(isPremium);
    const noPushAttempts = (await pushStatisticsActions.hasPushAttempts()) === false;

    if (!isUserPremium && noPushAttempts) {
      logger.info(
        '✅ Push reminder: User is not premium and has no push attempts yet - allowing reminder to encourage first GitHub push'
      );
      // Continue with the normal reminder flow instead of showing immediately
      // This allows the user to see reminders that encourage them to push to GitHub
    } else if (!isUserPremium) {
      // User is not premium but has made push attempts - show premium upgrade
      logger.info('❌ Push reminder: Premium feature not available, quietly skipping reminder');
      // this.showPremiumUpgradeNotification('pushReminders');
      return;
    }

    logger.info('✅ Push reminder: Service is enabled');

    // Check if we've reached max reminders for this session
    if (this.state.reminderCount >= this.settings.maxRemindersPerSession) {
      logger.info(
        '❌ Push reminder: Max reminders reached for session (',
        this.state.reminderCount,
        '/',
        this.settings.maxRemindersPerSession,
        ')'
      );
      return;
    }
    logger.info(
      '✅ Push reminder: Under reminder limit (',
      this.state.reminderCount,
      '/',
      this.settings.maxRemindersPerSession,
      ')'
    );

    // Check if we're in snooze period
    if (this.isInSnoozeInterval()) {
      const snoozeUntil = new Date(
        this.state.lastSnoozeTime + this.settings.snoozeInterval * 60 * 1000
      );
      logger.info('❌ Push reminder: In snooze period until', snoozeUntil.toLocaleTimeString());
      return;
    }
    logger.info('✅ Push reminder: Not in snooze period');

    // Check for ongoing operations that should suppress reminders
    if (await this.hasOngoingOperations()) {
      logger.info('❌ Push reminder: Skipping due to ongoing operations');
      return;
    }
    logger.info('✅ Push reminder: No conflicting operations in progress');

    // Check if enough time has passed since last reminder
    if (!this.hasReminderIntervalPassed()) {
      const nextReminderTime = new Date(
        this.state.lastReminderTime +
          (this.debugMode ? 30 * 1000 : this.settings.reminderInterval * 60 * 1000)
      );
      logger.info(
        '❌ Push reminder: Too soon since last reminder. Next reminder at:',
        nextReminderTime.toLocaleTimeString()
      );
      return;
    }
    logger.info('✅ Push reminder: Enough time has passed since last reminder');

    // Check if system is idle (user and Bolt not active)
    logger.info('🔍 Push reminder: Activity status:', {
      isUserIdle: this.activityMonitor.isUserIdle(),
      isBoltIdle: this.activityMonitor.isBoltIdle(),
      isSystemIdle: this.activityMonitor.isSystemIdle(),
      userIdleFor: Math.floor(this.activityMonitor.getTimeSinceUserActivity() / 1000) + 's',
      boltIdleFor: Math.floor(this.activityMonitor.getTimeSinceBoltActivity() / 1000) + 's',
    });

    if (!this.activityMonitor.isSystemIdle()) {
      logger.info('❌ Push reminder: System not idle (user or Bolt still active)');
      return;
    }
    logger.info('✅ Push reminder: System is idle');

    // Check if there are enough changes to warrant a reminder
    logger.info('🔍 Push reminder: Checking for significant changes...');
    const hasSignificantChanges = await this.hasSignificantChanges();
    if (!hasSignificantChanges) {
      logger.info('❌ Push reminder: Not enough significant changes');
      return;
    }
    logger.info('✅ Push reminder: Has significant changes');

    // All conditions met - show reminder
    logger.info('🎯 Push reminder: ALL CONDITIONS MET - Showing reminder!');
    await this.showPushReminder();
  }

  private isInSnoozeInterval(): boolean {
    if (this.state.lastSnoozeTime === 0) return false;

    if (this.state.snoozeEndTime !== undefined) {
      return Date.now() < this.state.snoozeEndTime;
    }

    const snoozeUntil = this.state.lastSnoozeTime + this.settings.snoozeInterval * 60 * 1000;
    return Date.now() < snoozeUntil;
  }

  private hasReminderIntervalPassed(): boolean {
    if (this.state.lastReminderTime === 0) return true;

    const intervalMs = this.debugMode ? 30 * 1000 : this.settings.reminderInterval * 60 * 1000;
    const timeSinceLastReminder = Date.now() - this.state.lastReminderTime;
    return timeSinceLastReminder >= intervalMs;
  }

  /**
   * Check if there are significant changes to warrant a reminder
   */
  private async hasSignificantChanges(): Promise<boolean> {
    try {
      logger.info('🔍 Push reminder: Importing FileChangeHandler...');
      // Import FileChangeHandler to check for changes
      const { FileChangeHandler } = await import('../handlers/FileChangeHandler');
      const fileChangeHandler = new FileChangeHandler(
        this.messageHandler,
        this.notificationManager
      );

      logger.info('🔍 Push reminder: Getting changed files...');
      // Get current changes with lightweight check
      const changes = await fileChangeHandler.getChangedFiles(false);

      // Count meaningful changes (added/modified/deleted, not unchanged)
      const meaningfulChanges = Array.from(changes.values()).filter(
        (change) => change.status !== 'unchanged'
      );

      const changeBreakdown = {
        total: changes.size,
        meaningful: meaningfulChanges.length,
        unchanged: Array.from(changes.values()).filter((c) => c.status === 'unchanged').length,
        added: meaningfulChanges.filter((c) => c.status === 'added').length,
        modified: meaningfulChanges.filter((c) => c.status === 'modified').length,
        deleted: meaningfulChanges.filter((c) => c.status === 'deleted').length,
      };

      logger.info('📊 Push reminder: Change breakdown:', changeBreakdown);
      logger.info(
        `📊 Push reminder: Found ${meaningfulChanges.length} meaningful changes (need ${this.settings.minimumChanges})`
      );

      // Provide context for why files are considered changed
      if (changeBreakdown.added === changeBreakdown.meaningful && changeBreakdown.added > 0) {
        logger.info(
          '📊 Push reminder: All meaningful changes are "added" files - likely new project or non-existent GitHub repo'
        );
      } else if (changeBreakdown.meaningful > 0) {
        logger.info('📊 Push reminder: Mix of changes detected - active development session');
      } else {
        logger.info('📊 Push reminder: No meaningful changes detected');
      }

      const hasEnough = meaningfulChanges.length >= this.settings.minimumChanges;
      logger.info(`📊 Push reminder: Has enough changes: ${hasEnough}`);

      return hasEnough;
    } catch (error) {
      logger.warn('❌ Push reminder: Failed to check for changes:', error);
      return false;
    }
  }

  private isNotificationAllowed(type: 'activity' | 'scheduled'): boolean {
    const now = Date.now();

    this.cleanupNotificationHistory();

    const recentSameType = this.notificationHistory.find(
      (entry) => entry.type === type && now - entry.timestamp < this.NOTIFICATION_COOLDOWN_MS
    );

    return !recentSameType;
  }

  private cleanupNotificationHistory(): void {
    const now = Date.now();
    this.notificationHistory = this.notificationHistory.filter(
      (entry) => now - entry.timestamp < this.HISTORY_CLEANUP_AGE_MS
    );
  }

  private recordNotification(type: 'activity' | 'scheduled'): void {
    const now = Date.now();
    this.notificationHistory.push({ type, timestamp: now });
    this.lastNotification = { type, timestamp: now };
  }

  private isGlobalRateLimitPassed(): boolean {
    if (this.settings.perTypeRateLimits) {
      return true;
    }

    const now = Date.now();
    const timeSinceLastNotification = now - this.globalRateLimit.lastNotificationTime;
    return timeSinceLastNotification >= this.globalRateLimit.intervalMs;
  }

  private isPerTypeRateLimitPassed(type: 'activity' | 'scheduled'): boolean {
    if (!this.settings.perTypeRateLimits) {
      return true;
    }

    const now = Date.now();
    const lastOfType = this.notificationHistory
      .filter((entry) => entry.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!lastOfType) {
      return true;
    }

    const rateLimitMinutes =
      type === 'activity'
        ? this.settings.activityRateLimitMinutes || 5
        : this.settings.scheduledRateLimitMinutes || 10;

    const rateLimitMs = rateLimitMinutes * 60 * 1000;
    const timeSinceLast = now - lastOfType.timestamp;

    return timeSinceLast >= rateLimitMs;
  }

  private updateGlobalRateLimit(): void {
    this.globalRateLimit.lastNotificationTime = Date.now();
  }

  public clearNotificationHistory(): void {
    this.notificationHistory = [];
    this.lastNotification = null;
  }

  private async showPushReminder(): Promise<void> {
    try {
      if (!this.tabVisibility.isVisible) {
        logger.info('❌ Push reminder: Tab is hidden, queuing notification');
        this.queueNotification('activity');
        return;
      }

      if (!this.isGlobalRateLimitPassed()) {
        logger.info('❌ Push reminder: Blocked by global rate limit');
        return;
      }

      if (!this.isPerTypeRateLimitPassed('activity')) {
        logger.info('❌ Push reminder: Blocked by per-type rate limit');
        return;
      }

      if (!this.isNotificationAllowed('activity')) {
        logger.info('❌ Push reminder: Blocked by deduplication (within cooldown)');
        return;
      }

      logger.info('🎯 Push reminder: Generating reminder message...');
      const changes = await this.getChangesSummary();

      const message = `💾 You have ${changes.count} unsaved changes. Consider pushing to GitHub! ${changes.summary}`;
      logger.info('📢 Push reminder: Showing notification:', message);

      const existingReminders = this.notificationManager.getReminderNotificationCount();
      if (existingReminders > 0) {
        logger.info(
          `🧹 Push reminder: ${existingReminders} existing reminder(s) will be cleared to prevent stacking`
        );
      }

      this.notificationManager.showNotification({
        type: 'info',
        message: message,
        duration: 0,
        actions: [
          {
            text: 'Push to GitHub',
            variant: 'primary',
            action: async () => {
              logger.info('🚀 Push reminder: User clicked "Push to GitHub" button');
              try {
                chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });

                this.resetReminderState();

                logger.info('✅ Push reminder: GitHub push initiated from notification');
              } catch (error) {
                logger.error('❌ Push reminder: Failed to initiate GitHub push:', error);
              }
            },
          },
          {
            text: 'Snooze',
            variant: 'ghost',
            action: () => {
              logger.info('😴 Push reminder: User snoozed reminders');
              this.snoozeReminders();
            },
          },
        ],
      });

      const oldState = { ...this.state };
      this.state.lastReminderTime = Date.now();
      this.state.reminderCount++;

      this.recordNotification('activity');
      this.updateGlobalRateLimit();

      await this.saveState();

      logger.info('📊 Push reminder: State updated:', {
        oldReminderCount: oldState.reminderCount,
        newReminderCount: this.state.reminderCount,
        maxReminders: this.settings.maxRemindersPerSession,
        lastReminderTime: new Date(this.state.lastReminderTime).toLocaleTimeString(),
      });

      logger.info(
        `🎉 Push reminder: Successfully shown reminder ${this.state.reminderCount}/${this.settings.maxRemindersPerSession}`
      );
    } catch (error) {
      logger.error('❌ Push reminder: Failed to show reminder:', error);
    }
  }

  /**
   * Get a summary of current changes for the reminder
   */
  private async getChangesSummary(): Promise<{ count: number; summary: string }> {
    try {
      const { FileChangeHandler } = await import('../handlers/FileChangeHandler');
      const fileChangeHandler = new FileChangeHandler(
        this.messageHandler,
        this.notificationManager
      );

      const changes = await fileChangeHandler.getChangedFiles(false);
      const meaningfulChanges = Array.from(changes.values()).filter(
        (change) => change.status !== 'unchanged'
      );

      const added = meaningfulChanges.filter((c) => c.status === 'added').length;
      const modified = meaningfulChanges.filter((c) => c.status === 'modified').length;
      const deleted = meaningfulChanges.filter((c) => c.status === 'deleted').length;

      const parts = [];
      if (added > 0) parts.push(`${added} new`);
      if (modified > 0) parts.push(`${modified} modified`);
      if (deleted > 0) parts.push(`${deleted} deleted`);

      const summary = parts.length > 0 ? `(${parts.join(', ')})` : '';

      return {
        count: meaningfulChanges.length,
        summary,
      };
    } catch {
      return { count: 0, summary: '' };
    }
  }

  /**
   * Snooze reminders for the configured interval
   */
  public async snoozeReminders(): Promise<void> {
    this.state.lastSnoozeTime = Date.now();
    logger.info(`🔊 Push reminders snoozed for ${this.settings.snoozeInterval} minutes`);

    await this.saveState();
  }

  public async snoozeForDuration(duration: number | 'untilTomorrow'): Promise<void> {
    const now = Date.now();
    this.state.lastSnoozeTime = now;

    if (duration === 'untilTomorrow') {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      this.state.snoozeEndTime = tomorrow.getTime();
      logger.info(`🔊 Push reminders snoozed until tomorrow (${tomorrow.toISOString()})`);
    } else {
      this.state.snoozeEndTime = now + duration * 60 * 1000;
      logger.info(`🔊 Push reminders snoozed for ${duration} minutes`);
    }

    await this.saveState();
  }

  /**
   * Enable push reminders
   */
  public enable(): void {
    this.isEnabled = true;
    logger.info('🔊 Push reminders enabled');
  }

  /**
   * Disable push reminders
   */
  public disable(): void {
    this.isEnabled = false;
    logger.info('🔊 Push reminders disabled');
  }

  public async updateSettings(newSettings: Partial<PushReminderSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    logger.info('🔊 Push reminder settings updated:', this.settings);

    if (newSettings.globalNotificationRateLimitMinutes !== undefined) {
      this.globalRateLimit.intervalMs = newSettings.globalNotificationRateLimitMinutes * 60 * 1000;
    }

    if (newSettings.scheduledEnabled !== undefined || newSettings.scheduledInterval !== undefined) {
      this.setupScheduledReminders();
    }
  }

  /**
   * Reset reminder state (useful when user pushes changes)
   */
  public async resetReminderState(): Promise<void> {
    this.state.lastReminderTime = Date.now();
    this.state.reminderCount = 0;
    this.state.scheduledReminderCount = 0;
    this.state.lastScheduledReminderTime = Date.now();
    logger.info('🔊 Push reminder state reset (both idle and scheduled)');

    await this.saveState();
  }

  public async resetSession(reason: 'manual' | 'automatic' = 'manual'): Promise<void> {
    logger.info(`🔄 Push reminder: Resetting session (reason: ${reason})`);

    const timestamp = Date.now();

    this.state.reminderCount = 0;
    this.state.scheduledReminderCount = 0;
    this.state.sessionStartTime = timestamp;
    this.state.lastReminderTime = 0;
    this.state.lastScheduledReminderTime = 0;

    this.emitSessionReset({ timestamp, reason });

    await this.saveState();

    logger.info('✅ Push reminder: Session reset complete');
  }

  public onSessionReset(handler: (event: { timestamp: number; reason: string }) => void): void {
    this.sessionResetHandlers.push(handler);
  }

  private emitSessionReset(event: { timestamp: number; reason: string }): void {
    this.sessionResetHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        logger.warn('Error in session reset handler:', error);
      }
    });
  }

  private queueNotification(type: 'activity' | 'scheduled'): void {
    if (this.pendingNotificationQueue.length < this.MAX_QUEUE_SIZE) {
      this.pendingNotificationQueue.push({
        type,
        timestamp: Date.now(),
      });
      logger.info(
        `📋 Push reminder: Queued ${type} notification (queue size: ${this.pendingNotificationQueue.length})`
      );
    } else {
      logger.info(
        `📋 Push reminder: Queue is full (${this.MAX_QUEUE_SIZE}), not queuing ${type} notification`
      );
    }
  }

  private async processPendingNotificationQueue(): Promise<void> {
    if (this.pendingNotificationQueue.length === 0) {
      return;
    }

    logger.info(
      `📋 Push reminder: Processing ${this.pendingNotificationQueue.length} pending notifications`
    );

    if (this.settings.showMostRecentFromQueue && this.pendingNotificationQueue.length > 0) {
      const mostRecent = this.pendingNotificationQueue[this.pendingNotificationQueue.length - 1];

      this.pendingNotificationQueue = [];

      logger.info(
        `📋 Push reminder: Showing most recent ${mostRecent.type} notification from queue`
      );

      if (mostRecent.type === 'activity') {
        await this.showPushReminder();
      } else {
        await this.showScheduledReminder();
      }
    } else {
      logger.info('📋 Push reminder: Clearing queue without showing notifications');
      this.pendingNotificationQueue = [];
    }
  }

  /**
   * Get current settings
   */
  public getSettings(): PushReminderSettings {
    return { ...this.settings };
  }

  /**
   * Get current state
   */
  public getState(): ReminderState {
    return { ...this.state };
  }

  public getDebugInfo(): object {
    const now = Date.now();
    const snoozeTimeRemaining =
      this.state.snoozeEndTime !== undefined ? Math.max(0, this.state.snoozeEndTime - now) : 0;

    return {
      settings: this.settings,
      state: this.state,
      isEnabled: this.isEnabled,
      debugMode: this.debugMode,
      isInSnooze: this.isInSnoozeInterval(),
      hasIntervalPassed: this.hasReminderIntervalPassed(),
      activityMonitor: this.activityMonitor.getDebugInfo(),
      operationState: this.operationStateManager.getDebugInfo(),
      tabVisibility: {
        isVisible: this.tabVisibility.isVisible,
        lastVisibilityChange: this.tabVisibility.lastVisibilityChange,
        hiddenDuration: this.tabVisibility.hiddenDuration,
      },
      timersActive: this.timersActive,
      notificationHistory: this.notificationHistory,
      lastNotification: this.lastNotification,
      timerType: this.timerType,
      activeTimerId: this.activeTimerId,
      activeTimerCount: this.activeTimerId ? 1 : 0,
      nextCheckTime: this.nextCheckTime,
      globalRateLimit: {
        lastNotificationTime: this.globalRateLimit.lastNotificationTime,
        intervalMs: this.globalRateLimit.intervalMs,
        timeUntilNextAllowed: Math.max(
          0,
          this.globalRateLimit.intervalMs - (Date.now() - this.globalRateLimit.lastNotificationTime)
        ),
      },
      pendingNotificationQueue: this.pendingNotificationQueue,
      snoozeStatus: {
        isSnoozed: this.isInSnoozeInterval(),
        snoozeEndTime: this.state.snoozeEndTime,
        timeRemainingMs: snoozeTimeRemaining,
        timeRemainingMinutes: Math.ceil(snoozeTimeRemaining / 60000),
      },
    };
  }

  public enableDebugMode(): void {
    logger.info('🔊 Push reminder DEBUG MODE enabled - using shorter intervals for testing');
    this.debugMode = true;

    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.setupActivityMonitoring();
  }

  public disableDebugMode(): void {
    logger.info('🔊 Push reminder debug mode disabled - using normal intervals');
    this.debugMode = false;

    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.setupActivityMonitoring();
  }

  /**
   * Force a reminder check (for testing)
   */
  public async forceReminderCheck(): Promise<void> {
    logger.info('🔊 Forcing push reminder check...');
    await this.checkForReminderOpportunity();
  }

  /**
   * Force show a reminder (bypass all checks, for testing)
   */
  public async forceShowReminder(): Promise<void> {
    logger.info('🔊 Forcing push reminder display...');
    await this.showPushReminder();
  }

  /**
   * Force a scheduled reminder check (for testing)
   */
  public async forceScheduledReminderCheck(): Promise<void> {
    logger.info('🔊 Forcing scheduled reminder check...');
    await this.checkForScheduledReminder();
  }

  /**
   * Force show a scheduled reminder (for testing)
   */
  public async forceShowScheduledReminder(): Promise<void> {
    logger.info('🔊 Forcing scheduled reminder display...');
    await this.showScheduledReminder();
  }

  /**
   * Set premium service reference (called by UIManager)
   */
  public setPremiumService(premiumService: PremiumService): void {
    this.premiumService = premiumService;
  }

  /**
   * Show premium upgrade notification for blocked features
   */
  private showPremiumUpgradeNotification(feature: string): void {
    const featureNames: Record<string, string> = {
      pushReminders: 'Smart Push Reminders',
    };

    this.notificationManager.showNotification({
      type: 'info',
      message: `⭐ ${featureNames[feature] || 'Premium Feature'} requires upgrade. Click to learn more!`,
      duration: 8000,
    });
  }

  public cleanup(): void {
    logger.info('🔊 Cleaning up push reminder service');
    logger.info('🔍 Push reminder cleanup stack trace:');

    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
      logger.info('🔧 Push reminder: Removed visibility change listener');
    }

    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
      this.activeTimerId = null;
      logger.info('🔧 Push reminder: Cleared check timeout');
    }

    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
      logger.info('🔧 Push reminder: Cleared scheduled timeout');
    }

    this.activityMonitor.stop();
    logger.info('🔧 Push reminder: Stopped activity monitor');
  }

  private setupScheduledReminders(): void {
    if (!this.settings.scheduledEnabled) {
      logger.info('🔧 Push reminder: Scheduled reminders disabled');
      return;
    }

    logger.info('🔧 Push reminder: Setting up scheduled reminders');

    this.scheduleNextScheduledCheck();
  }

  /**
   * Check if we should show a scheduled reminder (ignores activity state)
   */
  private async checkForScheduledReminder(): Promise<void> {
    logger.info('⏰ Push reminder: Checking for scheduled reminder...');

    if (!this.settings.scheduledEnabled || !this.isEnabled) {
      logger.info(
        '❌ Scheduled reminder: Disabled (scheduledEnabled:',
        this.settings.scheduledEnabled,
        ', isEnabled:',
        this.isEnabled,
        ')'
      );
      return;
    }
    logger.info('✅ Scheduled reminder: Service is enabled');

    // Check if we've reached max scheduled reminders for this session
    if (this.state.scheduledReminderCount >= this.settings.maxScheduledPerSession) {
      logger.info(
        '❌ Scheduled reminder: Max scheduled reminders reached for session (',
        this.state.scheduledReminderCount,
        '/',
        this.settings.maxScheduledPerSession,
        ')'
      );
      return;
    }
    logger.info(
      '✅ Scheduled reminder: Under scheduled reminder limit (',
      this.state.scheduledReminderCount,
      '/',
      this.settings.maxScheduledPerSession,
      ')'
    );

    // Check if we're in snooze period (affects both types of reminders)
    if (this.isInSnoozeInterval()) {
      const snoozeUntil = new Date(
        this.state.lastSnoozeTime + this.settings.snoozeInterval * 60 * 1000
      );
      logger.info(
        '❌ Scheduled reminder: In snooze period until',
        snoozeUntil.toLocaleTimeString()
      );
      return;
    }
    logger.info('✅ Scheduled reminder: Not in snooze period');

    // Check for ongoing operations that should suppress reminders
    if (await this.hasOngoingOperations()) {
      logger.info('❌ Scheduled reminder: Skipping due to ongoing operations');
      return;
    }
    logger.info('✅ Scheduled reminder: No conflicting operations in progress');

    // Check if there are enough changes to warrant a reminder
    logger.info('🔍 Scheduled reminder: Checking for significant changes...');
    const hasSignificantChanges = await this.hasSignificantChanges();
    if (!hasSignificantChanges) {
      logger.info('❌ Scheduled reminder: Not enough significant changes');
      return;
    }
    logger.info('✅ Scheduled reminder: Has significant changes');

    // All conditions met - show scheduled reminder
    logger.info('⏰ Scheduled reminder: ALL CONDITIONS MET - Showing scheduled reminder!');
    await this.showScheduledReminder();
  }

  private async showScheduledReminder(): Promise<void> {
    try {
      if (!this.tabVisibility.isVisible) {
        logger.info('❌ Scheduled reminder: Tab is hidden, queuing notification');
        this.queueNotification('scheduled');
        return;
      }

      if (!this.isGlobalRateLimitPassed()) {
        logger.info('❌ Scheduled reminder: Blocked by global rate limit');
        return;
      }

      if (!this.isPerTypeRateLimitPassed('scheduled')) {
        logger.info('❌ Scheduled reminder: Blocked by per-type rate limit');
        return;
      }

      if (!this.isNotificationAllowed('scheduled')) {
        logger.info('❌ Scheduled reminder: Blocked by deduplication (within cooldown)');
        return;
      }

      logger.info('⏰ Scheduled reminder: Generating scheduled reminder message...');
      const changes = await this.getChangesSummary();

      const message = `⏰ Scheduled reminder: You have ${changes.count} unsaved changes. Consider pushing to GitHub! ${changes.summary}`;
      logger.info('📢 Scheduled reminder: Showing notification:', message);

      const existingReminders = this.notificationManager.getReminderNotificationCount();
      if (existingReminders > 0) {
        logger.info(
          `🧹 Scheduled reminder: ${existingReminders} existing reminder(s) will be cleared to prevent stacking`
        );
      }

      this.notificationManager.showNotification({
        type: 'info',
        message: message,
        duration: 0,
        actions: [
          {
            text: 'Push to GitHub',
            variant: 'primary',
            action: async () => {
              logger.info('🚀 Scheduled reminder: User clicked "Push to GitHub" button');
              try {
                chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });

                this.resetReminderState();

                logger.info('✅ Scheduled reminder: GitHub push initiated from notification');
              } catch (error) {
                logger.error('❌ Scheduled reminder: Failed to initiate GitHub push:', error);
              }
            },
          },
          {
            text: 'Snooze',
            variant: 'ghost',
            action: () => {
              logger.info('😴 Scheduled reminder: User snoozed reminders');
              this.snoozeReminders();
            },
          },
        ],
      });

      const oldState = { ...this.state };
      this.state.lastScheduledReminderTime = Date.now();
      this.state.scheduledReminderCount++;

      this.recordNotification('scheduled');
      this.updateGlobalRateLimit();

      await this.saveState();

      logger.info('📊 Scheduled reminder: State updated:', {
        oldScheduledCount: oldState.scheduledReminderCount,
        newScheduledCount: this.state.scheduledReminderCount,
        maxScheduled: this.settings.maxScheduledPerSession,
        lastScheduledTime: new Date(this.state.lastScheduledReminderTime).toLocaleTimeString(),
      });

      logger.info(
        `⏰ Scheduled reminder: Successfully shown reminder ${this.state.scheduledReminderCount}/${this.settings.maxScheduledPerSession}`
      );
    } catch (error) {
      logger.error('❌ Scheduled reminder: Failed to show reminder:', error);
    }
  }

  private async hasOngoingOperations(): Promise<boolean> {
    const conflictingOperationTypes: ('push' | 'import' | 'clone' | 'sync' | 'comparison')[] = [
      'push',
      'import',
      'clone',
      'sync',
      'comparison',
    ];

    const hasConflictingOps =
      this.operationStateManager.hasOngoingOperations(conflictingOperationTypes);

    if (hasConflictingOps) {
      const ongoingOps =
        this.operationStateManager.getOngoingOperationsByType(conflictingOperationTypes);
      logger.info(
        '🔍 Push reminder: Found ongoing operations:',
        ongoingOps.map((op) => ({
          type: op.type,
          id: op.id,
          description: op.description,
          durationMs: Date.now() - op.startTime,
        }))
      );
      return true;
    }

    try {
      const uiState = await this.checkUIUploadState();
      if (uiState.isUploading) {
        logger.info('🔍 Push reminder: Found active upload through UI state check');
        return true;
      }
    } catch {
      logger.warn('❌ Push reminder: Failed to check UI upload state');
    }

    return false;
  }

  private async checkUIUploadState(): Promise<{ isUploading: boolean }> {
    try {
      const result = await chrome.storage.local.get(['uploadState']);
      if (result.uploadState && result.uploadState.uploadStatus === 'uploading') {
        return { isUploading: true };
      }
    } catch {
      // Storage access might fail
    }

    return { isUploading: false };
  }

  /**
   * Test operation state functionality (for debugging)
   */
  public testOperationState(): void {
    logger.info('🧪 Testing operation state functionality...');

    // Start a test operation
    const testId = 'test-operation-' + Date.now();
    this.operationStateManager.startOperation('push', testId, 'Test push operation');

    logger.info('✅ Started test operation:', testId);
    logger.info('📊 Current operations:', this.operationStateManager.getDebugInfo());

    // Complete it after 5 seconds
    setTimeout(() => {
      this.operationStateManager.completeOperation(testId);
      logger.info('✅ Completed test operation:', testId);
      logger.info('📊 Operations after completion:', this.operationStateManager.getDebugInfo());
    }, 5000);
  }

  /**
   * Test operation suppression (for debugging)
   */
  public async testOperationSuppression(): Promise<void> {
    logger.info('🧪 Testing operation suppression...');

    // Start a test operation
    const testId = 'test-suppression-' + Date.now();
    this.operationStateManager.startOperation('push', testId, 'Test suppression operation');

    logger.info('✅ Started test operation for suppression test:', testId);

    // Try to check for reminders (should be suppressed)
    const hasOngoing = await this.hasOngoingOperations();
    logger.info('🔍 Has ongoing operations:', hasOngoing);

    if (hasOngoing) {
      logger.info('✅ Operation suppression working correctly!');
    } else {
      logger.info('❌ Operation suppression not working!');
    }

    // Clean up
    this.operationStateManager.completeOperation(testId);
    logger.info('🧹 Cleaned up test operation');
  }

  /**
   * Test comparison operation suppression (for debugging)
   */
  public async testComparisonSuppression(): Promise<void> {
    logger.info('🧪 Testing comparison operation suppression...');

    // Start a test comparison operation
    const testId = 'test-comparison-' + Date.now();
    this.operationStateManager.startOperation('comparison', testId, 'Test comparison operation', {
      repoOwner: 'test',
      repoName: 'test-repo',
      targetBranch: 'main',
    });

    logger.info('✅ Started test comparison operation:', testId);

    // Try to check for reminders (should be suppressed)
    const hasOngoing = await this.hasOngoingOperations();
    logger.info('🔍 Has ongoing operations (should include comparison):', hasOngoing);

    if (hasOngoing) {
      logger.info('✅ Comparison operation suppression working correctly!');
    } else {
      logger.info('❌ Comparison operation suppression not working!');
    }

    // Clean up
    this.operationStateManager.completeOperation(testId);
    logger.info('🧹 Cleaned up test comparison operation');
  }
}
