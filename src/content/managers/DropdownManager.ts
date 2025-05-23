import type { IDropdownManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';

/**
 * DropdownManager handles the GitHub dropdown creation, positioning, and interaction
 * Previously part of UIManager
 */
export class DropdownManager implements IDropdownManager {
  private messageHandler: MessageHandler;
  private onPushActionCallback?: () => Promise<void>;
  private onShowChangedFilesCallback?: () => Promise<void>;
  private currentDropdown: HTMLElement | null = null;
  private resizeListener?: () => void;
  private clickOutsideListener?: (e: MouseEvent) => void;

  constructor(
    messageHandler: MessageHandler,
    onPushActionCallback?: () => Promise<void>,
    onShowChangedFilesCallback?: () => Promise<void>
  ) {
    this.messageHandler = messageHandler;
    this.onPushActionCallback = onPushActionCallback;
    this.onShowChangedFilesCallback = onShowChangedFilesCallback;
  }

  /**
   * Show the dropdown for the given button
   * Replaces the previous handleGitHubDropdownClick method from UIManager
   */
  public async show(button: HTMLButtonElement): Promise<void> {
    console.log('Handling GitHub dropdown click');

    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(keydownEvent);
    console.log('Dispatched keydown to GitHub button');

    // Wait a bit for the dropdown content to render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create dropdown content if it doesn't exist
    let dropdownContent = document.querySelector('#github-dropdown-content') as HTMLElement;
    if (!dropdownContent) {
      dropdownContent = this.createContent();
      document.body.appendChild(dropdownContent);
      // Set initial position (will be updated below)
      dropdownContent.style.position = 'fixed';
      dropdownContent.style.zIndex = '9999';
    }

    this.currentDropdown = dropdownContent;

    // Always update position when showing the dropdown
    if (dropdownContent) {
      dropdownContent.style.display = 'block';

      // Position the dropdown below the button
      const updatePosition = () => {
        const buttonRect = button.getBoundingClientRect();
        dropdownContent.style.top = `${buttonRect.bottom}px`;
        dropdownContent.style.left = `${buttonRect.left}px`;
      };

      // Update position immediately
      updatePosition();

      // Add window resize listener to keep dropdown aligned with button
      this.resizeListener = () => updatePosition();
      window.addEventListener('resize', this.resizeListener);

      // Clean up resize listener when dropdown is closed
      const removeResizeListener = () => {
        if (dropdownContent.style.display === 'none') {
          if (this.resizeListener) {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = undefined;
          }
          if (this.clickOutsideListener) {
            document.removeEventListener('click', this.clickOutsideListener);
            this.clickOutsideListener = undefined;
          }
        }
      };

      // Add listener to clean up when dropdown is closed
      document.addEventListener('click', removeResizeListener);
    }

    // Add click event listener to close dropdown when clicking outside
    this.clickOutsideListener = (e: MouseEvent) => {
      if (
        e.target !== button &&
        e.target !== dropdownContent &&
        !dropdownContent?.contains(e.target as Node)
      ) {
        this.hide();
      }
    };

    // Add the event listener with a slight delay to avoid immediate closing
    setTimeout(() => {
      if (this.clickOutsideListener) {
        document.addEventListener('click', this.clickOutsideListener);
      }
    }, 100);
  }

  /**
   * Hide the dropdown
   */
  public hide(): void {
    if (this.currentDropdown) {
      this.currentDropdown.style.display = 'none';
      this.currentDropdown = null;
    }

    // Clean up event listeners
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }
    if (this.clickOutsideListener) {
      document.removeEventListener('click', this.clickOutsideListener);
      this.clickOutsideListener = undefined;
    }
  }

  /**
   * Create the dropdown content
   * Replaces the previous createGitHubDropdownContent method from UIManager
   */
  public createContent(): HTMLElement {
    const dropdownContent = document.createElement('div');
    dropdownContent.id = 'github-dropdown-content';
    dropdownContent.setAttribute('role', 'menu');
    dropdownContent.className = [
      'rounded-md',
      'shadow-lg',
      'overflow-hidden',
      'min-w-[180px]',
      'animate-fadeIn',
    ].join(' ');

    // Add custom styles for animation and better appearance
    this.addDropdownStyles();

    // Create dropdown items
    const items = this.createDropdownItems();
    items.forEach((item) => dropdownContent.appendChild(item));

    return dropdownContent;
  }

  /**
   * Add custom styles for the dropdown
   */
  private addDropdownStyles(): void {
    // Check if styles already exist
    if (document.getElementById('github-dropdown-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'github-dropdown-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.2s ease-out forwards;
      }
      #github-dropdown-content {
        background-color: #1a1a1a; /* Match the Export dropdown background */
        border: none;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        position: fixed; /* Use fixed positioning to avoid scroll issues */
        z-index: 9999;
      }
      #github-dropdown-content button {
        color: #ffffff;
        padding: 8px 16px;
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        font-size: 12px;
      }
      #github-dropdown-content button:hover {
        background-color: #333333; /* Match the Export dropdown hover state */
      }
      #github-dropdown-content button svg {
        transition: transform 0.15s ease;
        margin-right: 8px;
      }
      #github-dropdown-content button:hover svg {
        transform: scale(1.05);
      }
      /* Remove border between items to match Export dropdown */
      #github-dropdown-content button:first-child {
        border-bottom: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create the dropdown items
   */
  private createDropdownItems(): HTMLButtonElement[] {
    const items: HTMLButtonElement[] = [];

    // Push to GitHub option
    const pushButton = document.createElement('button');
    pushButton.className = 'dropdown-item flex items-center';
    pushButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <span>Push to GitHub</span>
    `;
    pushButton.addEventListener('click', async () => {
      this.hide();
      if (this.onPushActionCallback) {
        await this.onPushActionCallback();
      }
    });
    items.push(pushButton);

    // Show Changed Files option
    const changedFilesButton = document.createElement('button');
    changedFilesButton.className = 'dropdown-item flex items-center';
    changedFilesButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>
      <span>Show Changed Files</span>
    `;
    changedFilesButton.addEventListener('click', async () => {
      this.hide();
      if (this.onShowChangedFilesCallback) {
        await this.onShowChangedFilesCallback();
      }
    });
    items.push(changedFilesButton);

    // Settings option
    const settingsButton = document.createElement('button');
    settingsButton.className = 'dropdown-item flex items-center';
    settingsButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    `;
    settingsButton.addEventListener('click', () => {
      this.hide();
      // Send the OPEN_SETTINGS message
      this.messageHandler.sendMessage('OPEN_SETTINGS');
    });
    items.push(settingsButton);

    return items;
  }

  /**
   * Cleanup the dropdown and resources
   */
  public cleanup(): void {
    console.log('🔊 Cleaning up dropdown manager');

    // Hide dropdown if currently shown
    this.hide();

    // Remove dropdown content if it exists
    const dropdownContent = document.getElementById('github-dropdown-content');
    if (dropdownContent) {
      dropdownContent.remove();
    }

    // Remove styles if they exist
    const styles = document.getElementById('github-dropdown-styles');
    if (styles) {
      styles.remove();
    }
  }
}
