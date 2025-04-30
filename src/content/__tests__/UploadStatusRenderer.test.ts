import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { UploadStatusRenderer } from '../UploadStatusRenderer';
import type { IContentUIElementFactory } from '../interfaces/ContentUIInterfaces';
import type { UploadStatusState } from '$lib/types';

// Mock Svelte component
jest.mock('../UploadStatus.svelte', () => {
  return jest.fn().mockImplementation(() => {
    return {
      $set: jest.fn(),
      $destroy: jest.fn(),
    };
  });
});

describe('UploadStatusRenderer', () => {
  let renderer: UploadStatusRenderer;
  let mockElementFactory: IContentUIElementFactory;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Reset document body
    document.body.innerHTML = '';

    // Create mock container
    mockContainer = document.createElement('div');
    mockContainer.id = 'bolt-to-github-upload-status-container';

    // Create mock element factory
    mockElementFactory = {
      createUploadStatusContainer: jest.fn().mockReturnValue(mockContainer),
      createUploadButton: jest.fn(),
      createGitHubDropdown: jest.fn(),
      createNotificationElement: jest.fn(),
      createGitHubConfirmationDialog: jest.fn(),
    };

    // Initialize renderer
    renderer = new UploadStatusRenderer(mockElementFactory);

    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock setTimeout and clearTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('renderUploadStatus', () => {
    it('should initialize component when called for the first time', () => {
      // Arrange
      const status: UploadStatusState = {
        status: 'idle',
        progress: 0,
        message: '',
      };

      // Act
      renderer.renderUploadStatus(status);

      // Assert
      expect(mockElementFactory.createUploadStatusContainer).toHaveBeenCalled();
      expect(document.body.contains(mockContainer)).toBeTruthy();

      // Advance timers to trigger the delayed update
      jest.advanceTimersByTime(100);
    });

    it('should update existing component when already initialized', () => {
      // Arrange - create component first
      renderer.renderUploadStatus({
        status: 'idle',
        progress: 0,
        message: '',
      });

      // Fast forward past initialization
      jest.advanceTimersByTime(100);

      // Get the component and spy on $set
      const component = (renderer as any).uploadStatusComponent;
      const setSpy = jest.spyOn(component, '$set');

      // Act - update with new status
      const newStatus: UploadStatusState = {
        status: 'uploading',
        progress: 50,
        message: 'Uploading...',
      };
      renderer.renderUploadStatus(newStatus);

      // Assert
      expect(setSpy).toHaveBeenCalledWith({ status: newStatus });
    });

    it('should reinitialize component if container is not in DOM', () => {
      // Arrange - create component first
      renderer.renderUploadStatus({
        status: 'idle',
        progress: 0,
        message: '',
      });

      // Fast forward past initialization
      jest.advanceTimersByTime(100);

      // Remove container from DOM to simulate a situation where it was removed
      document.body.removeChild(mockContainer);

      // Act - try to update status
      renderer.renderUploadStatus({
        status: 'uploading',
        progress: 50,
        message: 'Uploading...',
      });

      // Assert
      expect(mockElementFactory.createUploadStatusContainer).toHaveBeenCalledTimes(2);

      // Fast forward past reinitialization
      jest.advanceTimersByTime(100);
    });
  });

  describe('cleanup', () => {
    it('should destroy component and remove container', () => {
      // Arrange - create component first
      renderer.renderUploadStatus({
        status: 'idle',
        progress: 0,
        message: '',
      });

      // Fast forward past initialization
      jest.advanceTimersByTime(100);

      // Get the component and spy on $destroy
      const component = (renderer as any).uploadStatusComponent;
      const destroySpy = jest.spyOn(component, '$destroy');

      // Add container to DOM
      document.body.appendChild(mockContainer);

      // Act
      renderer.cleanup();

      // Assert
      expect(destroySpy).toHaveBeenCalled();
      expect(document.body.contains(mockContainer)).toBeFalsy();
    });

    it("should not throw error if component doesn't exist", () => {
      // Act & Assert
      expect(() => renderer.cleanup()).not.toThrow();
    });
  });
});
