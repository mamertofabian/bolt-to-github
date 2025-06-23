<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import StatusAlert from '$lib/components/StatusAlert.svelte';
  import ProjectStatus from '$lib/components/ProjectStatus.svelte';
  import ProjectGuide from '$lib/components/ProjectGuide.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { COFFEE_LINK, GITHUB_LINK, YOUTUBE_LINK } from '$lib/constants';
  import type { HomeTabProps, UpgradeType } from '../types';

  export let projectStatusRef: any;
  export let projectId: string | null;
  export let githubSettings: HomeTabProps['githubSettings'];
  export let isAuthenticationValid: boolean;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher<{
    switchTab: string;
    showFileChanges: void;
    feedback: void;
    upgradeClick: UpgradeType;
  }>();

  function handleSwitchTab(event: CustomEvent<string>) {
    dispatch('switchTab', event.detail);
  }

  function handleShowFileChanges() {
    dispatch('showFileChanges');
  }

  function handleFeedback() {
    dispatch('feedback');
  }

  function handleUpgradeClick(type: UpgradeType) {
    dispatch('upgradeClick', type);
  }
</script>

{#if isLoading}
  <div class="flex items-center justify-center py-8">
    <div class="flex flex-col items-center space-y-3">
      <svg
        class="h-8 w-8 animate-spin text-primary"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <p class="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
{:else if !isAuthenticationValid}
  <StatusAlert on:switchTab={handleSwitchTab} />
{:else if !projectId}
  <ProjectGuide on:switchTab={handleSwitchTab} />
{:else}
  <ProjectStatus
    bind:this={projectStatusRef}
    {projectId}
    gitHubUsername={githubSettings.repoOwner}
    repoName={githubSettings.repoName}
    branch={githubSettings.branch}
    token={githubSettings.githubToken}
    on:switchTab={handleSwitchTab}
    on:showFileChanges={handleShowFileChanges}
    {handleUpgradeClick}
  />
{/if}

<div class="mt-6 space-y-4">
  <SocialLinks {GITHUB_LINK} {YOUTUBE_LINK} {COFFEE_LINK} on:feedback={handleFeedback} />
</div>
