import type { MessageHandler } from '../MessageHandler';
import type { INotificationManager } from '../types/ManagerInterfaces';
import type { FileChange } from '../../services/FilePreviewService';
import { ActivityMonitor } from '../infrastructure/ActivityMonitor';

export interface PushReminderSettings {
  enabled: boolean;
  reminderInterval: number; // minutes
  snoozeInterval: number; // minutes
  minimumChanges: number; // minimum files changed to trigger reminder
  maxRemindersPerSession: number;
}

export interface ReminderState {
  lastReminderTime: number;
  lastSnoozeTime: number;
  reminderCount: number;
  sessionStartTime: number;
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
  private state: ReminderState;

  // Default settings
  private settings: PushReminderSettings = {
    enabled: true,
    reminderInterval: 20, // 20 minutes
    snoozeInterval: 10, // 10 minutes
    minimumChanges: 3, // at least 3 files changed
    maxRemindersPerSession: 5, // max 5 reminders per session
  };

  // Debug mode for testing (shorter intervals)
  private debugMode: boolean = true;

  constructor(messageHandler: MessageHandler, notificationManager: INotificationManager) {
    this.messageHandler = messageHandler;
    this.notificationManager = notificationManager;
    this.activityMonitor = new ActivityMonitor();

    this.state = {
      lastReminderTime: 0,
      lastSnoozeTime: 0,
      reminderCount: 0,
      sessionStartTime: Date.now(),
    };

    console.log('🔧 Push reminder: Service initializing with settings:', this.settings);
    console.log('🔧 Push reminder: Debug mode:', this.debugMode);
    console.log('🔧 Push reminder: Initial state:', this.state);

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
      console.warn('Failed to load push reminder settings:', error);
    }
  }

  /**
   * Save user settings to storage
   */
  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({ pushReminderSettings: this.settings });
    } catch (error) {
      console.warn('Failed to save push reminder settings:', error);
    }
  }

  /**
   * Set up activity monitoring and periodic checks
   */
  private setupActivityMonitoring(): void {
    this.activityMonitor.start();

    // Check every 2 minutes for reminder opportunities (or 10 seconds in debug mode)
    const checkInterval = this.debugMode ? 10 * 1000 : 2 * 60 * 1000;
    console.log(
      `🔧 Push reminder: Setting up monitoring with ${checkInterval / 1000}s check interval (debug: ${this.debugMode})`
    );

    this.checkInterval = setInterval(() => {
      this.checkForReminderOpportunity();
    }, checkInterval);
  }

  /**
   * Main logic to determine if we should show a reminder
   */
  private async checkForReminderOpportunity(): Promise<void> {
    console.log('🔍 Push reminder: Checking for reminder opportunity...');

    if (!this.settings.enabled || !this.isEnabled) {
      console.log(
        '❌ Push reminder: Disabled (settings.enabled:',
        this.settings.enabled,
        ', isEnabled:',
        this.isEnabled,
        ')'
      );
      return;
    }
    console.log('✅ Push reminder: Service is enabled');

    // Check if we've reached max reminders for this session
    if (this.state.reminderCount >= this.settings.maxRemindersPerSession) {
      console.log(
        '❌ Push reminder: Max reminders reached for session (',
        this.state.reminderCount,
        '/',
        this.settings.maxRemindersPerSession,
        ')'
      );
      return;
    }
    console.log(
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
      console.log('❌ Push reminder: In snooze period until', snoozeUntil.toLocaleTimeString());
      return;
    }
    console.log('✅ Push reminder: Not in snooze period');

    // Check if enough time has passed since last reminder
    if (!this.hasReminderIntervalPassed()) {
      const nextReminderTime = new Date(
        this.state.lastReminderTime +
          (this.debugMode ? 30 * 1000 : this.settings.reminderInterval * 60 * 1000)
      );
      console.log(
        '❌ Push reminder: Too soon since last reminder. Next reminder at:',
        nextReminderTime.toLocaleTimeString()
      );
      return;
    }
    console.log('✅ Push reminder: Enough time has passed since last reminder');

    // Check if system is idle (user and Bolt not active)
    const activityInfo = this.activityMonitor.getDebugInfo();
    console.log('🔍 Push reminder: Activity status:', {
      isUserIdle: this.activityMonitor.isUserIdle(),
      isBoltIdle: this.activityMonitor.isBoltIdle(),
      isSystemIdle: this.activityMonitor.isSystemIdle(),
      userIdleFor: Math.floor(this.activityMonitor.getTimeSinceUserActivity() / 1000) + 's',
      boltIdleFor: Math.floor(this.activityMonitor.getTimeSinceBoltActivity() / 1000) + 's',
    });

    if (!this.activityMonitor.isSystemIdle()) {
      console.log('❌ Push reminder: System not idle (user or Bolt still active)');
      return;
    }
    console.log('✅ Push reminder: System is idle');

    // Check if there are enough changes to warrant a reminder
    console.log('🔍 Push reminder: Checking for significant changes...');
    const hasSignificantChanges = await this.hasSignificantChanges();
    if (!hasSignificantChanges) {
      console.log('❌ Push reminder: Not enough significant changes');
      return;
    }
    console.log('✅ Push reminder: Has significant changes');

    // All conditions met - show reminder
    console.log('🎯 Push reminder: ALL CONDITIONS MET - Showing reminder!');
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
      console.log('🔍 Push reminder: Importing FileChangeHandler...');
      // Import FileChangeHandler to check for changes
      const { FileChangeHandler } = await import('../handlers/FileChangeHandler');
      const fileChangeHandler = new FileChangeHandler(
        this.messageHandler,
        this.notificationManager
      );

      console.log('🔍 Push reminder: Getting changed files...');
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

      console.log('📊 Push reminder: Change breakdown:', changeBreakdown);
      console.log(
        `📊 Push reminder: Found ${meaningfulChanges.length} meaningful changes (need ${this.settings.minimumChanges})`
      );

      const hasEnough = meaningfulChanges.length >= this.settings.minimumChanges;
      console.log(`📊 Push reminder: Has enough changes: ${hasEnough}`);

      return hasEnough;
    } catch (error) {
      console.warn('❌ Push reminder: Failed to check for changes:', error);
      return false;
    }
  }

  /**
   * Show the push reminder notification
   */
  private async showPushReminder(): Promise<void> {
    try {
      console.log('🎯 Push reminder: Generating reminder message...');
      const changes = await this.getChangesSummary();

      const message = `💾 You have ${changes.count} unsaved changes. Consider pushing to GitHub! ${changes.summary}`;
      console.log('📢 Push reminder: Showing notification:', message);

      this.notificationManager.showNotification({
        type: 'info',
        message: message,
        duration: 15000, // 15 seconds
      });

      // Update state
      const oldState = { ...this.state };
      this.state.lastReminderTime = Date.now();
      this.state.reminderCount++;

      console.log('📊 Push reminder: State updated:', {
        oldReminderCount: oldState.reminderCount,
        newReminderCount: this.state.reminderCount,
        maxReminders: this.settings.maxRemindersPerSession,
        lastReminderTime: new Date(this.state.lastReminderTime).toLocaleTimeString(),
      });

      console.log(
        `🎉 Push reminder: Successfully shown reminder ${this.state.reminderCount}/${this.settings.maxRemindersPerSession}`
      );
    } catch (error) {
      console.error('❌ Push reminder: Failed to show reminder:', error);
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
    console.log(`🔊 Push reminders snoozed for ${this.settings.snoozeInterval} minutes`);
  }

  /**
   * Enable push reminders
   */
  public enable(): void {
    this.isEnabled = true;
    console.log('🔊 Push reminders enabled');
  }

  /**
   * Disable push reminders
   */
  public disable(): void {
    this.isEnabled = false;
    console.log('🔊 Push reminders disabled');
  }

  /**
   * Update reminder settings
   */
  public async updateSettings(newSettings: Partial<PushReminderSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    console.log('🔊 Push reminder settings updated:', this.settings);
  }

  /**
   * Reset reminder state (useful when user pushes changes)
   */
  public resetReminderState(): void {
    this.state.lastReminderTime = Date.now();
    this.state.reminderCount = 0;
    console.log('🔊 Push reminder state reset');
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
    };
  }

  /**
   * Enable debug mode for faster testing (shorter intervals)
   */
  public enableDebugMode(): void {
    console.log('🔊 Push reminder DEBUG MODE enabled - using shorter intervals for testing');
    this.debugMode = true;

    // Restart monitoring with new intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.setupActivityMonitoring();
  }

  /**
   * Disable debug mode (back to normal intervals)
   */
  public disableDebugMode(): void {
    console.log('🔊 Push reminder debug mode disabled - using normal intervals');
    this.debugMode = false;

    // Restart monitoring with normal intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.setupActivityMonitoring();
  }

  /**
   * Force a reminder check (for testing)
   */
  public async forceReminderCheck(): Promise<void> {
    console.log('🔊 Forcing push reminder check...');
    await this.checkForReminderOpportunity();
  }

  /**
   * Force show a reminder (bypass all checks, for testing)
   */
  public async forceShowReminder(): Promise<void> {
    console.log('🔊 Forcing push reminder display...');
    await this.showPushReminder();
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    console.log('🔊 Cleaning up push reminder service');
    console.trace('🔍 Push reminder cleanup stack trace:');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🔧 Push reminder: Cleared check interval');
    }

    this.activityMonitor.stop();
    console.log('🔧 Push reminder: Stopped activity monitor');
  }
}
