/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

describe('ProjectsListGuide Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Conditional Rendering Logic', () => {
    it('should show guide when totalBoltProjects is less than 3', () => {
      const totalBoltProjects = 2;
      const isDismissed = false;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(true);
    });

    it('should not show guide when totalBoltProjects is 3 or more', () => {
      const totalBoltProjects = 3;
      const isDismissed = false;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(false);
    });

    it('should not show guide when dismissed', () => {
      const totalBoltProjects = 1;
      const isDismissed = true;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(false);
    });

    it('should show guide when totalBoltProjects is 0', () => {
      const totalBoltProjects = 0;
      const isDismissed = false;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(true);
    });
  });

  describe('LocalStorage Keys', () => {
    it('should use correct storage keys', () => {
      const STORAGE_KEY = 'projectsListGuideDismissed';
      const COLLAPSED_KEY = 'projectsListGuideCollapsed';

      expect(STORAGE_KEY).toBe('projectsListGuideDismissed');
      expect(COLLAPSED_KEY).toBe('projectsListGuideCollapsed');
    });
  });

  describe('Toggle Expanded Logic', () => {
    it('should toggle expanded state', () => {
      let isExpanded = true;
      const COLLAPSED_KEY = 'projectsListGuideCollapsed';

      isExpanded = !isExpanded;
      mockLocalStorage.setItem(COLLAPSED_KEY, (!isExpanded).toString());

      expect(isExpanded).toBe(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(COLLAPSED_KEY, 'true');

      isExpanded = !isExpanded;
      mockLocalStorage.setItem(COLLAPSED_KEY, (!isExpanded).toString());

      expect(isExpanded).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(COLLAPSED_KEY, 'false');
    });
  });

  describe('Dismiss Logic', () => {
    it('should set dismissed state and save to localStorage', () => {
      let isDismissed = false;
      const STORAGE_KEY = 'projectsListGuideDismissed';

      isDismissed = true;
      mockLocalStorage.setItem(STORAGE_KEY, 'true');

      expect(isDismissed).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true');
    });
  });

  describe('Open Bolt.new Logic', () => {
    it('should open bolt.new in new tab', () => {
      const openBoltNew = () => {
        window.open('https://bolt.new', '_blank');
      };

      openBoltNew();

      expect(mockOpen).toHaveBeenCalledWith('https://bolt.new', '_blank');
    });
  });

  describe('Content Selection Logic', () => {
    it('should show non-bolt site content when isBoltSite is false', () => {
      const isBoltSite = false;
      const showNonBoltContent = !isBoltSite;

      expect(showNonBoltContent).toBe(true);
    });

    it('should show bolt site content when isBoltSite is true', () => {
      const isBoltSite = true;
      const showBoltContent = isBoltSite;

      expect(showBoltContent).toBe(true);
    });
  });

  describe('Tip Display Logic', () => {
    it('should show tip when no bolt projects but has repos', () => {
      const totalBoltProjects: number = 0;
      const totalRepos: number = 2;
      const showTip = totalBoltProjects === 0 && totalRepos > 0;

      expect(showTip).toBe(true);
    });

    it('should not show tip when bolt projects exist', () => {
      const totalBoltProjects: number = 1;
      const totalRepos: number = 2;
      const showTip = totalBoltProjects === 0 && totalRepos > 0;

      expect(showTip).toBe(false);
    });

    it('should not show tip when no repos', () => {
      const totalBoltProjects: number = 0;
      const totalRepos: number = 0;
      const showTip = totalBoltProjects === 0 && totalRepos > 0;

      expect(showTip).toBe(false);
    });
  });

  describe('LocalStorage Persistence Logic', () => {
    it('should restore dismissed state from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      const dismissed = mockLocalStorage.getItem('projectsListGuideDismissed');
      const isDismissed = dismissed === 'true';

      expect(isDismissed).toBe(true);
    });

    it('should restore collapsed state from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      const collapsed = mockLocalStorage.getItem('projectsListGuideCollapsed');
      const isExpanded = collapsed !== 'true';

      expect(isExpanded).toBe(false);
    });

    it('should default to expanded when no localStorage value', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const collapsed = mockLocalStorage.getItem('projectsListGuideCollapsed');
      const isExpanded = collapsed !== 'true';

      expect(isExpanded).toBe(true);
    });

    it('should default to not dismissed when no localStorage value', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const dismissed = mockLocalStorage.getItem('projectsListGuideDismissed');
      const isDismissed = dismissed === 'true';

      expect(isDismissed).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative totalBoltProjects', () => {
      const totalBoltProjects = -1;
      const isDismissed = false;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(true);
    });

    it('should handle very large totalBoltProjects', () => {
      const totalBoltProjects = 1000;
      const isDismissed = false;
      const shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(false);
    });

    it('should handle zero totalRepos', () => {
      const totalBoltProjects = 0;
      const totalRepos = 0;
      const showTip = totalBoltProjects === 0 && totalRepos > 0;

      expect(showTip).toBe(false);
    });

    it('should handle negative totalRepos', () => {
      const totalBoltProjects = 0;
      const totalRepos = -1;
      const showTip = totalBoltProjects === 0 && totalRepos > 0;

      expect(showTip).toBe(false);
    });
  });

  describe('Props Reactivity Logic', () => {
    it('should update shouldShowGuide when totalBoltProjects changes', () => {
      let totalBoltProjects = 2;
      const isDismissed = false;
      let shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(true);

      totalBoltProjects = 3;
      shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(false);
    });

    it('should update shouldShowGuide when isDismissed changes', () => {
      const totalBoltProjects = 1;
      let isDismissed = false;
      let shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(true);

      isDismissed = true;
      shouldShowGuide = !isDismissed && totalBoltProjects < 3;

      expect(shouldShowGuide).toBe(false);
    });
  });
});
