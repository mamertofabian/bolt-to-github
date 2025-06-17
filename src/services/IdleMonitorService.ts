import type { IIdleMonitorService } from './interfaces/IIdleMonitorService';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('IdleMonitorService');

/**
 * Service to monitor user idle state using Chrome's idle API
 * with fallback for environments where the API is not available
 */
export class IdleMonitorService implements IIdleMonitorService {
  private static readonly DEFAULT_IDLE_THRESHOLD = 60; // 60 seconds before considering user idle
  private static instance: IdleMonitorService | null = null;

  private listeners: Array<(state: chrome.idle.IdleState) => void> = [];
  private initialized = false;
  private currentState: chrome.idle.IdleState = 'active';

  private constructor(private chromeIdle: typeof chrome.idle | null = self.chrome?.idle || null) {
    this.initialize();
  }

  public static getInstance(
    chromeIdle: typeof chrome.idle | null = self.chrome?.idle || null
  ): IdleMonitorService {
    if (!IdleMonitorService.instance) {
      IdleMonitorService.instance = new IdleMonitorService(chromeIdle);
    }
    return IdleMonitorService.instance;
  }

  private initialize(): void {
    if (!this.chromeIdle) {
      logger.warn('Chrome idle API not available, using fallback implementation');
      this.initialized = true;
      return;
    }

    if (this.initialized) return;

    this.initialized = true;

    try {
      // Set detection interval (in seconds)
      this.chromeIdle.setDetectionInterval(IdleMonitorService.DEFAULT_IDLE_THRESHOLD);

      // Listen for state changes
      this.chromeIdle.onStateChanged.addListener((newState) => {
        this.currentState = newState;
        this.notifyListeners(newState);
      });

      // Get initial state
      this.chromeIdle.queryState(IdleMonitorService.DEFAULT_IDLE_THRESHOLD, (state) => {
        this.currentState = state;
        this.notifyListeners(state);
      });
    } catch (error) {
      logger.error('Error initializing idle monitor:', error);
      // Continue with fallback behavior
    }
  }

  public getCurrentState(): chrome.idle.IdleState {
    return this.currentState;
  }

  public isIdle(): boolean {
    return this.currentState === 'idle' || this.currentState === 'locked';
  }

  public addListener(callback: (state: chrome.idle.IdleState) => void): void {
    this.listeners.push(callback);
  }

  public removeListener(callback: (state: chrome.idle.IdleState) => void): void {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  private notifyListeners(state: chrome.idle.IdleState): void {
    this.listeners.forEach((listener) => listener(state));
  }

  // For testing purposes only
  public static resetInstance(): void {
    IdleMonitorService.instance = null;
  }
}
