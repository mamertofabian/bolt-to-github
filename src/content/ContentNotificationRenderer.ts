import type {
  IContentNotificationRenderer,
  IContentUIElementFactory,
  NotificationOptions,
} from './interfaces/ContentUIInterfaces';

export class ContentNotificationRenderer implements IContentNotificationRenderer {
  private notificationElement: HTMLElement | null = null;
  private timeoutId: number | null = null;
  private elementFactory: IContentUIElementFactory;

  constructor(elementFactory: IContentUIElementFactory) {
    this.elementFactory = elementFactory;
  }

  public renderNotification(options: NotificationOptions): void {
    // Cleanup existing notification if any
    this.cleanup();

    // Create container for notification
    const container = document.createElement('div');
    container.id = 'bolt-to-github-notification-container';
    document.body.appendChild(container);

    // Create notification element
    this.notificationElement = this.elementFactory.createNotificationElement(options);
    container.appendChild(this.notificationElement);

    // Add click event to close button
    const closeButton = this.notificationElement.querySelector('button');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.cleanup());
    }

    // Auto-dismiss after duration
    const duration = options.duration || 5000;
    this.timeoutId = window.setTimeout(() => this.cleanup(), duration);
  }

  public cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const container = document.getElementById('bolt-to-github-notification-container');
    if (container) {
      document.body.removeChild(container);
    }

    this.notificationElement = null;
  }
}
