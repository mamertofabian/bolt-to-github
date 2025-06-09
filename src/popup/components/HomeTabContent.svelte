<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import StatusAlert from '$lib/components/StatusAlert.svelte';
  import ProjectStatus from '$lib/components/ProjectStatus.svelte';
  import ProjectGuide from '$lib/components/ProjectGuide.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { COFFEE_LINK, GITHUB_LINK, YOUTUBE_LINK } from '$lib/constants';

  export let projectStatusRef: any;
  export let projectId: string | null;
  export let githubSettings: any;
  export let isAuthenticationValid: boolean;

  const dispatch = createEventDispatcher<{
    switchTab: string;
    showFileChanges: void;
    feedback: void;
    upgradeClick: any;
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

  function handleUpgradeClick(type: any) {
    dispatch('upgradeClick', type);
  }
</script>

{#if !isAuthenticationValid}
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
