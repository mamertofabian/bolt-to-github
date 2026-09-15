<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Check, ExternalLink, Shield } from 'lucide-svelte';
  import { GITHUB_APP_AUTH_URL } from '$lib/constants';

  export let repoOwner: string;
  export let githubAppInstallationId: number | null = null;
  export let githubAppUsername: string | null = null;
  export let githubAppAvatarUrl: string | null = null;
  export let migrationRequired = false;

  let storedMigrationRequired = false;

  $: showMigrationRequired = migrationRequired || storedMigrationRequired;

  function connectGitHubApp() {
    window.open(GITHUB_APP_AUTH_URL, '_blank');
  }

  void chrome.storage.local
    .get('githubAppMigrationRequired')
    .then((storage) => {
      storedMigrationRequired = storage.githubAppMigrationRequired === true;
    })
    .catch(() => {
      storedMigrationRequired = false;
    });
</script>

<div class="space-y-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
  <div>
    <h2 class="text-lg font-semibold text-slate-200">GitHub Connection</h2>
    <p class="text-sm text-slate-400">GitHub App account connection</p>
  </div>

  <p class="text-xs text-slate-400">
    Repository mappings are configured per project from Home or Projects.
  </p>

  {#if showMigrationRequired}
    <div role="alert" class="rounded-md border border-amber-700 bg-amber-900/20 p-3">
      <p class="font-medium text-amber-200">GitHub App is now required</p>
      <p class="mt-1 text-sm text-amber-300">
        Connect the GitHub App to continue. Your existing project mappings are preserved. Manage
        repository and branch settings from Home or Projects.
      </p>
    </div>
  {/if}

  {#if githubAppInstallationId}
    <div class="flex items-center gap-3 rounded-md border border-green-700 bg-green-900/20 p-3">
      <Check class="h-5 w-5 text-green-500" />
      {#if githubAppAvatarUrl}
        <img src={githubAppAvatarUrl} alt="GitHub profile" class="h-6 w-6 rounded-full" />
      {/if}
      <div>
        <p class="font-medium text-green-200">
          Connected as {githubAppUsername || repoOwner || 'GitHub User'}
        </p>
        <p class="text-xs text-green-300">Repository access is managed by the GitHub App.</p>
      </div>
    </div>
  {:else}
    <div class="space-y-3 rounded-md border border-blue-700 bg-blue-900/20 p-3">
      <div class="flex items-start gap-2">
        <Shield class="mt-0.5 h-4 w-4 text-blue-300" />
        <p class="text-sm text-blue-200">
          Install the GitHub App and choose the repositories this extension may access.
        </p>
      </div>
      <Button
        type="button"
        class="bg-blue-600 text-white hover:bg-blue-700"
        on:click={connectGitHubApp}
      >
        Connect GitHub App
        <ExternalLink class="ml-2 h-4 w-4" />
      </Button>
    </div>
  {/if}
</div>
