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
  // New scheduled reminder settings
  scheduledEnabled: boolean; // separate enable/disable for scheduled reminders
  scheduledInterval: number; // minutes - fixed interval regardless of activity
  maxScheduledPerSession: number; // max scheduled reminders per session
}

export interface ReminderState {
  lastReminderTime: number;
  lastSnoozeTime: number;
  reminderCount: number;
  sessionStartTime: number;
  // New scheduled reminder state
  lastScheduledReminderTime: number;
  scheduledReminderCount: number;
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
  private checkInterval: NodeJS.Timeout | null = null;
  // New scheduled reminder interval
  private scheduledInterval: NodeJS.Timeout | null = null;
  private state: ReminderState;
  private premiumService: PremiumService | null = null;
  private operationStateManager: OperationStateManager;

  // Default settings
  private settings: PushReminderSettings = {
    enabled: true,
    reminderInterval: 20, // 20 minutes
    snoozeInterval: 10, // 10 minutes
    minimumChanges: 3, // at least 3 files changed
    maxRemindersPerSession: 5, // max 5 reminders per session
    scheduledEnabled: true,
    scheduledInterval: 15, // 15 minutes for scheduled reminders
    maxScheduledPerSession: 10, // max 10 scheduled reminders per session
  };

  // Debug mode for testing (shorter intervals)
  private debugMode: boolean = false;

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

    this.loadSettings();
    this.setupActivityMonitoring();
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

  /**
   * Set up activity monitoring and periodic checks
   */
  private setupActivityMonitoring(): void {
    this.activityMonitor.start();

    // Check every 2 minutes for reminder opportunities (or 10 seconds in debug mode)
    const checkInterval = this.debugMode ? 10 * 1000 : 2 * 60 * 1000;
    logger.info(
      `🔧 Push reminder: Setting up monitoring with ${checkInterval / 1000}s check interval (debug: ${this.debugMode})`
    );

    this.checkInterval = setInterval(() => {
      this.checkForReminderOpportunity();
    }, checkInterval);

    // Set up scheduled reminders (independent of activity)
    this.setupScheduledReminders();
  }

