<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import GitHubSettings from '$lib/components/GitHubSettings.svelte';

  export let githubSettings: any;
  export let projectSettings: any;
  export let uiState: any;

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
  }>();

  function handleSave() {
    dispatch('save');
  }

  function handleError(error: string) {
    dispatch('error', error);
  }

  function openBoltSite() {
    window.open('https://bolt.new', '_blank');
  }
</script>

<div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
  <div class="space-y-2">
    {#if !projectSettings.isBoltSite}
      <Button
        variant="outline"
        class="border-slate-800 hover:bg-slate-800 text-slate-200"
        on:click={openBoltSite}
      >
        Go to bolt.new
      </Button>
    {/if}
    <p class="text-sm text-green-400">
      💡 No Bolt projects found. Create or load an existing Bolt project to get started.
    </p>
    <p class="text-sm text-green-400 pb-4">
      🌟 You can also load any of your GitHub repositories by providing your GitHub token and
      repository owner.
    </p>
    <GitHubSettings
      isOnboarding={true}
      bind:githubToken={githubSettings.githubToken}
      bind:repoName={githubSettings.repoName}
      bind:branch={githubSettings.branch}
      bind:repoOwner={githubSettings.repoOwner}
      bind:authenticationMethod={githubSettings.authenticationMethod}
      bind:githubAppInstallationId={githubSettings.githubAppInstallationId}
      bind:githubAppUsername={githubSettings.githubAppUsername}
      bind:githubAppAvatarUrl={githubSettings.githubAppAvatarUrl}
      status={uiState.status}
      buttonDisabled={uiState.hasStatus}
      onSave={handleSave}
      onError={handleError}
      onInput={() => {}}
    />
  </div>
</div>
