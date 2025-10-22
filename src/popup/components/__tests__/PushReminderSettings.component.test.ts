/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PushReminderSettings from '../PushReminderSettings.svelte';

const mockChromeTabs = {
  query: vi.fn(),
  sendMessage: vi.fn(),
};

const mockChrome = {
  tabs: mockChromeTabs,
};

Object.defineProperty(global, 'chrome', {
  value: mockChrome,
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'chrome', {
  value: mockChrome,
  writable: true,
  configurable: true,
});

describe('PushReminderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    mockChromeTabs.query.mockResolvedValue([{ id: 1 }]);
    mockChromeTabs.sendMessage.mockResolvedValue({
      settings: {
        enabled: true,
        reminderInterval: 20,
        snoozeInterval: 10,
        minimumChanges: 3,
        maxRemindersPerSession: 5,
        scheduledEnabled: true,
        scheduledInterval: 15,
        maxScheduledPerSession: 10,
      },
      state: {
        lastReminderTime: 0,
        lastSnoozeTime: 0,
        reminderCount: 0,
        sessionStartTime: Date.now(),
        lastScheduledReminderTime: 0,
        scheduledReminderCount: 0,
      },
    });
  });

  describe('Modal Visibility', () => {
    it('should not render when show is false', () => {
      render(PushReminderSettings, { props: { show: false } });

      expect(screen.queryByText('Push Reminder Settings')).not.toBeInTheDocument();
    });

    it('should render modal when show is true', () => {
      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByText('Push Reminder Settings')).toBeInTheDocument();
    });

    it('should have accessible close button', () => {
      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle chrome API errors gracefully', () => {
      mockChromeTabs.query.mockRejectedValue(new Error('Tab query failed'));

      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByText('Push Reminder Settings')).toBeInTheDocument();
    });

    it('should handle missing tab ID gracefully', () => {
      mockChromeTabs.query.mockResolvedValue([]);

      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByText('Push Reminder Settings')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper modal structure', () => {
      render(PushReminderSettings, { props: { show: true } });

      expect(screen.getByText('Push Reminder Settings')).toBeInTheDocument();
    });

    it('should have accessible close button', () => {
      render(PushReminderSettings, { props: { show: true } });

      const closeButton = screen.getByRole('button', { name: '✕' });
      expect(closeButton).toBeInTheDocument();
    });
  });
});
