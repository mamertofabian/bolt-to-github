/**
 * Interface for idle monitor service
 * Provides a standardized way to monitor user idle state
 */
export interface IIdleMonitorService {
  /**
   * Gets the current idle state
   * @returns The current idle state ('active', 'idle', or 'locked')
   */
  getCurrentState(): chrome.idle.IdleState;

  /**
   * Checks if the user is currently idle
   * @returns True if user is idle or screen is locked
   */
  isIdle(): boolean;

  /**
   * Adds a listener for idle state changes
   * @param callback Function to call when idle state changes
   */
  addListener(callback: (state: chrome.idle.IdleState) => void): void;

  /**
   * Removes a previously added listener
   * @param callback The callback to remove
   */
  removeListener(callback: (state: chrome.idle.IdleState) => void): void;
}
