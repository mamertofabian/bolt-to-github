/* eslint-disable @typescript-eslint/no-explicit-any */
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { ChromeStorageService } from '../../services/chromeStorage';
import { pushStatisticsActions, pushStatisticsStore } from '../pushStatistics';

vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: {
    getPushStatistics: vi.fn(),
    savePushStatistics: vi.fn(),
    clearPushStatistics: vi.fn(),
  },
}));

global.chrome = {
  storage: {
    onChanged: {
      addListener: vi.fn(),
    },
  },
} as any;

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

describe('Push Statistics Store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    vi.clearAllMocks();

    pushStatisticsStore.set({
      statistics: {
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        records: [],
      },
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty statistics', () => {
    const state = get(pushStatisticsStore);
    expect(state.statistics.totalAttempts).toBe(0);
    expect(state.statistics.totalSuccesses).toBe(0);
    expect(state.statistics.totalFailures).toBe(0);
    expect(state.statistics.records).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('should load statistics from storage', async () => {
    const mockStatistics = {
      totalAttempts: 5,
      totalSuccesses: 3,
      totalFailures: 2,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      mockStatistics
    );

    await pushStatisticsActions.loadPushStatistics();

    const state = get(pushStatisticsStore);
    expect(state.statistics).toEqual(mockStatistics);
    expect(state.isLoading).toBe(false);
  });

  it('should record push attempt with deterministic timestamp', async () => {
    const initialStats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushAttempt(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      10,
      'Test commit'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    expect(calls).toHaveLength(1);

    const savedStats = calls[0][0] as any;

    expect(savedStats.totalAttempts).toBe(1);
    expect(savedStats.lastPushTimestamp).toBe(FIXED_TIME);
    expect(savedStats.records).toHaveLength(1);
    expect(savedStats.records[0]).toEqual({
      timestamp: FIXED_TIME,
      success: false,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    });

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalAttempts).toBe(1);
    expect(state.statistics.records[0].timestamp).toBe(FIXED_TIME);
  });

  it('should record push success with deterministic timestamp', async () => {
    const existingRecord = {
      timestamp: FIXED_TIME - 1000,
      success: false,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    };

    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [existingRecord],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushSuccess(
      'test-project',
      'test-owner',
      'test-repo',
      'main'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    expect(calls).toHaveLength(1);

    const savedStats = calls[0][0] as any;

    expect(savedStats.totalSuccesses).toBe(1);
    expect(savedStats.lastSuccessTimestamp).toBe(FIXED_TIME);
    expect(savedStats.records[0].success).toBe(true);
    expect(savedStats.records[0].timestamp).toBe(FIXED_TIME);

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalSuccesses).toBe(1);
    expect(state.statistics.records[0].success).toBe(true);
  });

  it('should get statistics summary with deterministic timestamps', async () => {
    const mockStatistics = {
      totalAttempts: 10,
      totalSuccesses: 8,
      totalFailures: 2,
      lastPushTimestamp: FIXED_TIME,
      lastSuccessTimestamp: FIXED_TIME - 1000,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      mockStatistics
    );

    const summary = await pushStatisticsActions.getStatisticsSummary();

    expect(summary.totalAttempts).toBe(10);
    expect(summary.totalSuccesses).toBe(8);
    expect(summary.totalFailures).toBe(2);
    expect(summary.successRate).toBe(80);
    expect(summary.lastPushDate).toBeInstanceOf(Date);
    expect(summary.lastPushDate?.getTime()).toBe(FIXED_TIME);
    expect(summary.lastSuccessDate).toBeInstanceOf(Date);
    expect(summary.lastSuccessDate?.getTime()).toBe(FIXED_TIME - 1000);
  });

  it('should clear statistics', async () => {
    (ChromeStorageService.clearPushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.clearStatistics();

    expect(ChromeStorageService.clearPushStatistics).toHaveBeenCalled();

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalAttempts).toBe(0);
    expect(state.statistics.totalSuccesses).toBe(0);
    expect(state.statistics.totalFailures).toBe(0);
    expect(state.statistics.records).toEqual([]);
  });

  it('should check if user has push attempts', async () => {
    const emptyStats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(emptyStats);

    const hasNoAttempts = await pushStatisticsActions.hasPushAttempts();
    expect(hasNoAttempts).toBe(false);

    const statsWithAttempts = {
      totalAttempts: 3,
      totalSuccesses: 2,
      totalFailures: 1,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      statsWithAttempts
    );

    const hasAttempts = await pushStatisticsActions.hasPushAttempts();
    expect(hasAttempts).toBe(true);
  });

  it('should record push failure with error message', async () => {
    const existingRecord = {
      timestamp: FIXED_TIME - 1000,
      success: false,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    };

    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [existingRecord],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushFailure(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      'Network error'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    expect(calls).toHaveLength(1);

    const savedStats = calls[0][0] as any;

    expect(savedStats.totalFailures).toBe(1);
    expect(savedStats.records[0].error).toBe('Network error');
    expect(savedStats.records[0].success).toBe(false);

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalFailures).toBe(1);
    expect(state.statistics.records[0].error).toBe('Network error');
  });

  it('should record push failure without error message', async () => {
    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushFailure(
      'test-project',
      'test-owner',
      'test-repo',
      'main'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    expect(calls).toHaveLength(1);

    const savedStats = calls[0][0] as any;

    expect(savedStats.totalFailures).toBe(1);

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalFailures).toBe(1);
  });

  it('should get recent push records with default limit', async () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      timestamp: FIXED_TIME - i * 1000,
      success: i % 2 === 0,
      projectId: `project-${i}`,
      repoOwner: 'owner',
      repoName: 'repo',
      branch: 'main',
      filesCount: 5,
      commitMessage: `Commit ${i}`,
    }));

    const mockStats = {
      totalAttempts: 20,
      totalSuccesses: 10,
      totalFailures: 10,
      records,
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(mockStats);

    const recentRecords = await pushStatisticsActions.getRecentPushRecords();

    expect(recentRecords).toHaveLength(10);
    expect(recentRecords[0].projectId).toBe('project-0');
    expect(recentRecords[9].projectId).toBe('project-9');
  });

  it('should get recent push records with custom limit', async () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      timestamp: FIXED_TIME - i * 1000,
      success: i % 2 === 0,
      projectId: `project-${i}`,
      repoOwner: 'owner',
      repoName: 'repo',
      branch: 'main',
      filesCount: 5,
      commitMessage: `Commit ${i}`,
    }));

    const mockStats = {
      totalAttempts: 20,
      totalSuccesses: 10,
      totalFailures: 10,
      records,
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(mockStats);

    const recentRecords = await pushStatisticsActions.getRecentPushRecords(5);

    expect(recentRecords).toHaveLength(5);
    expect(recentRecords[0].projectId).toBe('project-0');
    expect(recentRecords[4].projectId).toBe('project-4');
  });

  it('should get current state from store', () => {
    const testStats = {
      totalAttempts: 5,
      totalSuccesses: 3,
      totalFailures: 2,
      records: [],
    };

    pushStatisticsStore.set({
      statistics: testStats,
      isLoading: false,
    });

    const currentState = get(pushStatisticsStore);

    expect(currentState.statistics).toEqual(testStats);
    expect(currentState.isLoading).toBe(false);
  });

  it('should initialize and set up storage listener', async () => {
    const mockStats = {
      totalAttempts: 5,
      totalSuccesses: 3,
      totalFailures: 2,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(mockStats);

    await pushStatisticsActions.initialize();

    expect(ChromeStorageService.getPushStatistics).toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();

    const addListenerCalls = (chrome.storage.onChanged.addListener as any).mock.calls;
    expect(addListenerCalls.length).toBeGreaterThan(0);

    const state = get(pushStatisticsStore);
    expect(state.statistics).toEqual(mockStats);
    expect(state.isLoading).toBe(false);
  });

  it('should handle errors when loading statistics', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    await pushStatisticsActions.loadPushStatistics();

    const state = get(pushStatisticsStore);
    expect(state.isLoading).toBe(false);
  });

  it('should handle errors when recording push attempt', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    await pushStatisticsActions.recordPushAttempt(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      10,
      'Test commit'
    );

    expect(ChromeStorageService.savePushStatistics).not.toHaveBeenCalled();
  });

  it('should handle errors when recording push success', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    await pushStatisticsActions.recordPushSuccess(
      'test-project',
      'test-owner',
      'test-repo',
      'main'
    );

    expect(ChromeStorageService.savePushStatistics).not.toHaveBeenCalled();
  });

  it('should handle errors when recording push failure', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    await pushStatisticsActions.recordPushFailure(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      'Network error'
    );

    expect(ChromeStorageService.savePushStatistics).not.toHaveBeenCalled();
  });

  it('should return empty summary on error', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    const summary = await pushStatisticsActions.getStatisticsSummary();

    expect(summary).toEqual({
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      successRate: 0,
    });
  });

  it('should return empty array on error when getting recent records', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    const records = await pushStatisticsActions.getRecentPushRecords();

    expect(records).toEqual([]);
  });

  it('should return false on error when checking push attempts', async () => {
    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockRejectedValue(
      new Error('Storage error')
    );

    const hasAttempts = await pushStatisticsActions.hasPushAttempts();

    expect(hasAttempts).toBe(false);
  });

  it('should limit records to 100 when recording push attempt', async () => {
    const existingRecords = Array.from({ length: 100 }, (_, i) => ({
      timestamp: FIXED_TIME - i * 1000,
      success: true,
      projectId: `project-${i}`,
      repoOwner: 'owner',
      repoName: 'repo',
      branch: 'main',
      filesCount: 5,
      commitMessage: `Commit ${i}`,
    }));

    const initialStats = {
      totalAttempts: 100,
      totalSuccesses: 100,
      totalFailures: 0,
      records: existingRecords,
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushAttempt(
      'new-project',
      'new-owner',
      'new-repo',
      'main',
      10,
      'New commit'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    const savedStats = calls[0][0] as any;

    expect(savedStats.records).toHaveLength(100);
    expect(savedStats.records[0].projectId).toBe('new-project');
    expect(savedStats.records[99].projectId).toBe('project-98');
  });

  it('should calculate success rate correctly with zero attempts', async () => {
    const emptyStats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(emptyStats);

    const summary = await pushStatisticsActions.getStatisticsSummary();

    expect(summary.successRate).toBe(0);
  });

  it('should calculate success rate with decimal precision', async () => {
    const mockStats = {
      totalAttempts: 3,
      totalSuccesses: 2,
      totalFailures: 1,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(mockStats);

    const summary = await pushStatisticsActions.getStatisticsSummary();

    expect(summary.successRate).toBe(66.67);
  });

  it('should not update record if no matching failed attempt found when recording success', async () => {
    const successfulRecord = {
      timestamp: FIXED_TIME - 1000,
      success: true,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    };

    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 1,
      totalFailures: 0,
      records: [successfulRecord],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushSuccess(
      'test-project',
      'test-owner',
      'test-repo',
      'main'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    const savedStats = calls[0][0] as any;

    expect(savedStats.totalSuccesses).toBe(2);
    expect(savedStats.records[0].success).toBe(true);
    expect(savedStats.records[0].timestamp).toBe(FIXED_TIME - 1000);
  });

  it('should not update record if no matching failed attempt found when recording failure', async () => {
    const successfulRecord = {
      timestamp: FIXED_TIME - 1000,
      success: true,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    };

    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 1,
      totalFailures: 0,
      records: [successfulRecord],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushFailure(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      'Some error'
    );

    const calls = (ChromeStorageService.savePushStatistics as MockedFunction<any>).mock.calls;
    const savedStats = calls[0][0] as any;

    expect(savedStats.totalFailures).toBe(1);
    expect(savedStats.records[0].success).toBe(true);
    expect(savedStats.records[0].error).toBeUndefined();
  });
});
