/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import IssueCard from '../IssueCard.svelte';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('IssueCard.svelte - Component Tests', () => {
  const mockOpenIssue = {
    number: 42,
    title: 'Fix login bug',
    html_url: 'https://github.com/user/repo/issues/42',
    user: {
      login: 'testuser',
      avatar_url: 'https://example.com/avatar.png',
    },
    created_at: '2025-10-01T12:00:00Z',
    updated_at: '2025-10-05T14:30:00Z',
    comments: 5,
    state: 'open' as const,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'priority', color: 'fbca04' },
    ],
  };

  const mockClosedIssue = {
    ...mockOpenIssue,
    number: 43,
    title: 'Update documentation',
    state: 'closed' as const,
    comments: 0,
    labels: [{ name: 'documentation', color: '0075ca' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Issue Information Display', () => {
    it('should display issue title with number', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByText(/#42: Fix login bug/i)).toBeInTheDocument();
    });

    it('should display issue author', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should display relative time for recent issues', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByText(/1 weeks ago/i)).toBeInTheDocument();
    });

    it('should display comment count when comments exist', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should not display comment count when no comments', () => {
      render(IssueCard, { props: { issue: mockClosedIssue } });

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should display issue labels', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('priority')).toBeInTheDocument();
    });

    it('should display only first 3 labels with overflow indicator', () => {
      const issueWithManyLabels = {
        ...mockOpenIssue,
        labels: [
          { name: 'bug', color: 'd73a4a' },
          { name: 'priority', color: 'fbca04' },
          { name: 'enhancement', color: 'a2eeef' },
          { name: 'help wanted', color: '008672' },
          { name: 'good first issue', color: '7057ff' },
        ],
      };

      render(IssueCard, { props: { issue: issueWithManyLabels } });

      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('priority')).toBeInTheDocument();
      expect(screen.getByText('enhancement')).toBeInTheDocument();
      expect(screen.getByText('+2 more')).toBeInTheDocument();
      expect(screen.queryByText('help wanted')).not.toBeInTheDocument();
    });

    it('should display full date on hover for relative time', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      const relativeTimeElement = screen.getByText(/1 weeks ago/i);
      const parentWithTitle = relativeTimeElement.closest('[title]');
      expect(parentWithTitle).toHaveAttribute('title', '10/1/2025');
    });
  });

  describe('Issue State Behavior', () => {
    it('should show close button for open issues', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByRole('button', { name: /close issue/i })).toBeInTheDocument();
    });

    it('should not show close button for closed issues', () => {
      render(IssueCard, { props: { issue: mockClosedIssue } });

      expect(screen.queryByRole('button', { name: /close issue/i })).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should provide open in browser button', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByRole('button', { name: /open in browser/i })).toBeInTheDocument();
    });

    it('should emit open event when open button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { component } = render(IssueCard, { props: { issue: mockOpenIssue } });
      const openHandler = vi.fn();
      component.$on('open', openHandler);

      const openButton = screen.getByRole('button', { name: /open in browser/i });
      await user.click(openButton);

      expect(openHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit close event when close button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { component } = render(IssueCard, { props: { issue: mockOpenIssue } });
      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const closeButton = screen.getByRole('button', { name: /close issue/i });
      await user.click(closeButton);

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Date Formatting', () => {
    it('should format date as "today" for same day', () => {
      const todayIssue = {
        ...mockOpenIssue,
        created_at: '2025-10-11T10:00:00Z',
      };

      render(IssueCard, { props: { issue: todayIssue } });

      expect(screen.getByText(/today/i)).toBeInTheDocument();
    });

    it('should format date as "1 day ago" for yesterday', () => {
      const yesterdayIssue = {
        ...mockOpenIssue,
        created_at: '2025-10-10T12:00:00Z',
      };

      render(IssueCard, { props: { issue: yesterdayIssue } });

      expect(screen.getByText(/1 day ago/i)).toBeInTheDocument();
    });

    it('should format date with days for less than a week', () => {
      const recentIssue = {
        ...mockOpenIssue,
        created_at: '2025-10-06T12:00:00Z',
      };

      render(IssueCard, { props: { issue: recentIssue } });

      expect(screen.getByText(/5 days ago/i)).toBeInTheDocument();
    });

    it('should format date with weeks for less than a month', () => {
      const weekOldIssue = {
        ...mockOpenIssue,
        created_at: '2025-09-27T12:00:00Z',
      };

      render(IssueCard, { props: { issue: weekOldIssue } });

      expect(screen.getByText(/2 weeks ago/i)).toBeInTheDocument();
    });

    it('should format date with months for older issues', () => {
      const oldIssue = {
        ...mockOpenIssue,
        created_at: '2025-08-11T12:00:00Z',
      };

      render(IssueCard, { props: { issue: oldIssue } });

      expect(screen.getByText(/2 months ago/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      expect(screen.getByRole('button', { name: /open in browser/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /close issue/i })).toBeInTheDocument();
    });

    it('should have proper button roles', () => {
      render(IssueCard, { props: { issue: mockOpenIssue } });

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });
  });

  describe('Content Handling', () => {
    it('should handle long titles appropriately', () => {
      const issueWithLongTitle = {
        ...mockOpenIssue,
        title: 'This is a very long issue title that should be handled appropriately in the UI',
      };

      render(IssueCard, { props: { issue: issueWithLongTitle } });

      expect(screen.getByText(/#42: This is a very long issue title/i)).toBeInTheDocument();
    });

    it('should handle issue with no labels', () => {
      const issueWithoutLabels = {
        ...mockOpenIssue,
        labels: [],
      };

      render(IssueCard, { props: { issue: issueWithoutLabels } });

      expect(screen.getByText(/#42: Fix login bug/i)).toBeInTheDocument();
    });

    it('should handle issue with special characters in title', () => {
      const issueWithSpecialChars = {
        ...mockOpenIssue,
        title: 'Fix <script> & "quotes" in title',
      };

      render(IssueCard, { props: { issue: issueWithSpecialChars } });

      expect(screen.getByText(/#42: Fix <script> & "quotes" in title/i)).toBeInTheDocument();
    });
  });
});
