/**
 * BranchCreationService
 * Handles branch creation from commits with validation
 */

import type { UnifiedGitHubService } from './UnifiedGitHubService';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('BranchCreationService');

export interface BranchCreationResult {
  success: boolean;
  branch?: string;
  error?: string;
  suggestedName?: string;
}

export class BranchCreationService {
  constructor(private githubService: UnifiedGitHubService) {}

  /**
   * Validate branch name according to Git naming rules
   * @see https://git-scm.com/docs/git-check-ref-format
   */
  validateBranchName(name: string): boolean {
    if (!name || name.length === 0 || name.length > 255) {
      return false;
    }

    // Git branch name rules:
    // - No spaces
    // - No double dots (..)
    // - No special characters: ~, ^, :, ?, *, [, ]
    // - Cannot start or end with a dot
    // - Cannot end with .lock
    const invalidPatterns = [
      /\s/, // spaces
      /\.\./, // double dots
      /[~^:?*\[\]\\]/, // special characters
      /^\./, // starts with dot
      /\.$/, // ends with dot
      /\.lock$/, // ends with .lock
    ];

    return !invalidPatterns.some((pattern) => pattern.test(name));
  }

  /**
   * Suggest an alternative branch name by appending a timestamp
   */
  suggestBranchName(baseName: string): string {
    const timestamp = Date.now();
    return `${baseName}-${timestamp}`;
  }

  /**
   * Create a branch from a commit with validation
   */
  async createBranchFromCommit(
    owner: string,
    repo: string,
    sourceSha: string,
    newBranchName: string
  ): Promise<BranchCreationResult> {
    try {
      // Validate branch name
      if (!this.validateBranchName(newBranchName)) {
        logger.warn(`Invalid branch name: ${newBranchName}`);
        return {
          success: false,
          error: 'Invalid branch name. Branch names cannot contain spaces or special characters.',
        };
      }

      // Check if branch already exists
      const branchExists = await this.githubService.checkBranchExists(owner, repo, newBranchName);
      if (branchExists) {
        logger.warn(`Branch already exists: ${newBranchName}`);
        return {
          success: false,
          error: 'Branch already exists. Please choose a different name.',
          suggestedName: this.suggestBranchName(newBranchName),
        };
      }

      // Verify the commit exists
      try {
        await this.githubService.getCommit(owner, repo, sourceSha);
      } catch (error) {
        logger.error('Commit not found:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Commit not found',
        };
      }

      // Create the branch
      const result = await this.githubService.createBranchFromCommit(
        owner,
        repo,
        sourceSha,
        newBranchName
      );

      if (result.success) {
        logger.info(`✅ Branch created successfully: ${newBranchName}`);
      } else {
        logger.error(`❌ Failed to create branch: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error('Error creating branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
