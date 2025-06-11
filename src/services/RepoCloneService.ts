import type { IGitHubApiClient } from './interfaces/IGitHubApiClient';
import type { IFileService } from './interfaces/IFileService';
import type { IRepoCloneService } from './interfaces/IRepoCloneService';
import { Queue } from '../lib/Queue';
import { RateLimitHandler } from './RateLimitHandler';
import { createLogger } from '../lib/utils/logger';

const logger = createLogger('RepoCloneService');

/**
 * Service for cloning repository contents
 */
export class RepoCloneService implements IRepoCloneService {
  /**
   * Creates a new RepoCloneService instance
   * @param apiClient GitHub API client
   * @param fileService File service
   */
  constructor(
    private apiClient: IGitHubApiClient,
    private fileService: IFileService
  ) {}

  /**
   * Clones repository contents from one repository to another
   * @param sourceOwner Source repository owner
   * @param sourceRepo Source repository name
   * @param targetOwner Target repository owner
   * @param targetRepo Target repository name
   * @param branch Branch name (default: 'main')
   * @param onProgress Progress callback
   * @returns Promise resolving when cloning is complete
   */
  async cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string = 'main',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const rateLimitHandler = new RateLimitHandler();
    const queue = new Queue(1); // Using a queue for serial execution

    try {
      // Ensure we have sufficient rate limit
      await this.checkRateLimit(rateLimitHandler);

      // Get all files from source repo
      const files = await this.getSourceRepoFiles(sourceOwner, sourceRepo, branch);
      const totalFiles = files.length;

      // Reset rate limit handler counter before starting batch
      rateLimitHandler.resetRequestCount();

      // Process each file
      await this.processFiles(
        files,
        sourceOwner,
        sourceRepo,
        targetOwner,
        targetRepo,
        branch,
        rateLimitHandler,
        queue,
        onProgress,
        totalFiles
      );
    } catch (error) {
      logger.error('Failed to clone repository contents:', error);
      throw new Error(
        `Failed to clone repository contents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Checks if we have sufficient rate limit and waits if necessary
   * @param rateLimitHandler Rate limit handler instance
   */
  private async checkRateLimit(rateLimitHandler: RateLimitHandler): Promise<void> {
    await rateLimitHandler.beforeRequest();
    const rateLimit = await this.apiClient.request('GET', '/rate_limit');
    const remainingRequests = rateLimit.resources.core.remaining;
    const resetTime = rateLimit.resources.core.reset;

    if (remainingRequests < 10) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = resetTime - now;

      // If reset is happening soon (within 2 minutes), wait for it
      if (waitTime <= 120) {
        logger.info(`Waiting ${waitTime} seconds for rate limit reset...`);
        await rateLimitHandler.sleep(waitTime * 1000);
        // Recheck rate limit after waiting
        const newRateLimit = await this.apiClient.request('GET', '/rate_limit');
        if (newRateLimit.resources.core.remaining < 10) {
          throw new Error('Insufficient API rate limit remaining even after waiting for reset');
        }
      } else {
        throw new Error(
          `Insufficient API rate limit remaining. Reset in ${Math.ceil(waitTime / 60)} minutes`
        );
      }
    }
  }

  /**
   * Gets all files from the source repository
   * @param owner Repository owner
   * @param repo Repository name
   * @param branch Branch name
   * @returns Promise resolving to array of file objects
   */
  private async getSourceRepoFiles(
    owner: string,
    repo: string,
    branch: string
  ): Promise<Array<{ path: string; type: string }>> {
    const response = await this.apiClient.request(
      'GET',
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );

    return response.tree.filter((item: any) => item.type === 'blob');
  }

  /**
   * Process all files from the source repository and copy them to the target
   * @param files Array of file objects to process
   * @param sourceOwner Source repository owner
   * @param sourceRepo Source repository name
   * @param targetOwner Target repository owner
   * @param targetRepo Target repository name
   * @param branch Branch name
   * @param rateLimitHandler Rate limit handler instance
   * @param queue Queue for sequential processing
   * @param onProgress Progress callback
   * @param totalFiles Total number of files to process
   */
  private async processFiles(
    files: Array<{ path: string; type: string }>,
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string,
    rateLimitHandler: RateLimitHandler,
    queue: Queue,
    onProgress?: (progress: number) => void,
    totalFiles?: number
  ): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      await queue.add(async () => {
        await this.processFile(
          file,
          sourceOwner,
          sourceRepo,
          targetOwner,
          targetRepo,
          branch,
          rateLimitHandler
        );

        // Reset request counter every 10 files to maintain burst behavior
        if ((i + 1) % 10 === 0) {
          rateLimitHandler.resetRequestCount();
        }

        if (onProgress && totalFiles) {
          const progress = ((i + 1) / totalFiles) * 100;
          onProgress(progress);
        }
      });
    }
  }

  /**
   * Process a single file, with retry logic for rate limiting
   * @param file File object to process
   * @param sourceOwner Source repository owner
   * @param sourceRepo Source repository name
   * @param targetOwner Target repository owner
   * @param targetRepo Target repository name
   * @param branch Branch name
   * @param rateLimitHandler Rate limit handler instance
   */
  private async processFile(
    file: { path: string; type: string },
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch: string,
    rateLimitHandler: RateLimitHandler
  ): Promise<void> {
    let success = false;
    while (!success) {
      try {
        // Get file content
        await rateLimitHandler.beforeRequest();
        const content = await this.apiClient.request(
          'GET',
          `/repos/${sourceOwner}/${sourceRepo}/contents/${file.path}?ref=${branch}`
        );

        // Write file using FileService
        await rateLimitHandler.beforeRequest();
        await this.fileService.writeFile(
          targetOwner,
          targetRepo,
          file.path,
          atob(content.content),
          branch,
          `Copy ${file.path} from ${sourceRepo}`
        );

        success = true;
        rateLimitHandler.resetRetryCount();
      } catch (error) {
        if (error instanceof Response && error.status === 403) {
          await rateLimitHandler.handleRateLimit(error);
        } else {
          throw error;
        }
      }
    }
  }
}
