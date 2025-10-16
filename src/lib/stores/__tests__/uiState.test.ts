import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uiStateActions, uiStateStore, type TempRepoMetadata, type UIState } from '../uiState';

describe('uiState Store', () => {
  const defaultState: UIState = {
    activeTab: 'home',
    status: '',
    hasStatus: false,
    showTempRepoModal: false,
    tempRepoData: null,
    hasDeletedTempRepo: false,
    hasUsedTempRepoName: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    uiStateStore.set(defaultState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('store initialization', () => {
    it('should initialize with default state', () => {
      const state = get(uiStateStore);
      expect(state.activeTab).toBe('home');
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
      expect(state.showTempRepoModal).toBe(false);
      expect(state.tempRepoData).toBe(null);
      expect(state.hasDeletedTempRepo).toBe(false);
      expect(state.hasUsedTempRepoName).toBe(false);
    });
  });

  describe('uiStateActions.setActiveTab', () => {
    it('should update active tab', () => {
      uiStateActions.setActiveTab('settings');

      const state = get(uiStateStore);
      expect(state.activeTab).toBe('settings');
    });

    it('should preserve other state when updating active tab', () => {
      uiStateStore.set({
        ...defaultState,
        status: 'Test status',
        hasStatus: true,
      });

      uiStateActions.setActiveTab('logs');

      const state = get(uiStateStore);
      expect(state.activeTab).toBe('logs');
      expect(state.status).toBe('Test status');
      expect(state.hasStatus).toBe(true);
    });

    it('should handle empty string as tab name', () => {
      uiStateActions.setActiveTab('');

      const state = get(uiStateStore);
      expect(state.activeTab).toBe('');
    });

    it('should handle special characters in tab name', () => {
      uiStateActions.setActiveTab('tab-with-dashes_and_underscores');

      const state = get(uiStateStore);
      expect(state.activeTab).toBe('tab-with-dashes_and_underscores');
    });
  });

  describe('uiStateActions.showStatus', () => {
    it('should set status message and hasStatus flag', () => {
      uiStateActions.showStatus('Success!');

      const state = get(uiStateStore);
      expect(state.status).toBe('Success!');
      expect(state.hasStatus).toBe(true);
    });

    it('should auto-clear status after default duration (3000ms)', () => {
      uiStateActions.showStatus('Temporary message');

      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(3000);

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should auto-clear status after custom duration', () => {
      uiStateActions.showStatus('Custom duration', 5000);

      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(4999);
      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(1);

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should handle zero duration', () => {
      uiStateActions.showStatus('Instant clear', 0);

      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(0);

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should handle very long duration', () => {
      uiStateActions.showStatus('Long duration', 60000);

      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(59999);
      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(1);

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should preserve other state when showing status', () => {
      uiStateStore.set({
        ...defaultState,
        activeTab: 'settings',
        showTempRepoModal: true,
      });

      uiStateActions.showStatus('Test');

      const state = get(uiStateStore);
      expect(state.status).toBe('Test');
      expect(state.hasStatus).toBe(true);
      expect(state.activeTab).toBe('settings');
      expect(state.showTempRepoModal).toBe(true);
    });

    it('should handle empty status message', () => {
      uiStateActions.showStatus('');

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(true);
    });

    it('should handle status message with special characters', () => {
      const message = 'Success! 🎉 <script>alert("test")</script>';
      uiStateActions.showStatus(message);

      const state = get(uiStateStore);
      expect(state.status).toBe(message);
      expect(state.hasStatus).toBe(true);
    });

    it('should replace previous status when called multiple times', () => {
      uiStateActions.showStatus('First message', 10000);
      expect(get(uiStateStore).status).toBe('First message');

      uiStateActions.showStatus('Second message', 10000);
      expect(get(uiStateStore).status).toBe('Second message');
    });

    it('should handle overlapping status timeouts', () => {
      uiStateActions.showStatus('First', 2000);

      vi.advanceTimersByTime(1000);

      uiStateActions.showStatus('Second', 2000);

      vi.advanceTimersByTime(999);
      expect(get(uiStateStore).hasStatus).toBe(true);

      vi.advanceTimersByTime(1001);
      expect(get(uiStateStore).status).toBe('');
      expect(get(uiStateStore).hasStatus).toBe(false);
    });
  });

  describe('uiStateActions.clearStatus', () => {
    it('should clear status message and hasStatus flag', () => {
      uiStateStore.set({
        ...defaultState,
        status: 'Some status',
        hasStatus: true,
      });

      uiStateActions.clearStatus();

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should preserve other state when clearing status', () => {
      uiStateStore.set({
        ...defaultState,
        activeTab: 'logs',
        status: 'Some status',
        hasStatus: true,
        showTempRepoModal: true,
      });

      uiStateActions.clearStatus();

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
      expect(state.activeTab).toBe('logs');
      expect(state.showTempRepoModal).toBe(true);
    });

    it('should be idempotent when status already cleared', () => {
      uiStateActions.clearStatus();

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });

    it('should immediately clear status even if timeout is pending', () => {
      uiStateActions.showStatus('Will be cleared', 5000);

      vi.advanceTimersByTime(1000);

      uiStateActions.clearStatus();

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);

      vi.advanceTimersByTime(4000);

      const stateAfterTimeout = get(uiStateStore);
      expect(stateAfterTimeout.status).toBe('');
      expect(stateAfterTimeout.hasStatus).toBe(false);
    });
  });

  describe('uiStateActions.showTempRepoModal', () => {
    const mockTempRepoData: TempRepoMetadata = {
      originalRepo: 'user/original-repo',
      tempRepo: 'user/temp-repo',
      createdAt: 1234567890,
      owner: 'user',
    };

    it('should show temp repo modal with data', () => {
      uiStateActions.showTempRepoModal(mockTempRepoData);

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(mockTempRepoData);
      expect(state.hasDeletedTempRepo).toBe(false);
      expect(state.hasUsedTempRepoName).toBe(false);
    });

    it('should reset delete and use flags when showing modal', () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      });

      uiStateActions.showTempRepoModal(mockTempRepoData);

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(mockTempRepoData);
      expect(state.hasDeletedTempRepo).toBe(false);
      expect(state.hasUsedTempRepoName).toBe(false);
    });

    it('should preserve other state when showing modal', () => {
      uiStateStore.set({
        ...defaultState,
        activeTab: 'settings',
        status: 'Test status',
        hasStatus: true,
      });

      uiStateActions.showTempRepoModal(mockTempRepoData);

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(mockTempRepoData);
      expect(state.activeTab).toBe('settings');
      expect(state.status).toBe('Test status');
      expect(state.hasStatus).toBe(true);
    });

    it('should handle different temp repo data structures', () => {
      const differentData: TempRepoMetadata = {
        originalRepo: 'org/different-repo',
        tempRepo: 'org/temp-different',
        createdAt: 9876543210,
        owner: 'org',
      };

      uiStateActions.showTempRepoModal(differentData);

      const state = get(uiStateStore);
      expect(state.tempRepoData).toEqual(differentData);
    });
  });

  describe('uiStateActions.hideTempRepoModal', () => {
    it('should hide temp repo modal and clear data', () => {
      const mockTempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original-repo',
        tempRepo: 'user/temp-repo',
        createdAt: 1234567890,
        owner: 'user',
      };

      uiStateStore.set({
        ...defaultState,
        showTempRepoModal: true,
        tempRepoData: mockTempRepoData,
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      });

      uiStateActions.hideTempRepoModal();

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(false);
      expect(state.tempRepoData).toBe(null);
      expect(state.hasDeletedTempRepo).toBe(false);
      expect(state.hasUsedTempRepoName).toBe(false);
    });

    it('should preserve other state when hiding modal', () => {
      uiStateStore.set({
        ...defaultState,
        showTempRepoModal: true,
        activeTab: 'settings',
        status: 'Test status',
        hasStatus: true,
      });

      uiStateActions.hideTempRepoModal();

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(false);
      expect(state.tempRepoData).toBe(null);
      expect(state.activeTab).toBe('settings');
      expect(state.status).toBe('Test status');
      expect(state.hasStatus).toBe(true);
    });

    it('should be idempotent when modal already hidden', () => {
      uiStateActions.hideTempRepoModal();

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(false);
      expect(state.tempRepoData).toBe(null);
      expect(state.hasDeletedTempRepo).toBe(false);
      expect(state.hasUsedTempRepoName).toBe(false);
    });
  });

  describe('uiStateActions.markTempRepoDeleted', () => {
    it('should mark temp repo as deleted', () => {
      uiStateActions.markTempRepoDeleted();

      const state = get(uiStateStore);
      expect(state.hasDeletedTempRepo).toBe(true);
    });

    it('should preserve other state when marking deleted', () => {
      const mockTempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original-repo',
        tempRepo: 'user/temp-repo',
        createdAt: 1234567890,
        owner: 'user',
      };

      uiStateStore.set({
        ...defaultState,
        showTempRepoModal: true,
        tempRepoData: mockTempRepoData,
        hasUsedTempRepoName: false,
      });

      uiStateActions.markTempRepoDeleted();

      const state = get(uiStateStore);
      expect(state.hasDeletedTempRepo).toBe(true);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(mockTempRepoData);
      expect(state.hasUsedTempRepoName).toBe(false);
    });

    it('should be idempotent when already marked as deleted', () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: true,
      });

      uiStateActions.markTempRepoDeleted();

      const state = get(uiStateStore);
      expect(state.hasDeletedTempRepo).toBe(true);
    });
  });

  describe('uiStateActions.markTempRepoNameUsed', () => {
    it('should mark temp repo name as used', () => {
      uiStateActions.markTempRepoNameUsed();

      const state = get(uiStateStore);
      expect(state.hasUsedTempRepoName).toBe(true);
    });

    it('should preserve other state when marking name used', () => {
      const mockTempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original-repo',
        tempRepo: 'user/temp-repo',
        createdAt: 1234567890,
        owner: 'user',
      };

      uiStateStore.set({
        ...defaultState,
        showTempRepoModal: true,
        tempRepoData: mockTempRepoData,
        hasDeletedTempRepo: false,
      });

      uiStateActions.markTempRepoNameUsed();

      const state = get(uiStateStore);
      expect(state.hasUsedTempRepoName).toBe(true);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(mockTempRepoData);
      expect(state.hasDeletedTempRepo).toBe(false);
    });

    it('should be idempotent when already marked as used', () => {
      uiStateStore.set({
        ...defaultState,
        hasUsedTempRepoName: true,
      });

      uiStateActions.markTempRepoNameUsed();

      const state = get(uiStateStore);
      expect(state.hasUsedTempRepoName).toBe(true);
    });
  });

  describe('uiStateActions.canCloseTempRepoModal', () => {
    it('should resolve true when both flags are true', async () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      });

      const canClose = await uiStateActions.canCloseTempRepoModal();

      expect(canClose).toBe(true);
    });

    it('should resolve false when hasDeletedTempRepo is false', async () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: false,
        hasUsedTempRepoName: true,
      });

      const canClose = await uiStateActions.canCloseTempRepoModal();

      expect(canClose).toBe(false);
    });

    it('should resolve false when hasUsedTempRepoName is false', async () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: false,
      });

      const canClose = await uiStateActions.canCloseTempRepoModal();

      expect(canClose).toBe(false);
    });

    it('should resolve false when both flags are false', async () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: false,
        hasUsedTempRepoName: false,
      });

      const canClose = await uiStateActions.canCloseTempRepoModal();

      expect(canClose).toBe(false);
    });

    it('should read current state without affecting store subscription', async () => {
      uiStateStore.set({
        ...defaultState,
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      });

      await uiStateActions.canCloseTempRepoModal();

      const state = get(uiStateStore);
      expect(state.hasDeletedTempRepo).toBe(true);
      expect(state.hasUsedTempRepoName).toBe(true);
    });
  });

  describe('uiStateActions.getCurrentState', () => {
    it('should return current state', async () => {
      const expectedState: UIState = {
        activeTab: 'settings',
        status: 'Test status',
        hasStatus: true,
        showTempRepoModal: true,
        tempRepoData: {
          originalRepo: 'user/original',
          tempRepo: 'user/temp',
          createdAt: 123456,
          owner: 'user',
        },
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      };

      uiStateStore.set(expectedState);

      const state = await uiStateActions.getCurrentState();

      expect(state).toEqual(expectedState);
    });

    it('should return default state when store is reset', async () => {
      const state = await uiStateActions.getCurrentState();

      expect(state).toEqual(defaultState);
    });

    it('should not affect store subscription', async () => {
      uiStateStore.set({
        ...defaultState,
        activeTab: 'logs',
      });

      await uiStateActions.getCurrentState();

      const state = get(uiStateStore);
      expect(state.activeTab).toBe('logs');
    });

    it('should return state with temp repo data', async () => {
      const tempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original',
        tempRepo: 'user/temp',
        createdAt: 123456,
        owner: 'user',
      };

      uiStateStore.set({
        ...defaultState,
        tempRepoData,
      });

      const state = await uiStateActions.getCurrentState();

      expect(state.tempRepoData).toEqual(tempRepoData);
    });
  });

  describe('uiStateActions.reset', () => {
    it('should reset state to initial values', () => {
      uiStateStore.set({
        activeTab: 'settings',
        status: 'Test status',
        hasStatus: true,
        showTempRepoModal: true,
        tempRepoData: {
          originalRepo: 'user/original',
          tempRepo: 'user/temp',
          createdAt: 123456,
          owner: 'user',
        },
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      });

      uiStateActions.reset();

      const state = get(uiStateStore);
      expect(state).toEqual(defaultState);
    });

    it('should be idempotent when already at default state', () => {
      uiStateActions.reset();

      const state = get(uiStateStore);
      expect(state).toEqual(defaultState);
    });

    it('should clear any pending status timeouts', () => {
      uiStateActions.showStatus('Will be reset', 5000);

      uiStateActions.reset();

      vi.advanceTimersByTime(5000);

      const state = get(uiStateStore);
      expect(state.status).toBe('');
      expect(state.hasStatus).toBe(false);
    });
  });

  describe('store integration scenarios', () => {
    it('should handle complete temp repo modal workflow', async () => {
      const tempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original-repo',
        tempRepo: 'user/temp-repo',
        createdAt: Date.now(),
        owner: 'user',
      };

      uiStateActions.showTempRepoModal(tempRepoData);

      let canClose = await uiStateActions.canCloseTempRepoModal();
      expect(canClose).toBe(false);

      uiStateActions.markTempRepoDeleted();

      canClose = await uiStateActions.canCloseTempRepoModal();
      expect(canClose).toBe(false);

      uiStateActions.markTempRepoNameUsed();

      canClose = await uiStateActions.canCloseTempRepoModal();
      expect(canClose).toBe(true);

      uiStateActions.hideTempRepoModal();

      const state = get(uiStateStore);
      expect(state.showTempRepoModal).toBe(false);
      expect(state.tempRepoData).toBe(null);
    });

    it('should handle status messages during temp repo workflow', () => {
      const tempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original',
        tempRepo: 'user/temp',
        createdAt: Date.now(),
        owner: 'user',
      };

      uiStateActions.showTempRepoModal(tempRepoData);
      uiStateActions.showStatus('Deleting temp repo...', 3000);

      const stateAfterShow = get(uiStateStore);
      expect(stateAfterShow.showTempRepoModal).toBe(true);
      expect(stateAfterShow.status).toBe('Deleting temp repo...');

      uiStateActions.markTempRepoDeleted();

      vi.advanceTimersByTime(3000);

      const stateAfterClear = get(uiStateStore);
      expect(stateAfterClear.hasDeletedTempRepo).toBe(true);
      expect(stateAfterClear.status).toBe('');
      expect(stateAfterClear.hasStatus).toBe(false);
    });

    it('should handle rapid tab switching', () => {
      uiStateActions.setActiveTab('home');
      expect(get(uiStateStore).activeTab).toBe('home');

      uiStateActions.setActiveTab('settings');
      expect(get(uiStateStore).activeTab).toBe('settings');

      uiStateActions.setActiveTab('logs');
      expect(get(uiStateStore).activeTab).toBe('logs');

      uiStateActions.setActiveTab('home');
      expect(get(uiStateStore).activeTab).toBe('home');
    });

    it('should maintain state consistency across multiple operations', async () => {
      uiStateActions.setActiveTab('settings');
      uiStateActions.showStatus('Settings loaded', 3000);

      const tempRepoData: TempRepoMetadata = {
        originalRepo: 'user/original',
        tempRepo: 'user/temp',
        createdAt: Date.now(),
        owner: 'user',
      };

      uiStateActions.showTempRepoModal(tempRepoData);

      const state = await uiStateActions.getCurrentState();

      expect(state.activeTab).toBe('settings');
      expect(state.status).toBe('Settings loaded');
      expect(state.hasStatus).toBe(true);
      expect(state.showTempRepoModal).toBe(true);
      expect(state.tempRepoData).toEqual(tempRepoData);
    });
  });
});
