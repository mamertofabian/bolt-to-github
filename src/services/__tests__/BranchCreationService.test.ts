/**
 * Test Suite for BranchCreationService
 *
 * Following TDD approach - tests written before implementation
 */

import { BranchCreationService } from '../BranchCreationService';
import type { UnifiedGitHubService } from '../UnifiedGitHubService';

// Mock UnifiedGitHubService
const createMockGitHubService = (): jest.Mocked<UnifiedGitHubService> => ({
  createBranchFromCommit: vi.fn(),
  checkBranchExists: vi.fn(),
  getCommit: vi.fn(),
} as unknown as jest.Mocked<UnifiedGitHubService>);

describe('BranchCreationService', () => {
  let service: BranchCreationService;
  let mockGitHubService: jest.Mocked<UnifiedGitHubService>;

  beforeEach(() => {
    mockGitHubService = createMockGitHubService();
    service = new BranchCreationService(mockGitHubService);
  });

  describe('validateBranchName', () => {
    it('should accept valid branch names', () => {
      const validNames = [
        'feature-branch',
        'feature/new-feature',
        'bugfix/issue-123',
        'release-1.0',
        'hotfix_urgent',
      ];

      validNames.forEach((name) => {
        expect(service.validateBranchName(name)).toBe(true);
      });
    });

    it('should reject invalid branch names', () => {
      const invalidNames = [
        'feature branch', // spaces
        'feature..branch', // double dots
        'feature~branch', // tilde
        'feature^branch', // caret
        'feature:branch', // colon
        'feature?branch', // question mark
        'feature*branch', // asterisk
        'feature[branch]', // brackets
        '.feature', // starts with dot
        'feature.', // ends with dot
        'feature.lock', // ends with .lock
        '',
      ];

      invalidNames.forEach((name) => {
        expect(service.validateBranchName(name)).toBe(false);
      });
    });

    it('should reject branch names that are too long', () => {
      const longName = 'a'.repeat(256);
      expect(service.validateBranchName(longName)).toBe(false);
    });
  });

  describe('createBranchFromCommit', () => {
    it('should successfully create a branch from a commit', async () => {
      mockGitHubService.checkBranchExists.mockResolvedValue(false);
      mockGitHubService.createBranchFromCommit.mockResolvedValue({
        success: true,
        branch: 'new-branch',
      });
      mockGitHubService.getCommit.mockResolvedValue({
        sha: 'abc123',
        commit: {
          message: 'Test commit',
          author: { name: 'Test', email: 'test@example.com', date: '2025-10-18' },
          committer: { name: 'Test', email: 'test@example.com', date: '2025-10-18' },
          tree: { sha: 'tree123', url: 'https://...' },
          url: 'https://...',
          comment_count: 0,
        },
        node_id: 'node1',
        url: 'https://...',
        html_url: 'https://...',
        author: { login: 'testuser', id: 1, avatar_url: 'https://...', type: 'User' },
        committer: { login: 'testuser', id: 1, avatar_url: 'https://...', type: 'User' },
        parents: [],
      });

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'new-branch'
      );

      expect(result.success).toBe(true);
      expect(result.branch).toBe('new-branch');
      expect(mockGitHubService.checkBranchExists).toHaveBeenCalledWith(
        'owner',
        'repo',
        'new-branch'
      );
      expect(mockGitHubService.createBranchFromCommit).toHaveBeenCalledWith(
        'owner',
        'repo',
        'abc123',
        'new-branch'
      );
    });

    it('should fail when branch name is invalid', async () => {
      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'invalid name'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid branch name');
      expect(mockGitHubService.createBranchFromCommit).not.toHaveBeenCalled();
    });

    it('should fail when branch already exists', async () => {
      mockGitHubService.checkBranchExists.mockResolvedValue(true);

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'existing-branch'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch already exists');
      expect(mockGitHubService.createBranchFromCommit).not.toHaveBeenCalled();
    });

    it('should suggest alternative names when branch exists', async () => {
      mockGitHubService.checkBranchExists.mockResolvedValue(true);

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'feature-branch'
      );

      expect(result.success).toBe(false);
      expect(result.suggestedName).toBeDefined();
      expect(result.suggestedName).toMatch(/^feature-branch-\d+$/);
    });

    it('should fail when commit does not exist', async () => {
      mockGitHubService.checkBranchExists.mockResolvedValue(false);
      mockGitHubService.getCommit.mockRejectedValue(new Error('Commit not found'));

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'invalid-sha',
        'new-branch'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Commit not found');
    });

    it('should handle GitHub API errors', async () => {
      mockGitHubService.checkBranchExists.mockResolvedValue(false);
      mockGitHubService.createBranchFromCommit.mockResolvedValue({
        success: false,
        error: 'API rate limit exceeded',
      });

      const result = await service.createBranchFromCommit(
        'owner',
        'repo',
        'abc123',
        'new-branch'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });
  });

  describe('suggestBranchName', () => {
    it('should suggest a unique branch name with timestamp', () => {
      const baseName = 'feature-branch';
      const suggested = service.suggestBranchName(baseName);

      expect(suggested).toMatch(/^feature-branch-\d+$/);
    });

    it('should handle branch names with special characters', () => {
      const baseName = 'feature/new-feature';
      const suggested = service.suggestBranchName(baseName);

      expect(suggested).toMatch(/^feature\/new-feature-\d+$/);
    });
  });
});