  /**
   * Main logic to determine if we should show a reminder
   */
  private async checkForReminderOpportunity(): Promise<void> {
    logger.info('🔍 Push reminder: Checking for reminder opportunity...');

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
    const activityInfo = this.activityMonitor.getDebugInfo();
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

  /**
   * Check if we're currently in a snooze interval
   */
  private isInSnoozeInterval(): boolean {
    if (this.state.lastSnoozeTime === 0) return false;

    const snoozeUntil = this.state.lastSnoozeTime + this.settings.snoozeInterval * 60 * 1000;
    return Date.now() < snoozeUntil;
  }

  /**
   * Check if enough time has passed since the last reminder
   */
  private hasReminderIntervalPassed(): boolean {
    if (this.state.lastReminderTime === 0) return true;

    // Use debug intervals for testing: 30 seconds instead of configured minutes
    const intervalMs = this.debugMode
      ? 30 * 1000 // 30 seconds in debug mode
      : this.settings.reminderInterval * 60 * 1000;
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

  /**
   * Show the push reminder notification
   */
  private async showPushReminder(): Promise<void> {
    try {
      logger.info('🎯 Push reminder: Generating reminder message...');
      const changes = await this.getChangesSummary();

      const message = `💾 You have ${changes.count} unsaved changes. Consider pushing to GitHub! ${changes.summary}`;
      logger.info('📢 Push reminder: Showing notification:', message);

      // Log existing reminder count before showing new one
      const existingReminders = this.notificationManager.getReminderNotificationCount();
      if (existingReminders > 0) {
        logger.info(
          `🧹 Push reminder: ${existingReminders} existing reminder(s) will be cleared to prevent stacking`
        );
      }

      this.notificationManager.showNotification({
        type: 'info',
        message: message,
        duration: 0, // Make reminder persistent - user must take action or close manually
        actions: [
          {
            text: 'Push to GitHub',
            variant: 'primary',
            action: async () => {
              logger.info('🚀 Push reminder: User clicked "Push to GitHub" button');
              try {
                // Send message to runtime to trigger GitHub push
                chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });

                // Reset reminder state since user is taking action
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

      // Update state
      const oldState = { ...this.state };
      this.state.lastReminderTime = Date.now();
      this.state.reminderCount++;

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
    } catch (error) {
      return { count: 0, summary: '' };
    }
  }

  /**
   * Snooze reminders for the configured interval
   */
  public snoozeReminders(): void {
    this.state.lastSnoozeTime = Date.now();
    logger.info(`🔊 Push reminders snoozed for ${this.settings.snoozeInterval} minutes`);
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

  /**
   * Update reminder settings
   */
  public async updateSettings(newSettings: Partial<PushReminderSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    logger.info('🔊 Push reminder settings updated:', this.settings);

    // Restart scheduled reminders if settings changed
    if (newSettings.scheduledEnabled !== undefined || newSettings.scheduledInterval !== undefined) {
      this.setupScheduledReminders();
    }
  }

  /**
   * Reset reminder state (useful when user pushes changes)
   */
  public resetReminderState(): void {
    this.state.lastReminderTime = Date.now();
    this.state.reminderCount = 0;
    // Also reset scheduled reminder count when user pushes
    this.state.scheduledReminderCount = 0;
    this.state.lastScheduledReminderTime = Date.now();
    logger.info('🔊 Push reminder state reset (both idle and scheduled)');
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

  /**
   * Get debug information
   */
  public getDebugInfo(): object {
    return {
      settings: this.settings,
      state: this.state,
      isEnabled: this.isEnabled,
      debugMode: this.debugMode,
      isInSnooze: this.isInSnoozeInterval(),
      hasIntervalPassed: this.hasReminderIntervalPassed(),
      activityMonitor: this.activityMonitor.getDebugInfo(),
      operationState: this.operationStateManager.getDebugInfo(),
    };
  }

  /**
   * Enable debug mode for faster testing (shorter intervals)
   */
  public enableDebugMode(): void {
    logger.info('🔊 Push reminder DEBUG MODE enabled - using shorter intervals for testing');
    this.debugMode = true;

    // Restart monitoring with new intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
    }
    this.setupActivityMonitoring();
  }

  /**
   * Disable debug mode (back to normal intervals)
   */
  public disableDebugMode(): void {
    logger.info('🔊 Push reminder debug mode disabled - using normal intervals');
    this.debugMode = false;

    // Restart monitoring with normal intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
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

  /**
   * Clean up resources
   */
  public cleanup(): void {
    logger.info('🔊 Cleaning up push reminder service');
    logger.info('🔍 Push reminder cleanup stack trace:');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('🔧 Push reminder: Cleared check interval');
    }

    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
      logger.info('🔧 Push reminder: Cleared scheduled interval');
    }

    this.activityMonitor.stop();
    logger.info('🔧 Push reminder: Stopped activity monitor');
  }

  /**
   * Set up scheduled reminders that run on fixed intervals regardless of activity
   */
  private setupScheduledReminders(): void {
    if (!this.settings.scheduledEnabled) {
      logger.info('🔧 Push reminder: Scheduled reminders disabled');
      return;
    }

    // Clear any existing scheduled interval
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
    }

    // Set up scheduled reminder interval (or shorter interval in debug mode)
    const scheduledInterval = this.debugMode
      ? 60 * 1000 // 1 minute in debug mode
      : this.settings.scheduledInterval * 60 * 1000;

    logger.info(
      `🔧 Push reminder: Setting up scheduled reminders with ${scheduledInterval / 1000}s interval (debug: ${this.debugMode})`
    );

    this.scheduledInterval = setInterval(() => {
      this.checkForScheduledReminder();
    }, scheduledInterval);
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

  /**
   * Show a scheduled push reminder notification
   */
  private async showScheduledReminder(): Promise<void> {
    try {
      logger.info('⏰ Scheduled reminder: Generating scheduled reminder message...');
      const changes = await this.getChangesSummary();

      const message = `⏰ Scheduled reminder: You have ${changes.count} unsaved changes. Consider pushing to GitHub! ${changes.summary}`;
      logger.info('📢 Scheduled reminder: Showing notification:', message);

      // Log existing reminder count before showing new one
      const existingReminders = this.notificationManager.getReminderNotificationCount();
      if (existingReminders > 0) {
        logger.info(
          `🧹 Scheduled reminder: ${existingReminders} existing reminder(s) will be cleared to prevent stacking`
        );
      }

      this.notificationManager.showNotification({
        type: 'info',
        message: message,
        duration: 0, // Make reminder persistent - user must take action or close manually
        actions: [
          {
            text: 'Push to GitHub',
            variant: 'primary',
            action: async () => {
              logger.info('🚀 Scheduled reminder: User clicked "Push to GitHub" button');
              try {
                // Send message to runtime to trigger GitHub push
                chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });

                // Reset reminder state since user is taking action
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

      // Update scheduled reminder state
      const oldState = { ...this.state };
      this.state.lastScheduledReminderTime = Date.now();
      this.state.scheduledReminderCount++;

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

  /**
   * Check for ongoing operations that should suppress reminders
   */
  private async hasOngoingOperations(): Promise<boolean> {
    // Check for push operations, import operations, comparison operations, and other conflicting operations
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

    // Additional checks for upload status through UIStateManager if available
    try {
      // Check if there's an active upload by looking at UI state
      // This covers cases where operations might not be tracked by OperationStateManager
      const uiState = await this.checkUIUploadState();
      if (uiState.isUploading) {
        logger.info('🔍 Push reminder: Found active upload through UI state check');
        return true;
      }
    } catch (error) {
      logger.warn('❌ Push reminder: Failed to check UI upload state:', error);
    }

    return false;
  }

  /**
   * Check UI upload state to detect ongoing uploads
   */
  private async checkUIUploadState(): Promise<{ isUploading: boolean }> {
    try {
      // Try to access upload state from storage or UI state
      const result = await chrome.storage.local.get(['uploadState']);
      if (result.uploadState && result.uploadState.uploadStatus === 'uploading') {
        return { isUploading: true };
      }
    } catch (error) {
      // Storage access might fail, continue to other checks
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
