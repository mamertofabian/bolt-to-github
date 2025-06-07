<script lang="ts">
  import { Tabs, TabsContent } from '$lib/components/ui/tabs';
  import Header from '$lib/components/Header.svelte';
  import HomeTabContent from './HomeTabContent.svelte';
  import SettingsTabContent from './SettingsTabContent.svelte';
  import HelpTabContent from './HelpTabContent.svelte';
  import ProjectsList from '$lib/components/ProjectsList.svelte';
  import { createEventDispatcher } from 'svelte';

  export let uiState: any;
  export let githubSettings: any;
  export let projectSettings: any;
  export let projectId: string | null;
  export let settingsValid: boolean;
  export let isAuthenticationValid: boolean;
  export let isUserPremium: boolean;
  export let projectStatusRef: any;

  const dispatch = createEventDispatcher<{
    switchTab: string;
    showFileChanges: void;
    feedback: void;
    upgradeClick: any;
    newsletter: void;
    save: void;
    error: string;
    authMethodChange: string;
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

  function handleUpgradeClick(type: any) {
    dispatch('upgradeClick', type);
  }

  function handleNewsletter() {
    dispatch('newsletter');
  }

  function handleSave() {
    dispatch('save');
  }

  function handleError(error: string) {
    dispatch('error', error);
  }

  function handleAuthMethodChange(method: string) {
    dispatch('authMethodChange', method);
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
      {settingsValid}
      {isAuthenticationValid}
      on:switchTab={handleSwitchTab}
      on:showFileChanges={handleShowFileChanges}
      on:feedback={handleFeedback}
      on:upgradeClick={handleUpgradeClick}
    />
  </TabsContent>

  <TabsContent value="projects">
    <ProjectsList
      repoOwner={githubSettings.repoOwner}
      githubToken={githubSettings.githubToken}
      currentlyLoadedProjectId={projectId}
      isBoltSite={projectSettings.isBoltSite}
    />
  </TabsContent>

  <TabsContent value="settings">
    <SettingsTabContent
      {githubSettings}
      {projectId}
      {uiState}
      {isUserPremium}
      on:save={handleSave}
      on:error={(e) => handleError(e.detail)}
      on:authMethodChange={(e) => handleAuthMethodChange(e.detail)}
      on:upgradeClick={handleUpgradeClick}
      on:configurePushReminder={handleConfigurePushReminder}
    />
  </TabsContent>

  <TabsContent value="help">
    <HelpTabContent {projectSettings} on:newsletter={handleNewsletter} />
  </TabsContent>
</Tabs>
