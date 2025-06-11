import { writable, type Writable } from 'svelte/store';
import type { PushStatistics, PushStatisticsState, PushRecord } from '../types';
import { ChromeStorageService } from '../services/chromeStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('PushStatisticsStore');

// Initial state
const initialState: PushStatisticsState = {
  statistics: {
    totalAttempts: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    records: [],
  },
  isLoading: false,
};

// Create the writable store
export const pushStatisticsStore: Writable<PushStatisticsState> = writable(initialState);

// Store actions
export const pushStatisticsActions = {
  /**
   * Load push statistics from Chrome storage
   */
  async loadPushStatistics(): Promise<void> {
    pushStatisticsStore.update((state) => ({
      ...state,
      isLoading: true,
    }));

    try {
      const statistics = await ChromeStorageService.getPushStatistics();
      pushStatisticsStore.update((state) => ({
        ...state,
        statistics,
        isLoading: false,
      }));
      logger.info('📊 Loaded push statistics:', statistics);
    } catch (error) {
      logger.error('Failed to load push statistics:', error);
      pushStatisticsStore.update((state) => ({
        ...state,
        isLoading: false,
      }));
    }
  },

  /**
   * Record a push attempt
   */
  async recordPushAttempt(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string,
    filesCount: number,
    commitMessage: string
  ): Promise<void> {
    try {
      const currentStats = await ChromeStorageService.getPushStatistics();
      const timestamp = Date.now();

      const newRecord: PushRecord = {
        timestamp,
        success: false, // Will be updated later
        projectId,
        repoOwner,
        repoName,
        branch,
        filesCount,
        commitMessage,
      };

      const updatedStats: PushStatistics = {
        ...currentStats,
        totalAttempts: currentStats.totalAttempts + 1,
        lastPushTimestamp: timestamp,
        records: [newRecord, ...currentStats.records].slice(0, 100), // Keep last 100 records
      };

      await ChromeStorageService.savePushStatistics(updatedStats);

      pushStatisticsStore.update((state) => ({
        ...state,
        statistics: updatedStats,
      }));

      logger.info('📊 Recorded push attempt:', newRecord);
    } catch (error) {
      logger.error('Failed to record push attempt:', error);
    }
  },

  /**
   * Record a push success
   */
  async recordPushSuccess(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string
  ): Promise<void> {
    try {
      const currentStats = await ChromeStorageService.getPushStatistics();
      const timestamp = Date.now();

      // Find the most recent attempt record for this project/repo
      const recordIndex = currentStats.records.findIndex(
        (record) =>
          record.projectId === projectId &&
          record.repoOwner === repoOwner &&
          record.repoName === repoName &&
          record.branch === branch &&
          !record.success
      );

      if (recordIndex >= 0) {
        // Update the existing record to mark it as successful
        currentStats.records[recordIndex] = {
          ...currentStats.records[recordIndex],
          success: true,
          timestamp, // Update timestamp to success time
        };
      }

      const updatedStats: PushStatistics = {
        ...currentStats,
        totalSuccesses: currentStats.totalSuccesses + 1,
        lastSuccessTimestamp: timestamp,
        records: [...currentStats.records],
      };

      await ChromeStorageService.savePushStatistics(updatedStats);

      pushStatisticsStore.update((state) => ({
        ...state,
        statistics: updatedStats,
      }));

      logger.info('📊 Recorded push success for:', { projectId, repoOwner, repoName, branch });
    } catch (error) {
      logger.error('Failed to record push success:', error);
    }
  },

  /**
   * Record a push failure
   */
  async recordPushFailure(
    projectId: string,
    repoOwner: string,
    repoName: string,
    branch: string,
    error?: string
  ): Promise<void> {
    try {
      const currentStats = await ChromeStorageService.getPushStatistics();

      // Find the most recent attempt record for this project/repo
      const recordIndex = currentStats.records.findIndex(
        (record) =>
          record.projectId === projectId &&
          record.repoOwner === repoOwner &&
          record.repoName === repoName &&
          record.branch === branch &&
          !record.success
      );

      if (recordIndex >= 0 && error) {
        // Update the existing record to include the error
        currentStats.records[recordIndex] = {
          ...currentStats.records[recordIndex],
          error,
        };
      }

      const updatedStats: PushStatistics = {
        ...currentStats,
        totalFailures: currentStats.totalFailures + 1,
        records: [...currentStats.records],
      };

      await ChromeStorageService.savePushStatistics(updatedStats);

      pushStatisticsStore.update((state) => ({
        ...state,
        statistics: updatedStats,
      }));

      logger.info('📊 Recorded push failure for:', {
        projectId,
        repoOwner,
        repoName,
        branch,
        error,
      });
    } catch (error) {
      logger.error('Failed to record push failure:', error);
    }
  },

  /**
   * Get push statistics summary
   */
  async getStatisticsSummary(): Promise<{
    totalAttempts: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
    lastPushDate?: Date;
    lastSuccessDate?: Date;
  }> {
    try {
      const statistics = await ChromeStorageService.getPushStatistics();
      const successRate =
        statistics.totalAttempts > 0
          ? (statistics.totalSuccesses / statistics.totalAttempts) * 100
          : 0;

      return {
        totalAttempts: statistics.totalAttempts,
        totalSuccesses: statistics.totalSuccesses,
        totalFailures: statistics.totalFailures,
        successRate: Math.round(successRate * 100) / 100,
        lastPushDate: statistics.lastPushTimestamp
          ? new Date(statistics.lastPushTimestamp)
          : undefined,
        lastSuccessDate: statistics.lastSuccessTimestamp
          ? new Date(statistics.lastSuccessTimestamp)
          : undefined,
      };
    } catch (error) {
      logger.error('Failed to get statistics summary:', error);
      return {
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        successRate: 0,
      };
    }
  },

  /**
   * Get recent push records (last N records)
   */
  async getRecentPushRecords(limit = 10): Promise<PushRecord[]> {
    try {
      const statistics = await ChromeStorageService.getPushStatistics();
      return statistics.records.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get recent push records:', error);
      return [];
    }
  },

  /**
   * Clear all push statistics
   */
  async clearStatistics(): Promise<void> {
    try {
      await ChromeStorageService.clearPushStatistics();
      pushStatisticsStore.set(initialState);
      logger.info('📊 Cleared push statistics');
    } catch (error) {
      logger.error('Failed to clear push statistics:', error);
    }
  },

  /**
   * Get current state
   */
  async getCurrentState(): Promise<PushStatisticsState> {
    return new Promise((resolve) => {
      const unsubscribe = pushStatisticsStore.subscribe((state) => {
        unsubscribe();
        resolve(state);
      });
    });
  },

  /**
   * Initialize push statistics (load from storage)
   */
  async initialize(): Promise<void> {
    await this.loadPushStatistics();

    // Set up listener for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pushStatistics) {
        const newStatistics = changes.pushStatistics.newValue;
        if (newStatistics) {
          pushStatisticsStore.update((state) => ({
            ...state,
            statistics: newStatistics,
          }));
          logger.info('📊 Push statistics updated from storage:', newStatistics);
        }
      }
    });
  },

  /**
   * Check if the user has made any push attempts
   */
  async hasPushAttempts(): Promise<boolean> {
    try {
      const statistics = await ChromeStorageService.getPushStatistics();
      return statistics.totalAttempts > 0;
    } catch (error) {
      logger.error('Failed to check push attempts:', error);
      return false;
    }
  },
};
