/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import UploadStatus from '../UploadStatus.svelte';
import type { UploadStatusState } from '../../lib/types';

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('$lib/utils/reassuringMessages', () => ({
  getContextualMessage: vi.fn(() => 'Processing your files...'),
  getRotatingMessage: vi.fn(() => 'This usually takes a few moments'),
  resetMessageRotation: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('UploadStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Component Rendering', () => {
    it('should render without throwing errors', () => {
      const status: UploadStatusState = {
        status: 'idle',
        message: '',
        progress: 0,
      };

      expect(() => {
        render(UploadStatus, { props: { status } });
      }).not.toThrow();
    });

    it('should render the main container element', () => {
      const status: UploadStatusState = {
        status: 'idle',
        message: '',
        progress: 0,
      };

      const { container } = render(UploadStatus, { props: { status } });

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Component Behavior', () => {
    it('should render different status states without crashing', () => {
      const statuses: UploadStatusState[] = [
        { status: 'idle', message: '', progress: 0 },
        { status: 'uploading', message: '', progress: 50 },
        { status: 'success', message: '', progress: 100 },
        { status: 'error', message: '', progress: 0 },
        { status: 'loading', message: '', progress: 25 },
        { status: 'analyzing', message: '', progress: 75 },
        { status: 'complete', message: '', progress: 100 },
      ];

      statuses.forEach((status) => {
        expect(() => {
          render(UploadStatus, { props: { status } });
        }).not.toThrow();
      });
    });

    it('should handle custom messages without crashing', () => {
      const status: UploadStatusState = {
        status: 'uploading',
        message: 'Custom upload message',
        progress: 50,
      };

      expect(() => {
        render(UploadStatus, { props: { status } });
      }).not.toThrow();
    });

    it('should handle different progress values without crashing', () => {
      const progressValues = [0, 25, 50, 75, 100];

      progressValues.forEach((progress) => {
        const status: UploadStatusState = {
          status: 'uploading',
          message: '',
          progress,
        };

        expect(() => {
          render(UploadStatus, { props: { status } });
        }).not.toThrow();
      });
    });
  });
});
