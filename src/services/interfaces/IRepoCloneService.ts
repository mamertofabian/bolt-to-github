/**
 * Interface for repository cloning service
 */
export interface IRepoCloneService {
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
  cloneRepoContents(
    sourceOwner: string,
    sourceRepo: string,
    targetOwner: string,
    targetRepo: string,
    branch?: string,
    onProgress?: (progress: number) => void
  ): Promise<void>;
}
