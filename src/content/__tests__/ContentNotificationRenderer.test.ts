/**
 * ContentNotificationRenderer.test.ts
 * Unit tests for the ContentNotificationRenderer component
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ContentNotificationRenderer } from '../ContentNotificationRenderer';
import type {
  IContentUIElementFactory,
  NotificationOptions,
} from '../interfaces/ContentUIInterfaces';

// Mock implementation of IContentUIElementFactory
class MockElementFactory implements IContentUIElementFactory {
  createNotificationElement = jest.fn((options: NotificationOptions) => {
    const element = document.createElement('div');
    element.className = `notification notification-${options.type}`;

    const message = document.createElement('p');
    message.textContent = options.message;
    element.appendChild(message);

    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = 'Close';
    element.appendChild(closeButton);

    return element;
  });

  // Other methods required by the interface but not used in these tests
  createUploadButton = jest.fn(() => document.createElement('button'));
  createGitHubDropdown = jest.fn(() => document.createElement('div'));
  createUploadStatusContainer = jest.fn(() => document.createElement('div'));
  createGitHubConfirmationDialog = jest.fn(() => document.createElement('div'));
}

// Skip the entire test suite if we're not in a DOM environment
// This checks if document is defined, which is true in jsdom but not in node
// const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';
// const describeOrSkip = hasDom() ? describe : describe.skip;

describe('ContentNotificationRenderer', () => {
  let renderer: ContentNotificationRenderer;
  let mockElementFactory: MockElementFactory;

  // Setup before each test
  beforeEach(() => {
    // Create a mock element factory
    mockElementFactory = new MockElementFactory();

    // Create the renderer with mock factory
    renderer = new ContentNotificationRenderer(mockElementFactory);

    // Spy on DOM methods
    jest.spyOn(document.body, 'appendChild');
    jest.spyOn(document.body, 'removeChild');
    jest.spyOn(window, 'setTimeout');
    jest.spyOn(window, 'clearTimeout');
  });

  // Cleanup after each test
  afterEach(() => {
    // Clean up any DOM elements created during tests
    renderer.cleanup();

    // Restore all mocks
    jest.restoreAllMocks();
  });

  test('should render a notification to the DOM', () => {
    // ARRANGE
    const notificationOptions: NotificationOptions = {
      type: 'info',
      message: 'Test notification message',
      duration: 3000,
    };

    // ACT
    renderer.renderNotification(notificationOptions);

    // ASSERT
    // Verify factory was called with options
    expect(mockElementFactory.createNotificationElement).toHaveBeenCalledWith(notificationOptions);

    // Verify container was added to the DOM
    const container = document.getElementById('bolt-to-github-notification-container');
    expect(container).not.toBeNull();

    // Verify notification content
    const notification = container?.querySelector('.notification-info');
    expect(notification).not.toBeNull();
    expect(notification?.textContent).toContain('Test notification message');

    // Verify setTimeout was called with correct duration
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  test('should set default duration when not provided', () => {
    // ARRANGE
    const notificationOptions: NotificationOptions = {
      type: 'success',
      message: 'Success message',
      // No duration specified
    };

    // ACT
    renderer.renderNotification(notificationOptions);

    // ASSERT
    // Verify setTimeout was called with default duration (5000ms)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  test('should close notification when close button is clicked', () => {
    // ARRANGE
    const notificationOptions: NotificationOptions = {
      type: 'error',
      message: 'Error message',
      duration: 9999, // Long duration to ensure timeout doesn't trigger during test
    };

    // ACT
    renderer.renderNotification(notificationOptions);

    // Find and click the close button
    const container = document.getElementById('bolt-to-github-notification-container');
    const closeButton = container?.querySelector('button.close-button');
    closeButton?.dispatchEvent(new MouseEvent('click'));

    // ASSERT
    // Verify clearTimeout was called
    expect(clearTimeout).toHaveBeenCalled();

    // Verify container was removed from DOM
    expect(document.getElementById('bolt-to-github-notification-container')).toBeNull();
  });

  test('should clean up existing notification before showing a new one', () => {
    // ARRANGE
    const firstNotification: NotificationOptions = {
      type: 'info',
      message: 'First notification',
    };

    const secondNotification: NotificationOptions = {
      type: 'success',
      message: 'Second notification',
    };

    // ACT
    renderer.renderNotification(firstNotification);
    const spyCleanup = jest.spyOn(renderer, 'cleanup');

    // Render a second notification
    renderer.renderNotification(secondNotification);

    // ASSERT
    // Verify cleanup was called
    expect(spyCleanup).toHaveBeenCalled();

    // Verify only the second notification exists
    const container = document.getElementById('bolt-to-github-notification-container');
    const notification = container?.querySelector('.notification');
    expect(notification?.textContent).toContain('Second notification');
    expect(notification?.textContent).not.toContain('First notification');
  });

  test('should handle cleanup when no notification exists', () => {
    // ARRANGE - No notification rendered

    // ACT
    renderer.cleanup();

    // ASSERT - Should not throw errors
    expect(document.getElementById('bolt-to-github-notification-container')).toBeNull();
  });
});
