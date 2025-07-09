import { createLogger } from '../lib/utils/logger';

const logger = createLogger('WindowManager');

export class WindowManager {
  private static instance: WindowManager | null = null;
  private popupWindowId: number | null = null;

  private constructor() {}

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  /**
   * Open popup content in a new window
   */
  async openPopupWindow(): Promise<chrome.windows.Window | null> {
    try {
      logger.info('🪟 Opening popup window...');

      // Get display info for window positioning
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays[0];

      if (!primaryDisplay) {
        throw new Error('No display information available');
      }

      const windowWidth = 420;
      const windowHeight = 640;

      // Center the window on the primary display
      const left = Math.round(
        primaryDisplay.bounds.left + (primaryDisplay.bounds.width - windowWidth) / 2
      );
      const top = Math.round(
        primaryDisplay.bounds.top + (primaryDisplay.bounds.height - windowHeight) / 2
      );

      // Close existing popup window if it exists
      if (this.popupWindowId) {
        try {
          await chrome.windows.remove(this.popupWindowId);
          logger.info('🗑️ Closed existing popup window');
        } catch (error) {
          logger.warn('⚠️ Could not close existing window (may already be closed)');
        }
        this.popupWindowId = null;
      }

      // Create the new popup window
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/index.html?mode=window'),
        type: 'popup',
        width: windowWidth,
        height: windowHeight,
        left: left,
        top: top,
        focused: true,
      });

      if (window && window.id) {
        this.popupWindowId = window.id;
        logger.info(`✅ Popup window created successfully: ${window.id}`);

        // Set up window close listener to clean up
        const onWindowRemoved = (windowId: number) => {
          if (windowId === this.popupWindowId) {
            logger.info('🪟 Popup window closed, cleaning up');
            this.popupWindowId = null;
            chrome.windows.onRemoved.removeListener(onWindowRemoved);
          }
        };
        chrome.windows.onRemoved.addListener(onWindowRemoved);
      }

      return window;
    } catch (error) {
      logger.error('❌ Failed to open popup window:', error);
      throw error;
    }
  }

  /**
   * Get the current popup window ID
   */
  getPopupWindowId(): number | null {
    return this.popupWindowId;
  }

  /**
   * Check if popup window is currently open
   */
  async isPopupWindowOpen(): Promise<boolean> {
    if (!this.popupWindowId) {
      return false;
    }

    try {
      await chrome.windows.get(this.popupWindowId);
      return true;
    } catch (error) {
      // Window doesn't exist anymore
      this.popupWindowId = null;
      return false;
    }
  }

  /**
   * Close the popup window if it's open
   */
  async closePopupWindow(): Promise<void> {
    if (this.popupWindowId) {
      try {
        await chrome.windows.remove(this.popupWindowId);
        logger.info('🗑️ Popup window closed successfully');
      } catch (error) {
        logger.warn('⚠️ Could not close popup window:', error);
      } finally {
        this.popupWindowId = null;
      }
    }
  }
}
