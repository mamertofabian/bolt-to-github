import { createLogger } from './logger';

const logger = createLogger('WindowMode');

/**
 * Window mode constants
 */
export const WINDOW_MODE = {
  POPUP: 'popup',
  WINDOW: 'window',
} as const;

export type WindowModeType = (typeof WINDOW_MODE)[keyof typeof WINDOW_MODE];

/**
 * Default window dimensions
 */
export const WINDOW_DIMENSIONS = {
  WIDTH: 420,
  HEIGHT: 640,
} as const;

/**
 * Detects if the extension is running in window mode
 * @returns true if in window mode, false if in popup mode
 */
export function isWindowMode(): boolean {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    return mode === WINDOW_MODE.WINDOW;
  } catch (error) {
    logger.warn('Failed to detect window mode:', error);
    return false;
  }
}

/**
 * Gets the current window mode
 * @returns 'window' or 'popup'
 */
export function getCurrentWindowMode(): WindowModeType {
  return isWindowMode() ? WINDOW_MODE.WINDOW : WINDOW_MODE.POPUP;
}

/**
 * Opens the popup content in a new window
 * @returns Promise resolving to the window response
 */
export async function openPopupWindow(): Promise<{
  success: boolean;
  windowId?: number;
  error?: string;
}> {
  try {
    logger.info('📤 Requesting popup window from background service');

    const response = await chrome.runtime.sendMessage({
      type: 'OPEN_POPUP_WINDOW',
    });

    if (response.success) {
      logger.info('✅ Popup window opened successfully:', response.windowId);
    } else {
      logger.error('❌ Failed to open popup window:', response.error);
    }

    return response;
  } catch (error) {
    logger.error('❌ Error communicating with background service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Communication error',
    };
  }
}

/**
 * Checks if the extension is running in popup context
 * @returns true if in popup mode, false if in window mode
 */
export function isPopupMode(): boolean {
  return !isWindowMode();
}

/**
 * Gets the appropriate window title based on mode
 * @returns Window title string
 */
export function getWindowTitle(): string {
  const mode = getCurrentWindowMode();
  return mode === WINDOW_MODE.WINDOW ? 'Bolt to GitHub' : 'Bolt to GitHub';
}

/**
 * State synchronization utility for cross-mode communication
 */
export class WindowModeStateSync {
  private static instance: WindowModeStateSync | null = null;
  private storagePrefix = 'windowMode_';

  private constructor() {}

  public static getInstance(): WindowModeStateSync {
    if (!WindowModeStateSync.instance) {
      WindowModeStateSync.instance = new WindowModeStateSync();
    }
    return WindowModeStateSync.instance;
  }

  /**
   * Saves state that should be synchronized between popup and window modes
   */
  async saveSharedState(key: string, value: unknown): Promise<void> {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      await chrome.storage.local.set({ [storageKey]: value });
      logger.debug('💾 Saved shared state:', { key, value });
    } catch (error) {
      logger.error('❌ Failed to save shared state:', error);
    }
  }

  /**
   * Loads state that should be synchronized between popup and window modes
   */
  async loadSharedState<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      const result = await chrome.storage.local.get(storageKey);
      const value = result[storageKey];
      logger.debug('📖 Loaded shared state:', { key, value });
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      logger.error('❌ Failed to load shared state:', error);
      return defaultValue;
    }
  }

  /**
   * Clears shared state
   */
  async clearSharedState(key: string): Promise<void> {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      await chrome.storage.local.remove(storageKey);
      logger.debug('🗑️ Cleared shared state:', { key });
    } catch (error) {
      logger.error('❌ Failed to clear shared state:', error);
    }
  }
}
