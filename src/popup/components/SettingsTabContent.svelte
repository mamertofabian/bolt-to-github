<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import GitHubSettings from '$lib/components/GitHubSettings.svelte';
  import PushReminderSection from './PushReminderSection.svelte';
  import PremiumStatus from './PremiumStatus.svelte';
  import AnalyticsToggle from '$lib/components/ui/AnalyticsToggle.svelte';
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('SettingsTabContent');

  export let githubSettings: any;
  export let projectId: string | null;
  export let uiState: any;
  export let isUserPremium: boolean;

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
    authMethodChange: string;
    upgradeClick: any;
    configurePushReminder: void;
  }>();

  function handleSave() {
    dispatch('save');
  }

  function handleError(error: string) {
    dispatch('error', error);
  }

  function handleAuthMethodChange(method: string) {
    dispatch('authMethodChange', method);
  }

  function handleUpgradeClick(type: any) {
    dispatch('upgradeClick', type);
  }

  function handleConfigurePushReminder() {
    logger.debug('handleConfigurePushReminder called, isUserPremium:', isUserPremium);
    if (isUserPremium) {
      dispatch('configurePushReminder');
    } else {
      logger.debug('User is not premium, calling handleUpgradeClick with pushReminders');
      handleUpgradeClick('pushReminders');
    }
  }
</script>

<div class="space-y-4">
  <GitHubSettings
    bind:githubToken={githubSettings.githubToken}
    bind:repoOwner={githubSettings.repoOwner}
    bind:repoName={githubSettings.repoName}
    bind:branch={githubSettings.branch}
    bind:authenticationMethod={githubSettings.authenticationMethod}
    bind:githubAppInstallationId={githubSettings.githubAppInstallationId}
    bind:githubAppUsername={githubSettings.githubAppUsername}
    bind:githubAppAvatarUrl={githubSettings.githubAppAvatarUrl}
    {projectId}
    status={uiState.status}
    buttonDisabled={uiState.hasStatus}
    onSave={handleSave}
    onError={handleError}
    onInput={() => {}}
    onAuthMethodChange={handleAuthMethodChange}
  />

  <!-- Push Reminder Settings -->
  <PushReminderSection on:configure={handleConfigurePushReminder} />

  <!-- Premium Status -->
  <PremiumStatus on:upgrade={() => handleUpgradeClick('general')} />

  <!-- Analytics Toggle -->
  <AnalyticsToggle />
</div>
