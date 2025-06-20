import { whatsNewContent } from '$lib/constants/whatsNewContent';
import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
import type { SvelteComponent } from 'svelte';
import { createLogger } from '../../lib/utils/logger';

const logger = createLogger('WhatsNewManager');

export interface IComponentLifecycleManager {
  createComponent?<T extends SvelteComponent>(
    id: string,
    config: {
      component: typeof SvelteComponent;
      rootElement: Element | ShadowRoot;
      target?: Element;
      props?: Record<string, unknown>;
    }
  ): Promise<T>;
  destroyComponent?(id: string): void;
  hasComponent?(id: string): boolean;
}

export interface IUIElementFactory {
  createRootContainer?(id: string): HTMLElement;
  createContainer?(config: { id: string }): HTMLElement;
}

export interface WhatsNewState {
  lastShownVersion: string;
  dismissedVersions: string[];
  lastCheckTime: number;
}

export interface IWhatsNewManager {
  checkAndShow(): Promise<void>;
  showManually(): Promise<void>;
  cleanup(): void;
}

const STORAGE_KEY = 'whatsNew';
const SHOW_DELAY = 2000; // 2 seconds delay after page load

export class WhatsNewManager implements IWhatsNewManager {
  private component: SvelteComponent | null = null;
  private showTimeout: number | null = null;
  private currentVersion: string;

  constructor(
    private componentLifecycleManager: IComponentLifecycleManager,
    private uiElementFactory: IUIElementFactory
  ) {
    const manifest = chrome.runtime.getManifest();
    this.currentVersion = manifest.version;
  }

  async checkAndShow(): Promise<void> {
    try {
      const state = await this.getWhatsNewState();

      if (this.shouldShowWhatsNew(state)) {
        // Delay showing to avoid interfering with page load
        this.showTimeout = window.setTimeout(() => {
          this.show(false);
        }, SHOW_DELAY);
      }
    } catch (error) {
      logger.error("Error checking what's new:", error);
    }
  }

  async showManually(): Promise<void> {
    try {
      // Close any existing modal first
      if (this.component) {
        this.cleanup();
        // Add a small delay to ensure cleanup completes
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await this.show(true);
    } catch (error) {
      logger.error('WhatsNewManager: Error showing modal manually:', error);
    }
  }

  private async show(isManual: boolean): Promise<void> {
    if (this.component) {
      return; // Already showing
    }

    try {
      // Check if version exists in content
      if (!whatsNewContent[this.currentVersion]) {
        logger.warn(`No what's new content for version ${this.currentVersion}`);
        return;
      }

      // Create container using factory or fallback to direct creation
      let container: HTMLElement;
      if (this.uiElementFactory.createRootContainer) {
        container = this.uiElementFactory.createRootContainer('whats-new-container');
      } else if (this.uiElementFactory.createContainer) {
        container = this.uiElementFactory.createContainer({ id: 'whats-new-container' });
      } else {
        container = document.createElement('div');
        container.id = 'whats-new-container';
      }

      // Apply styles
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '9999';

      // Create portal for modal to ensure it appears above everything
      const portalTarget = document.createElement('div');
      portalTarget.style.pointerEvents = 'auto';
      container.appendChild(portalTarget);

      this.component = new WhatsNewModal({
        target: portalTarget,
        props: {
          version: this.currentVersion,
          onClose: () => this.handleClose(isManual),
          onDontShowAgain: () => this.handleDontShowAgain(),
          showAllVersions: isManual, // Show all versions when manually triggered
        },
      });

      document.body.appendChild(container);

      // Component is already created, no need to register

      // Update state to mark as shown (unless manual)
      if (!isManual) {
        await this.markAsShown();
      }
    } catch (error) {
      logger.error("Error showing what's new modal:", error);
      this.cleanup();
    }
  }

  private async handleClose(_isManual: boolean): Promise<void> {
    this.cleanup();
  }

  private async handleDontShowAgain(): Promise<void> {
    try {
      const state = await this.getWhatsNewState();
      if (!state.dismissedVersions.includes(this.currentVersion)) {
        state.dismissedVersions.push(this.currentVersion);
      }
      await this.saveWhatsNewState(state);
    } catch (error) {
      logger.error('Error saving dismissed version:', error);
    }
    // Close the modal after saving the preference
    this.cleanup();
  }

  private async markAsShown(): Promise<void> {
    try {
      const state = await this.getWhatsNewState();
      state.lastShownVersion = this.currentVersion;
      state.lastCheckTime = Date.now();
      await this.saveWhatsNewState(state);
    } catch (error) {
      logger.error('Error marking version as shown:', error);
    }
  }

  private shouldShowWhatsNew(state: WhatsNewState): boolean {
    // Don't show if already shown for this version
    if (state.lastShownVersion === this.currentVersion) {
      return false;
    }

    // Don't show if user dismissed this version
    if (state.dismissedVersions.includes(this.currentVersion)) {
      return false;
    }

    // Show if we have content for this version
    return !!whatsNewContent[this.currentVersion];
  }

  private async getWhatsNewState(): Promise<WhatsNewState> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (
        result[STORAGE_KEY] || {
          lastShownVersion: '',
          dismissedVersions: [],
          lastCheckTime: 0,
        }
      );
    } catch (error) {
      logger.error("Error getting what's new state:", error);
      return {
        lastShownVersion: '',
        dismissedVersions: [],
        lastCheckTime: 0,
      };
    }
  }

  private async saveWhatsNewState(state: WhatsNewState): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
    } catch (error) {
      logger.error("Error saving what's new state:", error);
    }
  }

  cleanup(): void {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    if (this.component) {
      // Destroy the component
      if (this.componentLifecycleManager.destroyComponent) {
        this.componentLifecycleManager.destroyComponent('WhatsNewModal');
      } else if (this.component && this.component.$destroy) {
        this.component.$destroy();
      }
      const container = document.getElementById('whats-new-container');
      if (container) {
        container.remove();
      }
      this.component = null;
    }
  }
}
