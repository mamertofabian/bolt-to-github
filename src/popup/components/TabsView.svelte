<script lang="ts">
  import { Tabs, TabsContent } from '$lib/components/ui/tabs';
  import Header from '$lib/components/Header.svelte';
  import HomeTabContent from './HomeTabContent.svelte';
  import SettingsTabContent from './SettingsTabContent.svelte';
  import HelpTabContent from './HelpTabContent.svelte';
  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import { createEventDispatcher } from 'svelte';
  import type { UIState } from '$lib/stores/uiState';
  import type { GitHubSettingsState } from '$lib/stores/githubSettings';
  import type { ProjectSettingsState } from '$lib/stores/projectSettings';
  import type { UpgradeModalType } from '$lib/utils/upgradeModal';
  import type { ProjectStatusRef, UpgradeType } from '../types';

  export let uiState: UIState;
  export let githubSettings: GitHubSettingsState;
  export let projectSettings: ProjectSettingsState;
  export let projectId: string | null;
  export let isAuthenticationValid: boolean;
  export let isUserPremium: boolean;
  export let projectStatusRef: ProjectStatusRef;

  const dispatch = createEventDispatcher<{
    switchTab: string;
    showFileChanges: void;
    feedback: void;
    upgradeClick: UpgradeModalType;
    newsletter: void;
    configurePushReminder: void;
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

  function handleUpgradeClick(event: CustomEvent<UpgradeType>) {
    // Convert UpgradeType to UpgradeModalType
    dispatch('upgradeClick', event.detail as UpgradeModalType);
  }

  function handleNewsletter() {
    dispatch('newsletter');
  }

  function handleConfigurePushReminder() {
    dispatch('configurePushReminder');
  }
</script>

<Tabs bind:value={uiState.activeTab} class="w-full">
  <Header />

  <TabsContent value="home">
    <HomeTabContent
      bind:projectStatusRef
      {projectId}
      {githubSettings}
      {isAuthenticationValid}
      isLoading={!githubSettings.hasInitialSettings || githubSettings.isValidatingToken}
      on:switchTab={handleSwitchTab}
      on:showFileChanges={handleShowFileChanges}
      on:feedback={handleFeedback}
      on:upgradeClick={handleUpgradeClick}
    />
  </TabsContent>

  <TabsContent value="projects">
    <ProjectsList
      repoOwner={githubSettings.repoOwner}
      currentlyLoadedProjectId={projectId}
      isBoltSite={projectSettings.isBoltSite}
    />
  </TabsContent>

  <TabsContent value="settings">
    <SettingsTabContent
      {githubSettings}
      {isUserPremium}
      on:upgradeClick={handleUpgradeClick}
      on:configurePushReminder={handleConfigurePushReminder}
    />
  </TabsContent>

  <TabsContent value="help">
    <HelpTabContent {projectSettings} on:newsletter={handleNewsletter} />
  </TabsContent>
</Tabs>
