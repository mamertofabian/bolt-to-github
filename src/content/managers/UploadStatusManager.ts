import type { UploadStatusState } from '../../lib/types';
import type { SvelteComponent, ComponentPosition } from '../types/UITypes';
import type { IUploadStatusManager } from '../types/ManagerInterfaces';
import type { UIStateManager } from '../services/UIStateManager';
import UploadStatus from '../UploadStatus.svelte';

/**
 * UploadStatusManager handles the UploadStatus component lifecycle and state management
 * Previously part of UIManager
 */
export class UploadStatusManager implements IUploadStatusManager {
  private uploadStatusComponent: SvelteComponent | null = null;
  private defaultPosition: ComponentPosition = {
    top: '4rem',
    right: '1rem',
    zIndex: '10001',
  };

  // State manager for centralized state coordination
  private stateManager?: UIStateManager;

  constructor(stateManager?: UIStateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Initialize the upload status component
   * Replaces the previous initializeUploadStatus method from UIManager
   */
  public initialize(): void {
    console.log('🔊 Initializing upload status');

    // Clean up existing instance if any
    if (this.uploadStatusComponent) {
      console.log('Destroying existing upload status component');
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }

    // Remove existing container if any
    const existingContainer = document.getElementById('bolt-to-github-upload-status-container');
    if (existingContainer) {
      console.log('Removing existing upload status container');
      existingContainer.remove();
    }

    // Create new container and component
    const target = document.createElement('div');
    target.id = 'bolt-to-github-upload-status-container';
    this.applyPositionStyles(target);

    const initComponent = () => {
      if (!document.body.contains(target)) {
        console.log('Appending upload status container to body');
        document.body.appendChild(target);
      }

      try {
        this.uploadStatusComponent = new UploadStatus({
          target,
          props: {
            status: {
              status: 'idle',
              progress: 0,
              message: '',
            },
          },
        }) as SvelteComponent;

        console.log('🔊 Upload status component created successfully');
      } catch (error) {
        console.error('🔊 Error creating upload status component:', error);
      }
    };

    // Wait for document.body to be available
    if (document.body) {
      initComponent();
    } else {
      // If body isn't available, wait for it
      console.log('Waiting for body to be available');
      document.addEventListener('DOMContentLoaded', initComponent);
    }
  }

  /**
   * Update the upload status
   * Replaces the previous updateUploadStatus and updateUploadStatusInternal methods from UIManager
   */
  public updateStatus(status: UploadStatusState): void {
    console.log('🔊 Updating upload status:', status);

    // If component doesn't exist, initialize it first
    if (!this.uploadStatusComponent) {
      console.log('🔊 Upload status component not found, initializing');
      this.initialize();

      // Add a small delay to ensure component is mounted before updating
      setTimeout(() => {
        this.updateStatusInternal(status);
      }, 50);
      return;
    }

    this.updateStatusInternal(status);
  }

  /**
   * Internal method to update the upload status
   * Handles the actual component update and state management
   */
  private updateStatusInternal(status: UploadStatusState): void {
    // Ensure the container is visible in the DOM
    const container = document.getElementById('bolt-to-github-upload-status-container');
    if (!container || !document.body.contains(container)) {
      console.log('🔊 Upload status container not in DOM, reinitializing');
      this.initialize();

      // Add a slightly longer delay to ensure component is fully mounted
      setTimeout(() => {
        if (this.uploadStatusComponent) {
          console.log('🔊 Setting upload status after initialization:', status);
          this.uploadStatusComponent.$set({ status });
        }
      }, 100);
      return;
    }

    console.log('🔊 Setting upload status:', status);

    // Update the component immediately if it exists
    if (this.uploadStatusComponent) {
      this.uploadStatusComponent.$set({ status });
    }

    // Update centralized state if state manager is available
    if (this.stateManager) {
      this.stateManager.setUploadStatus(status);
    }
  }

  /**
   * Apply position styles to the container element
   */
  private applyPositionStyles(element: HTMLElement): void {
    element.style.position = 'fixed';
    element.style.width = '22rem';
    element.style.maxWidth = 'calc(100vw - 2rem)';
    element.style.pointerEvents = 'none';
    if (this.defaultPosition.top) element.style.top = this.defaultPosition.top;
    if (this.defaultPosition.right) element.style.right = this.defaultPosition.right;
    if (this.defaultPosition.bottom) element.style.bottom = this.defaultPosition.bottom;
    if (this.defaultPosition.left) element.style.left = this.defaultPosition.left;
    if (this.defaultPosition.zIndex) element.style.zIndex = this.defaultPosition.zIndex;
  }

  /**
   * Update the position of the upload status component
   */
  public setPosition(position: Partial<ComponentPosition>): void {
    this.defaultPosition = { ...this.defaultPosition, ...position };

    const container = document.getElementById('bolt-to-github-upload-status-container');
    if (container) {
      this.applyPositionStyles(container);
    }
  }

  /**
   * Check if the upload status component is currently initialized
   */
  public isInitialized(): boolean {
    return this.uploadStatusComponent !== null;
  }

  /**
   * Get the current container element
   */
  public getContainer(): HTMLElement | null {
    return document.getElementById('bolt-to-github-upload-status-container');
  }

  /**
   * Cleanup the upload status component and resources
   */
  public cleanup(): void {
    console.log('🔊 Cleaning up upload status manager');

    // Cleanup upload status component
    if (this.uploadStatusComponent) {
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }

    // Remove container if it exists
    const container = document.getElementById('bolt-to-github-upload-status-container');
    if (container) {
      container.remove();
    }
  }
}
