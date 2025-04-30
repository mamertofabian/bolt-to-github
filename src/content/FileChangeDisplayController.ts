import type {
  IContentNotificationRenderer,
  IFileChangeDisplayController,
} from './interfaces/ContentUIInterfaces';
import type { MessageHandler } from './MessageHandler';
import type { FilePreviewService } from '../services/FilePreviewService';

export class FileChangeDisplayController implements IFileChangeDisplayController {
  private messageHandler: MessageHandler;
  private filePreviewService: FilePreviewService;
  private notificationRenderer: IContentNotificationRenderer;

  constructor(
    messageHandler: MessageHandler,
    filePreviewService: FilePreviewService,
    notificationRenderer: IContentNotificationRenderer
  ) {
    this.messageHandler = messageHandler;
    this.filePreviewService = filePreviewService;
    this.notificationRenderer = notificationRenderer;
  }

  public async displayFileChanges(): Promise<void> {
    try {
      // Show notification that we're refreshing and loading files
      this.notificationRenderer.renderNotification({
        type: 'info',
        message: 'Refreshing and loading project files...',
        duration: 3000,
      });

      console.group('Changed Files');
      console.log('Refreshing and loading project files...');

      // Load the current project files with a forced refresh (invalidate cache)
      // since this is a user-driven action, we always want the latest files
      const startTime = performance.now();
      await this.filePreviewService.loadProjectFiles(true); // Pass true to force refresh
      const loadTime = performance.now() - startTime;
      console.log(`Files loaded in ${loadTime.toFixed(2)}ms`);

      // Get settings to determine if we should compare with GitHub
      const { repoOwner, projectSettings } = await chrome.storage.sync.get([
        'repoOwner',
        'projectSettings',
      ]);

      // Get the current project ID from the URL
      const projectId = window.location.pathname.split('/').pop() || '';

      let changedFiles;

      // Check if GitHub comparison is possible
      if (repoOwner && projectSettings?.[projectId]) {
        const { repoName, branch } = projectSettings[projectId];
        const targetBranch = branch || 'main';

        console.log('Comparing with GitHub repository...');
        console.log(`Repository: ${repoOwner}/${repoName}, Branch: ${targetBranch}`);

        // Use GitHub comparison
        try {
          // Import GitHubService dynamically to avoid circular dependencies
          const { GitHubService } = await import('../services/GitHubService');

          // Create a new instance of GitHubService
          const token = await chrome.storage.sync.get(['githubToken']);
          const githubService = new GitHubService(token.githubToken);

          // Compare with GitHub
          changedFiles = await this.filePreviewService.compareWithGitHub(
            repoOwner,
            repoName,
            targetBranch,
            githubService
          );

          console.log('Successfully compared with GitHub repository');
        } catch (githubError) {
          console.warn(
            'Failed to compare with GitHub, falling back to local comparison:',
            githubError
          );
          // Fall back to local comparison
          changedFiles = await this.filePreviewService.getChangedFiles();
        }
      } else {
        console.log('No GitHub settings found, using local comparison only');
        // Use local comparison only
        changedFiles = await this.filePreviewService.getChangedFiles();
      }

      // Count files by status
      let addedCount = 0;
      let modifiedCount = 0;
      let unchangedCount = 0;
      let deletedCount = 0;

      changedFiles.forEach((file) => {
        switch (file.status) {
          case 'added':
            addedCount++;
            break;
          case 'modified':
            modifiedCount++;
            break;
          case 'unchanged':
            unchangedCount++;
            break;
          case 'deleted':
            deletedCount++;
            break;
        }
      });

      // Log summary
      console.log('Change Summary:');
      console.log(`- Total files: ${changedFiles.size}`);
      console.log(`- Added: ${addedCount}`);
      console.log(`- Modified: ${modifiedCount}`);
      console.log(`- Unchanged: ${unchangedCount}`);
      console.log(`- Deleted: ${deletedCount}`);

      // Log details of changed files (added and modified)
      if (addedCount > 0 || modifiedCount > 0) {
        console.log('\nChanged Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'added' || file.status === 'modified') {
            console.log(`${file.status === 'added' ? '➕' : '✏️'} ${path}`);
          }
        });
      }

      // Log deleted files if any
      if (deletedCount > 0) {
        console.log('\nDeleted Files:');
        changedFiles.forEach((file, path) => {
          if (file.status === 'deleted') {
            console.log(`❌ ${path}`);
          }
        });
      }

      console.groupEnd();

      // Show notification with summary
      this.notificationRenderer.renderNotification({
        type: 'success',
        message: `Found ${addedCount + modifiedCount} changed files. Opening file changes view...`,
        duration: 5000,
      });

      // Send file changes to popup for display
      // Convert Map to object for message passing
      const changesObject: Record<string, any> = {};
      changedFiles.forEach((value, key) => {
        changesObject[key] = value;
      });

      // Send message to open the popup with file changes
      this.messageHandler.sendMessage('OPEN_FILE_CHANGES', {
        changes: changesObject,
        projectId, // Include the projectId to identify which project these changes belong to
      });

      // Also store the changes in local storage for future retrieval
      try {
        await chrome.storage.local.set({
          storedFileChanges: { projectId, changes: changesObject },
        });
        console.log('File changes stored in local storage for future retrieval');
      } catch (storageError) {
        console.error('Failed to store file changes in local storage:', storageError);
      }
    } catch (error) {
      console.error('Error showing changed files:', error);
      this.notificationRenderer.renderNotification({
        type: 'error',
        message: `Failed to show changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000,
      });
    }
  }

  public cleanup(): void {
    // Nothing to clean up for now
  }
}
