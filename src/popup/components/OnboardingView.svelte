<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import WelcomeHero from '$lib/components/WelcomeHero.svelte';
  import OnboardingSetup from '$lib/components/OnboardingSetup.svelte';
  import type { GitHubSettingsState, ProjectSettingsState, UIState } from '$lib/stores';

  export let githubSettings: GitHubSettingsState;
  export let projectSettings: ProjectSettingsState;
  export let uiState: UIState;

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
    authMethodChange: string;
  }>();

  // Simple 2-step flow
  let currentStep: 1 | 2 = 1;

  // Create a type-compatible wrapper for uiState
  $: uiStateWrapper = {
    status: uiState.status,
    hasStatus: uiState.hasStatus,
    activeTab: uiState.activeTab,
    showTempRepoModal: uiState.showTempRepoModal,
    tempRepoData: uiState.tempRepoData,
    hasDeletedTempRepo: uiState.hasDeletedTempRepo,
    hasUsedTempRepoName: uiState.hasUsedTempRepoName,
  } as { status?: string; hasStatus?: boolean; [key: string]: unknown };

  function handleSave() {
    dispatch('save');
  }

  function handleError(error: string) {
    dispatch('error', error);
  }

  function handleAuthMethodChange(event: CustomEvent<string>) {
    dispatch('authMethodChange', event.detail);
  }

  function goToSetup() {
    currentStep = 2;
  }

  function openBoltSite() {
    window.open('https://bolt.new', '_blank');
  }
</script>

{#if currentStep === 1}
  <!-- Step 1: Compact Welcome -->
  <WelcomeHero on:start={goToSetup} />

  <!-- Option to go to bolt.new if not on the site -->
  {#if !projectSettings.isBoltSite}
    <div class="text-center mt-4">
      <Button
        variant="outline"
        size="sm"
        class="border-slate-700 hover:bg-slate-800 text-slate-400 text-sm"
        on:click={openBoltSite}
      >
        Visit bolt.new to start coding
      </Button>
    </div>
  {/if}
{:else}
  <!-- Step 2: Unified Setup -->
  <OnboardingSetup
    githubSettings={{
      authenticationMethod: githubSettings.authenticationMethod,
      githubAppInstallationId: githubSettings.githubAppInstallationId ?? undefined,
      githubAppUsername: githubSettings.githubAppUsername ?? undefined,
      githubAppAvatarUrl: githubSettings.githubAppAvatarUrl ?? undefined,
      githubToken: githubSettings.githubToken,
      repoOwner: githubSettings.repoOwner,
    }}
    uiState={uiStateWrapper}
    on:save={handleSave}
    on:error={(e) => handleError(e.detail)}
    on:authMethodChange={handleAuthMethodChange}
  />
{/if}
