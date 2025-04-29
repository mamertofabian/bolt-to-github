<!-- DiffViewer.svelte -->
<script lang="ts">
  import { FilePreviewService } from '../../services/FilePreviewService';
  import { Button } from '$lib/components/ui/button';
  import { X, Copy } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import type { DiffResult, FileChange } from '../../services/FilePreviewService';

  export let path: string;
  export let show = false;
  export let fileChange: FileChange | undefined = undefined;

  let diffResult: DiffResult | null = null;
  let isLoading = true;
  let error: string | null = null;
  let fileExtension = path.split('.').pop() || 'txt';
  let debugInfo = '';

  // Get the file preview service
  const filePreviewService = FilePreviewService.getInstance();

  onMount(async () => {
    if (show && path) {
      await loadDiff();
    }
  });

  $: if (show && path) {
    loadDiff();
  }

  async function loadDiff() {
    isLoading = true;
    error = null;
    debugInfo = '';

    try {
      console.log('Loading diff for:', path);
      console.log('File change data:', fileChange);

      // First check if we have file change data passed as prop
      if (fileChange) {
        debugInfo = `Status: ${fileChange.status}, Has content: ${Boolean(fileChange.content)}, Has previous: ${Boolean(fileChange.previousContent)}`;
        console.log(debugInfo);

        // Extract content directly from the fileChange object
        if (fileChange.status === 'added') {
          // For added files, all lines are new
          const lines = fileChange.content.split('\n');
          diffResult = {
            path,
            changes: lines.map((content, index) => ({
              type: 'added',
              content,
              lineNumber: index + 1,
            })),
          };
        } else if (fileChange.status === 'deleted' && fileChange.previousContent) {
          // For deleted files, all lines are deleted
          const lines = fileChange.previousContent.split('\n');
          diffResult = {
            path,
            changes: lines.map((content, index) => ({
              type: 'deleted',
              content,
              lineNumber: index + 1,
            })),
          };
        } else if (fileChange.status === 'modified') {
          // For modified files, we need both old and new content
          const oldContent = fileChange.previousContent || '';
          const newContent = fileChange.content;

          // Even with missing previousContent, we can show what's available
          const oldLines = oldContent.split('\n');
          const newLines = newContent.split('\n');
          const changes: DiffResult['changes'] = [];

          // If previousContent is missing, treat all as added
          if (!fileChange.previousContent) {
            newLines.forEach((line, index) => {
              changes.push({
                type: 'added',
                content: line,
                lineNumber: index + 1,
              });
            });
          } else {
            // Simple diff - consider all lines different for now
            // Mark old lines as deleted
            oldLines.forEach((line, index) => {
              changes.push({
                type: 'deleted',
                content: line,
                lineNumber: index + 1,
              });
            });

            // Mark new lines as added
            newLines.forEach((line, index) => {
              changes.push({
                type: 'added',
                content: line,
                lineNumber: index + 1,
              });
            });
          }

          // Sort by line number
          changes.sort((a, b) => a.lineNumber - b.lineNumber);

          diffResult = {
            path,
            changes,
          };
        } else if (fileChange.status === 'unchanged') {
          // For unchanged files, show the content with unchanged type
          const lines = fileChange.content.split('\n');
          diffResult = {
            path,
            changes: lines.map((content, index) => ({
              type: 'unchanged',
              content,
              lineNumber: index + 1,
            })),
          };
        }

        console.log('Calculated diff:', diffResult);
      } else {
        // Fall back to FilePreviewService if we don't have the data
        diffResult = await filePreviewService.getFileDiff(path);
      }

      // If we still don't have a diff result, show an error
      if (!diffResult || diffResult.changes.length === 0) {
        error = 'No changes could be calculated for this file.';
      }
    } catch (err) {
      console.error('Error loading diff:', err);
      error = err instanceof Error ? err.message : 'Failed to load diff';
      diffResult = null;
    } finally {
      isLoading = false;
    }
  }

  function closeModal() {
    show = false;
  }

  function copyToClipboard() {
    if (!diffResult) return;

    const diffText = diffResult.changes
      .map((change) => {
        const prefix = change.type === 'added' ? '+' : change.type === 'deleted' ? '-' : ' ';
        return `${prefix} ${change.content}`;
      })
      .join('\n');

    navigator.clipboard.writeText(diffText);
  }

  // Function to determine the CSS class for a line based on its type
  function getLineClass(type: 'added' | 'deleted' | 'unchanged'): string {
    switch (type) {
      case 'added':
        return 'bg-green-500/10 text-green-200';
      case 'deleted':
        return 'bg-red-500/10 text-red-200';
      default:
        return '';
    }
  }

  // Function to determine the prefix symbol for a line based on its type
  function getLinePrefix(type: 'added' | 'deleted' | 'unchanged'): string {
    switch (type) {
      case 'added':
        return '+';
      case 'deleted':
        return '-';
      default:
        return ' ';
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div
      class="sm:max-w-[800px] max-h-[80vh] bg-slate-900 text-slate-50 border border-slate-800 rounded-lg shadow-xl overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="flex justify-between items-center p-4 border-b border-slate-800">
        <div class="flex items-center space-x-2 overflow-hidden">
          <h2 class="text-lg font-medium truncate">
            {path}
          </h2>
        </div>
        <div class="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            title="Copy diff to clipboard"
            on:click={copyToClipboard}
            disabled={!diffResult || isLoading}
          >
            <Copy class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" title="Close" on:click={closeModal}>
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Content -->
      <div class="overflow-y-auto flex-grow p-1">
        {#if isLoading}
          <div class="flex items-center justify-center h-64">
            <p>Loading diff...</p>
          </div>
        {:else if error}
          <div class="text-red-500 p-4 border border-red-300 rounded m-4">
            <p>{error}</p>
            {#if debugInfo}
              <div class="mt-2 p-2 bg-slate-800 text-xs font-mono">
                <p>Debug info: {debugInfo}</p>
              </div>
            {/if}
          </div>
        {:else if !diffResult || diffResult.changes.length === 0}
          <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <p>No changes found in this file.</p>
            {#if debugInfo}
              <div class="mt-2 p-2 bg-slate-800 text-xs font-mono max-w-full overflow-x-auto">
                <p>Debug info: {debugInfo}</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="font-mono text-sm">
            <div class="overflow-x-auto">
              <table class="w-full border-collapse">
                <tbody>
                  {#each diffResult.changes as change}
                    <tr class={getLineClass(change.type)}>
                      <!-- Line number -->
                      <td
                        class="text-slate-500 text-right pr-2 select-none w-12 border-r border-slate-700"
                      >
                        {change.lineNumber}
                      </td>
                      <!-- Line prefix -->
                      <td class="w-6 px-2 select-none text-center">
                        <span
                          class={change.type === 'added'
                            ? 'text-green-500'
                            : change.type === 'deleted'
                              ? 'text-red-500'
                              : 'text-slate-500'}
                        >
                          {getLinePrefix(change.type)}
                        </span>
                      </td>
                      <!-- Line content -->
                      <td class="pl-2 pr-4 whitespace-pre">
                        {change.content}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body.diff-viewer-open) {
    overflow: hidden;
  }
</style>
