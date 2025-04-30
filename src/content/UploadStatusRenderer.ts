import type { UploadStatusState } from '$lib/types';
import type {
  IContentUIElementFactory,
  IUploadStatusRenderer,
} from './interfaces/ContentUIInterfaces';
import UploadStatus from './UploadStatus.svelte';

// Define proper types for Svelte components
type SvelteComponent = {
  $set: (props: Record<string, any>) => void;
  $destroy: () => void;
};

export class UploadStatusRenderer implements IUploadStatusRenderer {
  private uploadStatusComponent: SvelteComponent | null = null;
  private elementFactory: IContentUIElementFactory;

  constructor(elementFactory: IContentUIElementFactory) {
    this.elementFactory = elementFactory;
  }

  public renderUploadStatus(status: UploadStatusState): void {
    console.log('🔊 Updating upload status:', status);

    // If component doesn't exist, initialize it first
    if (!this.uploadStatusComponent) {
      console.log('🔊 Upload status component not found, initializing');
      this.initializeUploadStatus();

      // Add a small delay to ensure component is mounted before updating
      setTimeout(() => {
        this.updateUploadStatusInternal(status);
      }, 50);
      return;
    }

    this.updateUploadStatusInternal(status);
  }

  private updateUploadStatusInternal(status: UploadStatusState): void {
    // Ensure the container is visible in the DOM
    const container = document.getElementById('bolt-to-github-upload-status-container');
    if (!container || !document.body.contains(container)) {
      console.log('🔊 Upload status container not in DOM, reinitializing');
      this.initializeUploadStatus();

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
  }

  private initializeUploadStatus(): void {
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
    const target = this.elementFactory.createUploadStatusContainer();

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

  public cleanup(): void {
    if (this.uploadStatusComponent) {
      this.uploadStatusComponent.$destroy();
      this.uploadStatusComponent = null;
    }

    const existingContainer = document.getElementById('bolt-to-github-upload-status-container');
    if (existingContainer) {
      existingContainer.remove();
    }
  }
}
