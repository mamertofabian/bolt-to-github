import type { IGitHubButtonManager } from '../types/ManagerInterfaces';
import type { UIStateManager } from '../services/UIStateManager';
import { SettingsService } from '../../services/settings';

/**
 * GitHubButtonManager handles the GitHub button creation, lifecycle, and state management
 * Previously part of UIManager
 */
export class GitHubButtonManager implements IGitHubButtonManager {
  private uploadButton: HTMLElement | null = null;
  private stateManager?: UIStateManager;
  private onDropdownClickCallback?: (button: HTMLButtonElement) => Promise<void>;

  constructor(
    stateManager?: UIStateManager,
    onDropdownClickCallback?: (button: HTMLButtonElement) => Promise<void>
  ) {
    this.stateManager = stateManager;
    this.onDropdownClickCallback = onDropdownClickCallback;
  }

  /**
   * Initialize the GitHub upload button
   * Replaces the previous initializeUploadButton method from UIManager
   */
  public async initialize(): Promise<void> {
    console.log('🔊 Initializing GitHub upload button');

    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    console.log('Button container found:', !!buttonContainer);

    const existingButton = document.querySelector('[data-github-upload]');
    console.log('Existing GitHub button found:', !!existingButton);

    if (!buttonContainer || existingButton) {
      console.log('Exiting initializeUploadButton early');
      return;
    }

    const settings = await SettingsService.getGitHubSettings();
    const button = this.createGitHubButton();
    this.updateState(settings.isSettingsValid);
    this.uploadButton = button;

    const deployButton = buttonContainer.querySelector('button:last-child');
    if (deployButton) {
      deployButton.before(button);
    }

    console.log('GitHub upload button initialized');
  }

  /**
   * Create the GitHub button element
   * Replaces the previous createGitHubButton method from UIManager
   */
  private createGitHubButton(): HTMLButtonElement {
    console.log('Creating GitHub button');

    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.setAttribute('data-testid', 'github-upload-button');
    button.setAttribute('aria-haspopup', 'menu');
    button.className = [
      'rounded-md',
      'items-center',
      'justify-center',
      'outline-accent-600',
      'px-3',
      'py-1.25',
      'disabled:cursor-not-allowed',
      'text-xs',
      'bg-bolt-elements-button-secondary-background',
      'text-bolt-elements-button-secondary-text',
      'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
      'flex',
      'gap-1.7',
      'transition-opacity',
    ].join(' ');

    button.innerHTML = this.getButtonHTML();

    // Add click event listener that delegates to the dropdown handler
    button.addEventListener('click', async () => {
      if (this.onDropdownClickCallback) {
        await this.onDropdownClickCallback(button);
      }
    });

    console.log('GitHub button created');
    return button;
  }

  /**
   * Get the default HTML content for the button
   */
  private getButtonHTML(): string {
    return `
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
      <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
        <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
      </svg>
    `;
  }

  /**
   * Update button state based on settings validity
   */
  public updateState(isValid: boolean): void {
    if (!this.uploadButton) return;

    if (isValid) {
      this.uploadButton.classList.remove('opacity-50');
      this.uploadButton.classList.add(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      (this.uploadButton as HTMLButtonElement).disabled = false;
    } else {
      this.uploadButton.classList.add('opacity-50');
      this.uploadButton.classList.remove(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      (this.uploadButton as HTMLButtonElement).disabled = true;
    }

    // Update centralized state if state manager is available
    if (this.stateManager) {
      this.stateManager.setButtonState(isValid);
    }
  }

  /**
   * Set button to processing state during uploads
   */
  public setProcessingState(): void {
    if (!this.uploadButton) return;

    (this.uploadButton as HTMLButtonElement).disabled = true;
    this.uploadButton.innerHTML = `
      <div class="flex items-center gap-1.5">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Uploading...</span>
      </div>
    `;
  }

  /**
   * Set button to detecting changes state
   */
  public setDetectingChangesState(): void {
    if (!this.uploadButton) return;

    (this.uploadButton as HTMLButtonElement).disabled = true;
    this.uploadButton.innerHTML = `
      <div class="flex items-center gap-1.5">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Detecting changes...</span>
      </div>
    `;
  }

  /**
   * Set button to pushing state
   */
  public setPushingState(): void {
    if (!this.uploadButton) return;

    (this.uploadButton as HTMLButtonElement).disabled = true;
    this.uploadButton.innerHTML = `
      <div class="flex items-center gap-1.5">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Pushing...</span>
      </div>
    `;
  }

  /**
   * Set button to a custom loading state with specified text
   */
  public setLoadingState(text: string): void {
    if (!this.uploadButton) return;

    (this.uploadButton as HTMLButtonElement).disabled = true;
    this.uploadButton.innerHTML = `
      <div class="flex items-center gap-1.5">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>${text}</span>
      </div>
    `;
  }

  /**
   * Reset button to normal state
   */
  public resetState(): void {
    if (!this.uploadButton) return;

    (this.uploadButton as HTMLButtonElement).disabled = false;
    this.uploadButton.innerHTML = this.getButtonHTML();
  }

  /**
   * Get the current button element
   */
  public getButton(): HTMLElement | null {
    return this.uploadButton;
  }

  /**
   * Check if the button is currently initialized
   */
  public isInitialized(): boolean {
    return this.uploadButton !== null;
  }

  /**
   * Check if a button already exists in the DOM
   */
  public buttonExists(): boolean {
    return document.querySelector('[data-github-upload]') !== null;
  }

  /**
   * Cleanup the button and resources
   */
  public cleanup(): void {
    console.log('🔊 Cleaning up GitHub button manager');

    if (this.uploadButton) {
      this.uploadButton.remove();
      this.uploadButton = null;
    }
  }
}
