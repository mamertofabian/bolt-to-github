<!--
  GitHub App Migration Prompt Component
  Shows existing PAT users the benefits of migrating to GitHub App authentication
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { X, Shield, RefreshCw, Settings, ChevronRight } from 'lucide-svelte';
  import { ChromeStorageService } from '$lib/services/chromeStorage';

  export let onMigrate: (() => void) | null = null;
  export let onDismiss: (() => void) | null = null;
  export let show: boolean = true;

  let isDismissing = false;

  async function handleDismiss() {
    isDismissing = true;

    try {
      // Mark migration prompt as shown so it doesn't appear again
      await ChromeStorageService.markMigrationPromptShown();

      if (onDismiss) {
        onDismiss();
      }
    } catch (error) {
      console.error('Failed to dismiss migration prompt:', error);
    } finally {
      isDismissing = false;
    }
  }

  function handleMigrate() {
    if (onMigrate) {
      onMigrate();
    }
  }
</script>

{#if show}
  <div
    class="p-4 bg-gradient-to-r from-blue-900/30 to-green-900/30 border border-blue-700/50 rounded-lg mb-4"
  >
    <div class="flex items-start gap-3">
      <Shield class="w-6 h-6 text-blue-400 mt-1 flex-shrink-0" />

      <div class="flex-1">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold text-blue-200">Upgrade to GitHub App Authentication</h3>
          <Button
            variant="ghost"
            size="sm"
            class="text-slate-400 hover:text-slate-200 p-1"
            on:click={handleDismiss}
            disabled={isDismissing}
          >
            <X class="w-4 h-4" />
          </Button>
        </div>

        <p class="text-slate-300 mb-4">
          Get enhanced security and better performance with our new GitHub App authentication. Your
          existing Personal Access Token will continue to work.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div class="flex items-center gap-2 text-sm">
            <Shield class="w-4 h-4 text-green-400" />
            <span class="text-green-200">Enhanced Security</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <RefreshCw class="w-4 h-4 text-blue-400" />
            <span class="text-blue-200">Auto Token Refresh</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Settings class="w-4 h-4 text-purple-400" />
            <span class="text-purple-200">Fine-grained Permissions</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <Button class="bg-blue-600 hover:bg-blue-700 text-white" on:click={handleMigrate}>
            <span>Upgrade Now</span>
            <ChevronRight class="w-4 h-4 ml-1" />
          </Button>

          <Button
            variant="outline"
            class="text-slate-300 border-slate-600 hover:bg-slate-800"
            on:click={handleDismiss}
            disabled={isDismissing}
          >
            {isDismissing ? 'Dismissing...' : 'Maybe Later'}
          </Button>
        </div>

        <p class="text-xs text-slate-400 mt-3">
          💡 You can switch back to Personal Access Tokens anytime in the authentication settings.
        </p>
      </div>
    </div>
  </div>
{/if}
