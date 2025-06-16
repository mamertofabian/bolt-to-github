import type { IDropdownManager } from '../types/ManagerInterfaces';
import type { MessageHandler } from '../MessageHandler';
import type { UIStateManager } from '../services/UIStateManager';
import { createLogger } from '$lib/utils/logger';
import { getCurrentProjectId } from '$lib/utils/projectId';

const logger = createLogger('DropdownManager');

/**
 * DropdownManager handles the GitHub dropdown creation, positioning, and interaction
 * Previously part of UIManager
 */
export class DropdownManager implements IDropdownManager {
  private messageHandler: MessageHandler;
  private stateManager?: UIStateManager;
  private onPushActionCallback?: () => Promise<void>;
  private onShowChangedFilesCallback?: () => Promise<void>;
  private onUpgradePromptCallback?: (feature: string) => Promise<void>;
  private currentDropdown: HTMLElement | null = null;
  private resizeListener?: () => void;
  private clickOutsideListener?: (e: MouseEvent) => void;
  private premiumService?: any; // Will be injected from UIManager

  constructor(
    messageHandler: MessageHandler,
    stateManager?: UIStateManager,
    onPushActionCallback?: () => Promise<void>,
    onShowChangedFilesCallback?: () => Promise<void>,
    onUpgradePromptCallback?: (feature: string) => Promise<void>
  ) {
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
    this.onPushActionCallback = onPushActionCallback;
    this.onShowChangedFilesCallback = onShowChangedFilesCallback;
    this.onUpgradePromptCallback = onUpgradePromptCallback;
  }

  /**
   * Set premium service for checking premium features
   */
  public setPremiumService(premiumService: any): void {
    this.premiumService = premiumService;
  }

  /**
   * Update premium status and refresh dropdown if it's currently shown
   */
  public updatePremiumStatus(): void {
    logger.info('🔄 Updating dropdown premium status...');

    /* If dropdown is currently shown, refresh its content */
    if (this.currentDropdown && this.currentDropdown.style.display === 'block') {
      logger.info('✅ Refreshing visible dropdown content');
      this.refreshDropdownContent();
    }
  }

  /**
   * Refresh the dropdown content with current premium status
   */
  public refreshDropdownContent(): void {
    if (!this.currentDropdown) {
      return;
    }

    /* Clear existing content */
    this.currentDropdown.innerHTML = '';

    /* Recreate dropdown items with current premium status */
    const items = this.createDropdownItems();
    items.forEach((item) => this.currentDropdown!.appendChild(item));

    logger.info('🔄 Dropdown content refreshed with current premium status');
  }

  /**
   * Show the dropdown for the given button
   * Replaces the previous handleGitHubDropdownClick method from UIManager
   */
  public async show(button: HTMLButtonElement): Promise<void> {
    logger.debug('Handling GitHub dropdown click');

    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(keydownEvent);
    logger.debug('Dispatched keydown to GitHub button');

    // Wait a bit for the dropdown content to render
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Always recreate dropdown content to ensure it reflects current premium status
    let dropdownContent = document.querySelector('#github-dropdown-content') as HTMLElement;
    if (dropdownContent) {
      dropdownContent.remove();
    }

    dropdownContent = this.createContent();
    document.body.appendChild(dropdownContent);
    // Set initial position (will be updated below)
    dropdownContent.style.position = 'fixed';
    dropdownContent.style.zIndex = '9999';

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

    // Project Dashboard option
    const dashboardButton = document.createElement('button');
    dashboardButton.className = 'dropdown-item flex items-center';
    dashboardButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
      <span>Project Dashboard</span>
    `;
    dashboardButton.addEventListener('click', () => {
      this.hide();
      this.messageHandler.sendMessage('OPEN_HOME');
    });
    items.push(dashboardButton);

    // Show Changed Files option - now premium feature
    const changedFilesButton = document.createElement('button');
    const isPremium = this.premiumService?.isPremiumSync() || false;

    changedFilesButton.className = `dropdown-item flex items-center justify-between ${!isPremium ? 'opacity-75' : ''}`;
    changedFilesButton.innerHTML = `
      <div class="flex items-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
        <span>Show Changed Files</span>
      </div>
      ${!isPremium ? '<span class="text-xs bg-gradient-to-r from-blue-500 to-purple-600 text-white px-2 py-0.5 rounded-full font-medium">PRO</span>' : ''}
    `;

    changedFilesButton.addEventListener('click', async () => {
      this.hide();

      /* Server validation happens in the callback - FileChangeHandler will validate subscription */
      if (!isPremium) {
        /* Show upgrade prompt for file changes feature */
        if (this.onUpgradePromptCallback) {
          await this.onUpgradePromptCallback('file-changes');
        } else {
          /* Fallback notification */
          logger.info('Upgrade required for file changes feature');
        }
        return;
      }

      /* For premium users, proceed to file changes (validation happens in FileChangeHandler) */
      if (this.onShowChangedFilesCallback) {
        await this.onShowChangedFilesCallback();
      }
    });
    items.push(changedFilesButton);

    // Issues option - now premium feature
    const issuesButton = document.createElement('button');
    const isPremiumForIssues = this.premiumService?.isPremiumSync() || false;

    issuesButton.className = `dropdown-item flex items-center justify-between ${!isPremiumForIssues ? 'opacity-75' : ''}`;
    issuesButton.innerHTML = `
      <div class="flex items-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>Manage Issues</span>
      </div>
      ${!isPremiumForIssues ? '<span class="text-xs bg-gradient-to-r from-blue-500 to-purple-600 text-white px-2 py-0.5 rounded-full font-medium">PRO</span>' : ''}
    `;

    issuesButton.addEventListener('click', async () => {
      this.hide();

      /* Server validation happens in the callback - similar to file changes */
      if (!isPremiumForIssues) {
        /* Show upgrade prompt for issues feature */
        if (this.onUpgradePromptCallback) {
          await this.onUpgradePromptCallback('issues');
        } else {
          /* Fallback notification */
          logger.info('Upgrade required for issues feature');
        }
        return;
      }

      /* For premium users, proceed to open issues */
      this.messageHandler.sendMessage('OPEN_ISSUES');
    });
    items.push(issuesButton);

    // Projects option
    const projectsButton = document.createElement('button');
    projectsButton.className = 'dropdown-item flex items-center';
    projectsButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
      <span>Projects</span>
    `;
    projectsButton.addEventListener('click', () => {
      this.hide();
      this.messageHandler.sendMessage('OPEN_PROJECTS');
    });
    items.push(projectsButton);

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
    logger.info('🔊 Cleaning up dropdown manager');

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
