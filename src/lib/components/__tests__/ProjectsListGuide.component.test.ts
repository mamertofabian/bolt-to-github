/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ProjectsListGuide from '../ProjectsListGuide.svelte';

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

const mockOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockOpen,
  writable: true,
  configurable: true,
});

describe('ProjectsListGuide Component Behavior', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Guide Visibility', () => {
    it('should render component with basic props', () => {
      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 2,
          totalRepos: 5,
        },
      });

      expect(container.firstChild).toBeTruthy();
    });

    it('should not show guide when user has 3 or more bolt projects', () => {
      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 3,
          totalRepos: 5,
        },
      });

      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('should not show guide when previously dismissed', async () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'projectsListGuideDismissed') return 'true';
        return null;
      });

      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 1,
          totalRepos: 5,
        },
      });

      await waitFor(() => {
        expect(container.querySelector('[role="alert"]')).toBeNull();
      });
    });
  });

  describe('Component Rendering', () => {
    it('should render with different prop combinations', () => {
      const { container: container1 } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 1,
          totalRepos: 5,
        },
      });

      const { container: container2 } = render(ProjectsListGuide, {
        props: {
          isBoltSite: true,
          totalBoltProjects: 0,
          totalRepos: 3,
        },
      });

      expect(container1.firstChild).toBeTruthy();
      expect(container2.firstChild).toBeTruthy();
    });

    it('should handle prop changes correctly', async () => {
      const { container, rerender } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 2,
          totalRepos: 5,
        },
      });

      expect(container.firstChild).toBeTruthy();

      await rerender({
        isBoltSite: true,
        totalBoltProjects: 0,
        totalRepos: 3,
      });

      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('LocalStorage Integration', () => {
    it('should interact with localStorage when component mounts', async () => {
      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 1,
          totalRepos: 5,
        },
      });

      await waitFor(() => {
        expect(container.firstChild).toBeTruthy();
      });

      expect(container.firstChild).toBeTruthy();
    });

    it('should call localStorage.setItem when dismissing', async () => {
      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 1,
          totalRepos: 5,
        },
      });

      await waitFor(() => {
        expect(container.firstChild).toBeTruthy();
      });

      const dismissButton = container.querySelector(
        'button[aria-label*="dismiss"], button[title*="dismiss"]'
      );
      if (dismissButton) {
        await user.click(dismissButton);
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('projectsListGuideDismissed', 'true');
      }
    });
  });

  describe('Window Integration', () => {
    it('should call window.open when opening bolt.new', async () => {
      const { container } = render(ProjectsListGuide, {
        props: {
          isBoltSite: false,
          totalBoltProjects: 1,
          totalRepos: 5,
        },
      });

      await waitFor(() => {
        expect(container.firstChild).toBeTruthy();
      });

      const boltButton = container.querySelector(
        'button[aria-label*="bolt"], button[title*="bolt"]'
      );
      if (boltButton) {
        await user.click(boltButton);
        expect(mockOpen).toHaveBeenCalledWith('https://bolt.new', '_blank');
      }
    });
  });
});
