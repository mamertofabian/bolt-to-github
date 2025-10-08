import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadStatusState } from '../../../lib/types';
import { UIStateManager } from '../UIStateManager';

describe('UIStateManager', () => {
  let stateManager: UIStateManager;

  beforeEach(() => {
    stateManager = new UIStateManager();
  });

  afterEach(() => {
    stateManager.cleanup();
  });

  describe('Upload Status Management', () => {
    it('sets and gets upload status', () => {
      const status: UploadStatusState = {
        status: 'uploading',
        progress: 75,
        message: 'Uploading files...',
      };

      stateManager.setUploadStatus(status);

      const retrievedStatus = stateManager.getUploadStatus();
      expect(retrievedStatus).toEqual(status);
      expect(retrievedStatus.status).toBe('uploading');
      expect(retrievedStatus.progress).toBe(75);
      expect(retrievedStatus.message).toBe('Uploading files...');
    });

    it('triggers listeners on status change', () => {
      const listener = vi.fn();
      stateManager.addListener(listener);

      const status: UploadStatusState = {
        status: 'success',
        progress: 100,
        message: 'Upload complete',
      };
      stateManager.setUploadStatus(status);

      expect(listener).toHaveBeenCalledTimes(1);

      const [newState, previousState] = listener.mock.calls[0];
      expect(newState.uploadStatus).toEqual(status);
      expect(previousState.uploadStatus.status).toBe('idle');
    });

    it('updates button processing state based on upload status', () => {
      stateManager.setUploadStatus({ status: 'uploading', progress: 50, message: 'Uploading...' });

      let buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(true);

      stateManager.setUploadStatus({ status: 'success', progress: 100, message: 'Complete' });

      buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(false);
    });

    it('handles error states correctly', () => {
      stateManager.setUploadStatus({ status: 'error', progress: 0, message: 'Upload failed' });

      const buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(false);

      const uploadStatus = stateManager.getUploadStatus();
      expect(uploadStatus.status).toBe('error');
      expect(uploadStatus.message).toBe('Upload failed');
    });
  });

  describe('Button State Management', () => {
    it('sets and gets button state', () => {
      expect(stateManager.getButtonState().isValid).toBe(false);

      stateManager.setButtonState(true);
      expect(stateManager.getButtonState().isValid).toBe(true);

      stateManager.setButtonState(false);
      expect(stateManager.getButtonState().isValid).toBe(false);
    });

    it('manages button processing states', () => {
      stateManager.setButtonProcessing(true);
      expect(stateManager.getButtonState().isProcessing).toBe(true);

      stateManager.setButtonProcessing(false);
      expect(stateManager.getButtonState().isProcessing).toBe(false);
    });

    it('handles specialized loading states', () => {
      stateManager.setButtonDetectingChanges();
      let buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(true);
      expect(buttonState.loadingState).toBe('detecting-changes');

      stateManager.setButtonPushing();
      buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(true);
      expect(buttonState.loadingState).toBe('pushing');

      stateManager.setButtonLoadingState('Custom loading...');
      buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(true);
      expect(buttonState.loadingState).toBe('custom');
      expect(buttonState.loadingText).toBe('Custom loading...');

      stateManager.resetButtonLoadingState();
      buttonState = stateManager.getButtonState();
      expect(buttonState.isProcessing).toBe(false);
      expect(buttonState.loadingState).toBeUndefined();
      expect(buttonState.loadingText).toBeUndefined();
    });

    it('tracks initialization state', () => {
      expect(stateManager.getButtonState().isInitialized).toBe(false);

      stateManager.setButtonInitialized(true);
      expect(stateManager.getButtonState().isInitialized).toBe(true);

      stateManager.setButtonInitialized(false);
      expect(stateManager.getButtonState().isInitialized).toBe(false);
    });
  });

  describe('Notification Management', () => {
    it('tracks notification count and types', () => {
      expect(stateManager.getNotificationState().active).toBe(0);

      stateManager.addNotification('success');
      let notificationState = stateManager.getNotificationState();
      expect(notificationState.active).toBe(1);
      expect(notificationState.lastType).toBe('success');

      stateManager.addNotification('error');
      notificationState = stateManager.getNotificationState();
      expect(notificationState.active).toBe(2);
      expect(notificationState.lastType).toBe('error');

      stateManager.removeNotification();
      expect(stateManager.getNotificationState().active).toBe(1);
    });

    it('prevents negative notification count', () => {
      stateManager.removeNotification();
      stateManager.removeNotification();

      expect(stateManager.getNotificationState().active).toBe(0);
    });
  });

  describe('Dropdown State Management', () => {
    it('manages dropdown visibility', () => {
      expect(stateManager.getDropdownState().isVisible).toBe(false);

      stateManager.setDropdownVisible(true);
      expect(stateManager.getDropdownState().isVisible).toBe(true);

      stateManager.setDropdownVisible(false);
      expect(stateManager.getDropdownState().isVisible).toBe(false);
    });

    it('manages dropdown position', () => {
      const position = { top: 100, left: 200 };

      stateManager.setDropdownVisible(true, position);
      let dropdownState = stateManager.getDropdownState();
      expect(dropdownState.isVisible).toBe(true);
      expect(dropdownState.position).toEqual(position);

      stateManager.setDropdownVisible(false);
      dropdownState = stateManager.getDropdownState();
      expect(dropdownState.isVisible).toBe(false);
      expect(dropdownState.position).toBeUndefined();
    });
  });

  describe('Component Initialization Tracking', () => {
    it('tracks component initialization state', () => {
      expect(stateManager.getComponentState().uploadStatusInitialized).toBe(false);

      stateManager.setComponentInitialized('uploadStatusInitialized', true);
      expect(stateManager.getComponentState().uploadStatusInitialized).toBe(true);

      stateManager.setComponentInitialized('uploadStatusInitialized', false);
      expect(stateManager.getComponentState().uploadStatusInitialized).toBe(false);
    });

    it('tracks multiple components independently', () => {
      stateManager.setComponentInitialized('uploadStatusInitialized', true);
      stateManager.setComponentInitialized('buttonInitialized', false);
      stateManager.setComponentInitialized('notificationInitialized', true);

      const componentState = stateManager.getComponentState();
      expect(componentState.uploadStatusInitialized).toBe(true);
      expect(componentState.buttonInitialized).toBe(false);
      expect(componentState.notificationInitialized).toBe(true);
    });
  });

  describe('State Listeners', () => {
    it('adds and removes listeners correctly', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      stateManager.addListener(listener1);
      stateManager.addListener(listener2);

      stateManager.setButtonState(true);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      stateManager.removeListener(listener1);
      listener1.mockClear();
      listener2.mockClear();

      stateManager.setButtonState(false);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('provides state snapshots to listeners', () => {
      const listener = vi.fn();
      stateManager.addListener(listener);

      const uploadStatus: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Test',
      };
      stateManager.setUploadStatus(uploadStatus);

      expect(listener).toHaveBeenCalledTimes(1);

      const [newState, previousState] = listener.mock.calls[0];
      expect(newState.uploadStatus).toEqual(uploadStatus);
      expect(previousState.uploadStatus.status).toBe('idle');

      expect(newState).not.toBe(previousState);
    });

    it('handles notification depth limit to prevent infinite loops', () => {
      const listener = vi.fn();
      stateManager.addListener(listener);

      stateManager.setButtonState(true);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Validation', () => {
    it('validates state correctly', () => {
      expect(stateManager.isValidState()).toBe(true);

      stateManager.setButtonState(true);
      stateManager.setUploadStatus({ status: 'uploading', progress: 50, message: 'Test' });

      expect(stateManager.isValidState()).toBe(true);
    });

    it('provides state summary', () => {
      const summary = stateManager.getStateSummary();

      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
      expect(summary).toContain('Upload:');
      expect(summary).toContain('Button:');
    });
  });

  describe('State Reset and Cleanup', () => {
    it('resets to initial state', () => {
      stateManager.setButtonState(true);
      stateManager.setUploadStatus({ status: 'uploading', progress: 50, message: 'Test' });
      stateManager.addNotification('success');
      stateManager.setDropdownVisible(true);

      stateManager.reset();

      const state = stateManager.getState();
      expect(state.buttonState.isValid).toBe(false);
      expect(state.uploadStatus.status).toBe('idle');
      expect(state.notifications.active).toBe(0);
      expect(state.dropdown.isVisible).toBe(false);
    });

    it('removes all listeners on cleanup', () => {
      const listener = vi.fn();
      stateManager.addListener(listener);

      stateManager.cleanup();
      stateManager.setButtonState(true);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('State Immutability', () => {
    it('getState returns readonly copy', () => {
      const state1 = stateManager.getState();
      const state2 = stateManager.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('modifying returned state does not affect internal state', () => {
      const state = stateManager.getState();

      state.buttonState.isValid = true;
      state.uploadStatus.status = 'uploading';

      const internalState = stateManager.getState();
      expect(internalState.buttonState.isValid).toBe(false);
      expect(internalState.uploadStatus.status).toBe('idle');
    });
  });
});
