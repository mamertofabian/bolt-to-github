import type { UploadStatusState } from '../../lib/types';
import type { IUIStateManager } from '../types/ManagerInterfaces';
import type { UIState } from '../types/UITypes';

/**
 * State change listener type
 */
export type StateChangeListener = (newState: UIState, previousState: UIState) => void;

/**
 * UIStateManager provides centralized state management for the UI system
 * Handles state transitions, validation, and event coordination between components
 */
export class UIStateManager implements IUIStateManager {
  private state: UIState;
  private listeners: Set<StateChangeListener> = new Set();

  constructor() {
    this.state = this.createInitialState();
  }

  /**
   * Create the initial state
   */
  private createInitialState(): UIState {
    return {
      uploadStatus: {
        status: 'idle',
        progress: 0,
        message: '',
      },
      buttonState: {
        isValid: false,
        isProcessing: false,
        isInitialized: false,
      },
      notifications: {
        active: 0,
      },
      dropdown: {
        isVisible: false,
      },
      components: {
        uploadStatusInitialized: false,
        notificationInitialized: false,
        buttonInitialized: false,
      },
    };
  }

  /**
   * Set upload status and notify listeners
   */
  public setUploadStatus(status: UploadStatusState): void {
    const previousState = { ...this.state };
    this.state.uploadStatus = status;

    // Update button processing state based on upload status
    if (status.status === 'uploading') {
      this.state.buttonState.isProcessing = true;
    } else if (
      status.status === 'idle' ||
      status.status === 'success' ||
      status.status === 'error'
    ) {
      this.state.buttonState.isProcessing = false;
    }

    this.notifyListeners(previousState);
  }

  /**
   * Set button state and notify listeners
   */
  public setButtonState(isValid: boolean): void {
    const previousState = { ...this.state };
    this.state.buttonState.isValid = isValid;
    this.notifyListeners(previousState);
  }

  /**
   * Set button processing state
   */
  public setButtonProcessing(isProcessing: boolean): void {
    const previousState = { ...this.state };
    this.state.buttonState.isProcessing = isProcessing;
    this.notifyListeners(previousState);
  }

  /**
   * Set button initialization state
   */
  public setButtonInitialized(isInitialized: boolean): void {
    const previousState = { ...this.state };
    this.state.buttonState.isInitialized = isInitialized;
    this.notifyListeners(previousState);
  }

  /**
   * Increment active notification count
   */
  public addNotification(type: 'info' | 'error' | 'success'): void {
    const previousState = { ...this.state };
    this.state.notifications.active++;
    this.state.notifications.lastType = type;
    this.notifyListeners(previousState);
  }

  /**
   * Decrement active notification count
   */
  public removeNotification(): void {
    const previousState = { ...this.state };
    this.state.notifications.active = Math.max(0, this.state.notifications.active - 1);
    this.notifyListeners(previousState);
  }

  /**
   * Set dropdown visibility
   */
  public setDropdownVisible(isVisible: boolean, position?: { top: number; left: number }): void {
    const previousState = { ...this.state };
    this.state.dropdown.isVisible = isVisible;
    if (position) {
      this.state.dropdown.position = position;
    } else if (!isVisible) {
      delete this.state.dropdown.position;
    }
    this.notifyListeners(previousState);
  }

  /**
   * Set component initialization state
   */
  public setComponentInitialized(
    component: keyof UIState['components'],
    isInitialized: boolean
  ): void {
    const previousState = { ...this.state };
    this.state.components[component] = isInitialized;
    this.notifyListeners(previousState);
  }

  /**
   * Get current state (readonly copy)
   */
  public getState(): UIState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get specific state slice
   */
  public getUploadStatus(): UploadStatusState {
    return { ...this.state.uploadStatus };
  }

  public getButtonState(): UIState['buttonState'] {
    return { ...this.state.buttonState };
  }

  public getNotificationState(): UIState['notifications'] {
    return { ...this.state.notifications };
  }

  public getDropdownState(): UIState['dropdown'] {
    return { ...this.state.dropdown };
  }

  public getComponentState(): UIState['components'] {
    return { ...this.state.components };
  }

  /**
   * Add state change listener
   */
  public addListener(listener: StateChangeListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove state change listener
   */
  public removeListener(listener: StateChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(previousState: UIState): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState, previousState);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  /**
   * Reset state to initial values
   */
  public reset(): void {
    const previousState = { ...this.state };
    this.state = this.createInitialState();
    this.notifyListeners(previousState);
  }

  /**
   * Check if the UI is in a valid state
   */
  public isValidState(): boolean {
    return (
      // Button should be initialized if components are ready
      !this.state.components.buttonInitialized ||
      // Upload status should be initialized
      (this.state.components.uploadStatusInitialized &&
        // No conflicting states
        !(this.state.buttonState.isProcessing && this.state.uploadStatus.status === 'idle'))
    );
  }

  /**
   * Get state summary for debugging
   */
  public getStateSummary(): string {
    return `
      Upload: ${this.state.uploadStatus.status} (${this.state.uploadStatus.progress}%)
      Button: ${this.state.buttonState.isValid ? 'valid' : 'invalid'}, ${this.state.buttonState.isProcessing ? 'processing' : 'idle'}
      Notifications: ${this.state.notifications.active} active
      Dropdown: ${this.state.dropdown.isVisible ? 'visible' : 'hidden'}
      Components: ${Object.entries(this.state.components)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')}
    `.trim();
  }

  /**
   * Cleanup all listeners
   */
  public cleanup(): void {
    this.listeners.clear();
  }
}
