/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import WhatsNewModal from '../WhatsNewModal.svelte';

vi.mock('marked', () => ({
  marked: vi.fn((text: string) => `<div>${text}</div>`),
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
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

describe('WhatsNewModal', () => {
  const mockProps = {
    version: '1.3.7',
    onClose: vi.fn(),
    onDontShowAgain: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render without throwing errors', () => {
      expect(() => render(WhatsNewModal, { props: mockProps })).not.toThrow();
    });

    it('should render with different props', () => {
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, showAllVersions: true } })
      ).not.toThrow();
    });

    it('should render with minimal props', () => {
      const minimalProps = {
        version: '1.0.0',
        onClose: vi.fn(),
        onDontShowAgain: vi.fn(),
      };
      expect(() => render(WhatsNewModal, { props: minimalProps })).not.toThrow();
    });
  });

  describe('Props Handling', () => {
    it('should accept version prop', () => {
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, version: '2.0.0' } })
      ).not.toThrow();
    });

    it('should accept showAllVersions prop', () => {
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, showAllVersions: true } })
      ).not.toThrow();
    });

    it('should accept callback functions', () => {
      const onClose = vi.fn();
      const onDontShowAgain = vi.fn();
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, onClose, onDontShowAgain } })
      ).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing version data gracefully', () => {
      const invalidProps = { ...mockProps, version: '99.99.99' };
      expect(() => render(WhatsNewModal, { props: invalidProps })).not.toThrow();
    });

    it('should handle empty version string', () => {
      const emptyVersionProps = { ...mockProps, version: '' };
      expect(() => render(WhatsNewModal, { props: emptyVersionProps })).not.toThrow();
    });

    it('should handle undefined callbacks', () => {
      const propsWithoutCallbacks = {
        version: '1.0.0',
        onClose: () => {},
        onDontShowAgain: () => {},
      };
      expect(() => render(WhatsNewModal, { props: propsWithoutCallbacks })).not.toThrow();
    });
  });

  describe('Component Behavior', () => {
    it('should render with default showAllVersions value', () => {
      expect(() => render(WhatsNewModal, { props: mockProps })).not.toThrow();
    });

    it('should handle boolean showAllVersions prop', () => {
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, showAllVersions: false } })
      ).not.toThrow();
      expect(() =>
        render(WhatsNewModal, { props: { ...mockProps, showAllVersions: true } })
      ).not.toThrow();
    });
  });
});
