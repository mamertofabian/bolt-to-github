import { createLogger } from '../lib/utils/logger';

const logger = createLogger('WindowManager');

interface PopupWindowOptions {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

export class WindowManager {
  private static instance: WindowManager | null = null;
  private popupWindowId: number | null = null;

  private constructor() {
    // Set up window management listeners only if Chrome APIs are available
    if (this.isChromeApiAvailable()) {
      this.setupListeners();
    }
  }

  private isChromeApiAvailable(): boolean {
    try {
      // Check for chrome API availability in different contexts
      const chromeGlobal =
        (globalThis as any).chrome || (window as any)?.chrome || (global as any)?.chrome;

      return (
        chromeGlobal &&
        chromeGlobal.windows &&
        chromeGlobal.windows.onRemoved &&
        chromeGlobal.windows.onFocusChanged &&
        typeof chromeGlobal.windows.onRemoved.addListener === 'function'
      );
    } catch {
      return false;
    }
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  private setupListeners(): void {
    // Listen for window close events
    chrome.windows.onRemoved.addListener((windowId: number) => {
      if (this.popupWindowId === windowId) {
        logger.info('🪟 Popup window closed:', windowId);
        this.popupWindowId = null;
      }
    });

    // Listen for window focus events to handle existing window management
    chrome.windows.onFocusChanged.addListener((windowId: number) => {
      if (windowId === this.popupWindowId) {
        logger.debug('🪟 Popup window focused:', windowId);
      }
    });
  }

  /**
   * Opens the popup content in a new window or focuses existing window
   */
  public async openPopupWindow(options: PopupWindowOptions = {}): Promise<chrome.windows.Window> {
    try {
      // Check if popup window already exists
      if (this.popupWindowId) {
        try {
          const existingWindow = await chrome.windows.get(this.popupWindowId);
          if (existingWindow) {
            // Focus existing window
            await chrome.windows.update(this.popupWindowId, { focused: true });
            logger.info('🪟 Focused existing popup window:', this.popupWindowId);
            return existingWindow;
          }
        } catch {
          // Window no longer exists, clear the ID
          this.popupWindowId = null;
        }
      }

      // Calculate window position
      const windowWidth = options.width || 420; // Slightly larger than popup for window chrome
      const windowHeight = options.height || 640;

      // Use reasonable default positioning (centered on screen)
      const left = options.left ?? Math.round((screen.width - windowWidth) / 2);
      const top = options.top ?? Math.round((screen.height - windowHeight) / 2);

      // Create new popup window
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/index.html?mode=window'),
        type: 'popup',
        width: windowWidth,
        height: windowHeight,
        left: left,
        top: top,
        focused: true,
      });

      if (window?.id) {
        this.popupWindowId = window.id;
        logger.info('🪟 Created new popup window:', window.id, {
          width: windowWidth,
          height: windowHeight,
          left,
          top,
        });
      }

      return window!;
    } catch (error) {
      logger.error('❌ Failed to open popup window:', error);
      throw new Error(`Failed to open popup window: ${error}`);
    }
  }

  /**
   * Closes the popup window if it exists
   */
  public async closePopupWindow(): Promise<void> {
    if (this.popupWindowId) {
      try {
        await chrome.windows.remove(this.popupWindowId);
        logger.info('🪟 Closed popup window:', this.popupWindowId);
        this.popupWindowId = null;
      } catch (error) {
        logger.warn('⚠️ Failed to close popup window:', error);
        this.popupWindowId = null; // Clear ID even if close failed
      }
    }
  }

  /**
   * Checks if a popup window is currently open
   */
  public isPopupWindowOpen(): boolean {
    return this.popupWindowId !== null;
  }

  /**
   * Gets the current popup window ID if it exists
   */
  public getPopupWindowId(): number | null {
    return this.popupWindowId;
  }

  /**
   * Checks if the given window ID is our popup window
   */
  public isPopupWindow(windowId: number): boolean {
    return this.popupWindowId === windowId;
  }

  /**
   * Updates window size and position
   */
  public async updatePopupWindow(options: PopupWindowOptions): Promise<void> {
    if (!this.popupWindowId) {
      throw new Error('No popup window is currently open');
    }

    try {
      await chrome.windows.update(this.popupWindowId, {
        width: options.width,
        height: options.height,
        left: options.left,
        top: options.top,
      });
      logger.info('🪟 Updated popup window:', this.popupWindowId, options);
    } catch (error) {
      logger.error('❌ Failed to update popup window:', error);
      throw new Error(`Failed to update popup window: ${error}`);
    }
  }

  public destroy(): void {
    // Clean up any resources if needed
    if (this.popupWindowId) {
      this.closePopupWindow().catch((error) => {
        logger.error('❌ Error closing popup window during destroy:', error);
      });
    }
  }
}
