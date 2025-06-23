import { extractProjectIdFromUrl, getCurrentProjectId, isProjectPage } from '../projectId';

// Mock window.location
const mockLocation = (href: string, pathname: string = '') => {
  Object.defineProperty(window, 'location', {
    value: { href, pathname },
    writable: true,
  });
};

describe('projectId utility functions', () => {
  describe('extractProjectIdFromUrl', () => {
    it('should extract project ID from bolt.new URL', () => {
      const testCases = [
        {
          url: 'https://bolt.new/~/abc123',
          expected: 'abc123',
        },
        {
          url: 'https://bolt.new/~/my-project-456',
          expected: 'my-project-456',
        },
        {
          url: 'https://bolt.new/~/project_with_underscores',
          expected: 'project_with_underscores',
        },
        {
          url: 'https://bolt.new/~/simple?query=param',
          expected: 'simple',
        },
        {
          url: 'https://bolt.new/~/with-hash#section',
          expected: 'with-hash',
        },
        {
          url: 'https://bolt.new/~/complex?query=param&other=value#section',
          expected: 'complex',
        },
      ];

      testCases.forEach(({ url, expected }) => {
        expect(extractProjectIdFromUrl(url)).toBe(expected);
      });
    });

    it('should return null for non-project URLs', () => {
      const testCases = [
        'https://bolt.new',
        'https://bolt.new/',
        'https://bolt.new/home',
        'https://example.com/~/not-bolt',
        'https://bolt.dev/project/old-format',
        'https://bolt.new/not-tilde/project',
        '',
      ];

      testCases.forEach((url) => {
        expect(extractProjectIdFromUrl(url)).toBeNull();
      });
    });

    it('should use current URL when no URL provided', () => {
      mockLocation('https://bolt.new/~/test-current');
      expect(extractProjectIdFromUrl()).toBe('test-current');
    });
  });

  describe('getCurrentProjectId', () => {
    it('should return current project ID from window.location', () => {
      mockLocation('https://bolt.new/~/current-project');
      expect(getCurrentProjectId()).toBe('current-project');
    });

    it('should return null when not on project page', () => {
      mockLocation('https://bolt.new/home');
      expect(getCurrentProjectId()).toBeNull();
    });
  });

  describe('isProjectPage', () => {
    it('should return true for project pages', () => {
      const projectUrls = [
        'https://bolt.new/~/abc123',
        'https://bolt.new/~/my-project?query=param',
        'https://bolt.new/~/project#section',
      ];

      projectUrls.forEach((url) => {
        expect(isProjectPage(url)).toBe(true);
      });
    });

    it('should return false for non-project pages', () => {
      const nonProjectUrls = ['https://bolt.new', 'https://bolt.new/home', 'https://example.com'];

      nonProjectUrls.forEach((url) => {
        expect(isProjectPage(url)).toBe(false);
      });
    });

    it('should use current URL when no URL provided', () => {
      mockLocation('https://bolt.new/~/test-page');
      expect(isProjectPage()).toBe(true);

      mockLocation('https://bolt.new/home');
      expect(isProjectPage()).toBe(false);
    });
  });
});
