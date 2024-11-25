import type { GitHubService } from "../lib/github";
import { toBase64 } from "../lib/common";
import { ZipProcessor } from "../lib/zip";
import ignore from 'ignore';

const updateStatus = async (status: 'uploading' | 'success' | 'error' | 'idle', progress: number = 0, message: string = '',
    activeTabs: Set<number>) => {
    console.log('📊 Updating status:', { status, progress, message });

    try {
        // Send status to active tabs
        const statusUpdate = {
            type: 'UPLOAD_STATUS',
            status,
            progress,
            message
        };

        // Send to all active upload tabs
        for (const tabId of activeTabs) {
            try {
                await chrome.tabs.sendMessage(tabId, statusUpdate).catch(() => {
                    // If sending fails, remove the tab from active tabs
                    activeTabs.delete(tabId);
                });
            } catch (error) {
                console.log(`Failed to send to tab ${tabId}:`, error);
            }
        }

        // Also send to popup if it's open
        try {
            await chrome.runtime.sendMessage(statusUpdate);
        } catch (error: unknown) {
            // Ignore errors when popup is closed
            if (error instanceof Error && !error.message.includes('Receiving end does not exist')) {
                console.error('Error sending to popup:', error);
            }
        }
    } catch (error: unknown) {
        console.error('Error in updateStatus:', error);
    }
}

export const processZipFile = async (blob: Blob, githubService: GitHubService, activeTabs: Set<number>) => {
    if (!githubService) {
        await updateStatus('error', 0, 'GitHub service not initialized. Please set your GitHub token.', activeTabs);
        throw new Error('GitHub service not initialized. Please set your GitHub token.');
    }

    try {
        await updateStatus('uploading', 0, 'Processing ZIP file...', activeTabs);

        console.log('🗜️ Processing ZIP file...');
        const files = await ZipProcessor.processZipBlob(blob);

        await updateStatus('uploading', 10, 'Preparing files...', activeTabs);

        const { repoOwner, repoName, branch } = await chrome.storage.sync.get([
            'repoOwner',
            'repoName',
            'branch'
        ]);

        if (!repoOwner || !repoName) {
            throw new Error('Repository details not configured');
        }

        const targetBranch = branch || 'main';
        console.log('📋 Repository details:', { repoOwner, repoName, targetBranch });

        // Ensure repository exists
        await updateStatus('uploading', 15, 'Checking repository...', activeTabs);
        await githubService.ensureRepoExists(repoOwner, repoName);

        // Process files
        const processedFiles = new Map<string, string>();
        const ig = ignore();
        
        // Check for .gitignore and initialize ignore patterns
        const gitignoreContent = files.get('.gitignore') || files.get('project/.gitignore');
        if (gitignoreContent) {
            ig.add(gitignoreContent.split('\n'));
        }

        for (const [path, content] of files.entries()) {
            if (path.endsWith('/') || !content.trim()) {
                console.log(`📁 Skipping entry: ${path}`);
                continue;
            }

            const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;
            
            // Skip if file matches gitignore patterns
            if (ig.ignores(normalizedPath)) {
                console.log(`🚫 Ignoring file: ${normalizedPath}`);
                continue;
            }

            processedFiles.set(normalizedPath, content);
        }

        await updateStatus('uploading', 20, 'Getting repository information...', activeTabs);

        // Get the current commit SHA
        const baseRef = await githubService.request('GET', `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`);
        const baseSha = baseRef.object.sha;

        const baseCommit = await githubService.request('GET', `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`);
        const baseTreeSha = baseCommit.tree.sha;

        await updateStatus('uploading', 30, 'Creating file blobs...', activeTabs);

        // Create blobs for all files
        const totalFiles = processedFiles.size;
        let completedFiles = 0;

        const treeItems = await Promise.all(
            Array.from(processedFiles.entries()).map(async ([path, content]) => {
                const blobData = await githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/blobs`, {
                    content: toBase64(content),
                    encoding: 'base64'
                });

                completedFiles++;
                const progress = 30 + Math.floor((completedFiles / totalFiles) * 30);
                await updateStatus('uploading', progress, `Creating blob ${completedFiles}/${totalFiles}...`, activeTabs);

                return {
                    path,
                    mode: '100644',
                    type: 'blob',
                    sha: blobData.sha
                };
            })
        );

        await updateStatus('uploading', 70, 'Creating tree...', activeTabs);

        // Create a new tree
        const newTree = await githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/trees`, {
            base_tree: baseTreeSha,
            tree: treeItems
        });

        await updateStatus('uploading', 80, 'Creating commit...', activeTabs);

        // Create a new commit
        const newCommit = await githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/commits`, {
            message: `Add/update files from bolt.new\n\nUploaded ${treeItems.length} files`,
            tree: newTree.sha,
            parents: [baseSha]
        });

        await updateStatus('uploading', 90, 'Updating branch...', activeTabs);

        // Update the reference
        await githubService.request('PATCH', `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`, {
            sha: newCommit.sha,
            force: false
        });

        await updateStatus('success', 100, `Successfully uploaded ${processedFiles.size} files to GitHub`, activeTabs);

        // Clear the status after a delay
        setTimeout(() => {
            updateStatus('idle', 0, '', activeTabs);
        }, 5000);

    } catch (error) {
        console.error('❌ Error uploading files:', error);
        await updateStatus(
            'error',
            0,
            `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`,
            activeTabs
        );
        throw error;
    }
}

