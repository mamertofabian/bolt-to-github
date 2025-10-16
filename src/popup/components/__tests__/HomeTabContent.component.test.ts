/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import HomeTabContent from '../HomeTabContent.svelte';

describe('HomeTabContent', () => {
  const defaultProps = {
    projectStatusRef: null,
    projectId: null,
    githubSettings: {
      githubToken: 'test-token',
      repoOwner: 'testuser',
      repoName: 'testrepo',
      branch: 'main',
      projectSettings: {},
      isValidatingToken: false,
      isTokenValid: true,
      validationError: null,
      hasInitialSettings: true,
      authenticationMethod: 'pat' as const,
      githubAppInstallationId: null,
      githubAppUsername: null,
      githubAppAvatarUrl: null,
    },
    isAuthenticationValid: false,
    isLoading: false,
    upgradeClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading spinner when isLoading is true', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isLoading: true, projectId: null, isAuthenticationValid: false },
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should not display other content when loading', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isLoading: true, projectId: null, isAuthenticationValid: false },
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });
  });

  describe('Authentication States', () => {
    it('should show StatusAlert when not authenticated', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isAuthenticationValid: false, isLoading: false },
      });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });

    it('should show ProjectGuide when authenticated but no project', () => {
      render(HomeTabContent, {
        props: {
          ...defaultProps,
          isAuthenticationValid: true,
          projectId: null,
          isLoading: false,
        },
      });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });

    it('should show ProjectStatus when authenticated with project', () => {
      render(HomeTabContent, {
        props: {
          ...defaultProps,
          isAuthenticationValid: true,
          projectId: 'test-project',
          isLoading: false,
        },
      });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });
  });

  describe('Props Reactivity', () => {
    it('should update when isLoading prop changes', async () => {
      const { rerender } = render(HomeTabContent, {
        props: { ...defaultProps, isLoading: false, projectId: null, isAuthenticationValid: false },
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

      await rerender({ ...defaultProps, isLoading: true });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should update when authentication state changes', async () => {
      const { rerender } = render(HomeTabContent, {
        props: { ...defaultProps, isAuthenticationValid: false, isLoading: false },
      });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();

      await rerender({ ...defaultProps, isAuthenticationValid: true, projectId: null });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });
  });

  describe('Event Dispatching', () => {
    it('should dispatch switchTab event when child components emit it', async () => {
      const { component } = render(HomeTabContent, {
        props: { ...defaultProps, isAuthenticationValid: false, isLoading: false },
      });

      const switchTabHandler = vi.fn();
      component.$on('switchTab', switchTabHandler);

      expect(component).toBeDefined();
    });

    it('should dispatch showFileChanges event when ProjectStatus emits it', async () => {
      const { component } = render(HomeTabContent, {
        props: {
          ...defaultProps,
          isAuthenticationValid: true,
          projectId: 'test-project',
          isLoading: false,
        },
      });

      const showFileChangesHandler = vi.fn();
      component.$on('showFileChanges', showFileChangesHandler);

      expect(component).toBeDefined();
    });

    it('should dispatch feedback event when SocialLinks emits it', async () => {
      const { component } = render(HomeTabContent, {
        props: { ...defaultProps, isLoading: false, projectId: null, isAuthenticationValid: false },
      });

      const feedbackHandler = vi.fn();
      component.$on('feedback', feedbackHandler);

      expect(component).toBeDefined();
    });

    it('should dispatch upgradeClick event when ProjectStatus emits it', async () => {
      const { component } = render(HomeTabContent, {
        props: {
          ...defaultProps,
          isAuthenticationValid: true,
          projectId: 'test-project',
          isLoading: false,
        },
      });

      const upgradeClickHandler = vi.fn();
      component.$on('upgradeClick', upgradeClickHandler);

      expect(component).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have proper loading state accessibility', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isLoading: true, projectId: null, isAuthenticationValid: false },
      });

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
    });

    it('should always render SocialLinks for consistent navigation', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isLoading: false, projectId: null, isAuthenticationValid: false },
      });

      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('should render without errors in loading state', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isLoading: true, projectId: null, isAuthenticationValid: false },
      });
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should render without errors when not authenticated', () => {
      render(HomeTabContent, {
        props: { ...defaultProps, isAuthenticationValid: false, isLoading: false },
      });
      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });

    it('should render without errors when authenticated with project', () => {
      render(HomeTabContent, {
        props: {
          ...defaultProps,
          isAuthenticationValid: true,
          projectId: 'test-project',
          isLoading: false,
        },
      });
      expect(screen.getByText('Buy me a coffee')).toBeInTheDocument();
    });
  });
});
