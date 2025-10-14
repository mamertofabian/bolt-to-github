/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

vi.unmock('$lib/components/ui/alert');
vi.unmock('$lib/components/ui/alert/index.ts');
vi.unmock('$lib/components/ui/alert/alert.svelte');
vi.unmock('$lib/components/ui/alert/alert-description.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const mockProjectSettingsStore = {
  subscribe: vi.fn((callback) => {
    callback({ isBoltSite: true });
    return () => {};
  }),
};

vi.mock('$lib/stores', () => ({
  projectSettingsStore: mockProjectSettingsStore,
}));

const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

const ProjectGuide = (await import('../ProjectGuide.svelte')).default;

describe('ProjectGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the main guide content', () => {
      render(ProjectGuide);

      expect(screen.getByText('Ready to Code!')).toBeInTheDocument();
      expect(screen.getByText('What You Can Do')).toBeInTheDocument();
    });

    it('should render feature list items', () => {
      render(ProjectGuide);

      expect(screen.getByText('Push Bolt projects to GitHub repositories')).toBeInTheDocument();
      expect(screen.getByText('Preview file changes before pushing')).toBeInTheDocument();
      expect(screen.getByText('Manage GitHub issues directly from Bolt')).toBeInTheDocument();
      expect(screen.getByText('Configure repository settings and branches')).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(ProjectGuide);

      expect(screen.getByRole('button', { name: /browse projects/i })).toBeInTheDocument();
    });
  });

  describe('Conditional Rendering', () => {
    it('should show bolt.new instructions when not on bolt.new', () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: false });
          return () => {};
        }
      );

      render(ProjectGuide);

      expect(screen.getByText('Create or Open a Bolt Project')).toBeInTheDocument();
      expect(
        screen.getByText(/Start a new project or open an existing project on bolt\.new/)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to bolt\.new/i })).toBeInTheDocument();
    });

    it('should show different instructions when on bolt.new', () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: true });
          return () => {};
        }
      );

      render(ProjectGuide);

      expect(screen.getByText('Create or Load a Bolt Project')).toBeInTheDocument();
      expect(screen.getByText(/You're on bolt\.new!/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /go to bolt\.new/i })).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should allow user to click Browse Projects button', async () => {
      const user = userEvent.setup();
      render(ProjectGuide);

      const browseButton = screen.getByRole('button', { name: /browse projects/i });
      expect(browseButton).toBeEnabled();

      await user.click(browseButton);
      expect(browseButton).toBeInTheDocument();
    });

    it('should open bolt.new in new tab when Go to bolt.new is clicked', async () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: false });
          return () => {};
        }
      );

      const user = userEvent.setup();
      render(ProjectGuide);

      const boltButton = screen.getByRole('button', { name: /go to bolt\.new/i });
      await user.click(boltButton);

      expect(mockWindowOpen).toHaveBeenCalledWith('https://bolt.new', '_blank');
    });

    it('should show appropriate content when not on bolt.new', () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: false });
          return () => {};
        }
      );

      render(ProjectGuide);

      expect(screen.getByText('Create or Open a Bolt Project')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to bolt\.new/i })).toBeInTheDocument();
    });

    it('should show appropriate content when on bolt.new', () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: true });
          return () => {};
        }
      );

      render(ProjectGuide);

      expect(screen.getByText('Create or Load a Bolt Project')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /go to bolt\.new/i })).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(ProjectGuide);

      const mainHeading = screen.getByRole('heading', { name: 'Ready to Code!' });
      expect(mainHeading).toBeInTheDocument();

      const featuresHeading = screen.getByRole('heading', { name: 'What You Can Do' });
      expect(featuresHeading).toBeInTheDocument();
    });

    it('should have accessible button names and roles', () => {
      render(ProjectGuide);

      const browseButton = screen.getByRole('button', { name: /browse projects/i });
      expect(browseButton).toBeInTheDocument();
      expect(browseButton).toBeEnabled();
    });

    it('should have descriptive text for screen readers', () => {
      render(ProjectGuide);

      expect(screen.getByText(/Your extension is configured and ready to use/)).toBeInTheDocument();
    });

    it('should have proper button accessibility when on bolt.new', () => {
      mockProjectSettingsStore.subscribe.mockImplementation(
        (callback: (value: Record<string, unknown>) => void) => {
          callback({ isBoltSite: false });
          return () => {};
        }
      );

      render(ProjectGuide);

      const boltButton = screen.getByRole('button', { name: /go to bolt\.new/i });
      expect(boltButton).toBeInTheDocument();
      expect(boltButton).toBeEnabled();
    });

    it('should provide clear visual hierarchy with headings', () => {
      render(ProjectGuide);

      expect(screen.getByRole('heading', { name: 'Ready to Code!' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'What You Can Do' })).toBeInTheDocument();

      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
