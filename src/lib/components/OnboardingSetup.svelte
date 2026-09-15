<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Check, ExternalLink, RefreshCw, Shield, Sparkles } from 'lucide-svelte';
  import { GITHUB_APP_AUTH_URL } from '$lib/constants';

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
  }>();

  export let githubSettings: {
    githubAppInstallationId?: number;
    githubAppUsername?: string;
    githubAppAvatarUrl?: string;
    repoOwner?: string;
  };
  export let uiState: {
    status?: string;
    hasStatus?: boolean;
    [key: string]: unknown;
  };
  export let isUserAuthenticated = true;
  export let migrationRequired = false;

  $: hasInstallation = Boolean(githubSettings.githubAppInstallationId);
  $: setupComplete = isUserAuthenticated && hasInstallation;

  function handlePrimaryAction() {
    if (!isUserAuthenticated) {
      window.open('https://bolt2github.com/login', '_blank');
      return;
    }

    if (!hasInstallation) {
      window.open(GITHUB_APP_AUTH_URL, '_blank');
      return;
    }

    dispatch('save');
  }
</script>

<div class="space-y-5">
  <div>
    <h2 class="mb-1 text-lg font-semibold text-slate-200">Connect your GitHub account</h2>
    <p class="text-sm text-slate-400">
      Sign in to Bolt2GitHub and install the GitHub App to use GitHub features.
    </p>
  </div>

  {#if migrationRequired}
    <div role="alert" class="rounded-md border border-amber-700 bg-amber-900/20 p-3">
      <p class="font-medium text-amber-200">GitHub authentication has changed</p>
      <p class="mt-1 text-sm text-amber-300">
        Personal access token support has ended. A Bolt2GitHub account is required, and the GitHub
        App is now required for repository access. Your repository and project settings have been
        preserved.
      </p>
    </div>
  {/if}

  <div class="rounded-lg border border-slate-700 p-4">
    <div class="mb-2 flex items-center gap-2">
      <Sparkles size={16} class="text-green-400" />
      <span class="font-medium text-slate-200">GitHub App</span>
      <span class="rounded bg-green-900 px-2 py-0.5 text-xs text-green-200">Required</span>
    </div>
    <p class="text-sm text-slate-400">
      Repository access is controlled by the GitHub App installation and can be changed on GitHub.
    </p>
    <div class="mt-3 flex items-center gap-3 text-xs text-slate-500">
      <span class="flex items-center gap-1"><Shield size={12} /> Scoped repository access</span>
      <span class="flex items-center gap-1"><RefreshCw size={12} /> Automatic renewal</span>
    </div>

    <div class="mt-4">
      {#if setupComplete}
        <div class="flex items-center gap-3 rounded-md border border-green-700 bg-green-900/20 p-3">
          <Check class="h-5 w-5 text-green-500" />
          {#if githubSettings.githubAppAvatarUrl}
            <img
              src={githubSettings.githubAppAvatarUrl}
              alt="GitHub profile"
              class="h-6 w-6 rounded-full"
            />
          {/if}
          <div>
            <p class="font-medium text-green-200">
              Connected as {githubSettings.githubAppUsername || 'GitHub User'}
            </p>
            <p class="text-xs text-green-300">Bolt2GitHub session and GitHub App are ready.</p>
          </div>
        </div>
      {:else if hasInstallation}
        <div class="rounded-md border border-blue-700 bg-blue-900/20 p-3">
          <p class="font-medium text-blue-200">GitHub App is installed</p>
          <p class="mt-1 text-sm text-blue-300">Sign in to Bolt2GitHub to continue.</p>
        </div>
      {:else if isUserAuthenticated}
        <div class="rounded-md border border-blue-700 bg-blue-900/20 p-3 text-sm text-blue-200">
          Install the GitHub App and choose the repositories Bolt to GitHub may access.
        </div>
      {:else}
        <div class="rounded-md border border-blue-700 bg-blue-900/20 p-3 text-sm text-blue-200">
          Sign in to Bolt2GitHub first, then connect the GitHub App.
        </div>
      {/if}
    </div>
  </div>

  {#if uiState.status}
    <div class="rounded-md border border-blue-700 bg-blue-900/20 p-3">
      <p class="text-sm text-blue-200">{uiState.status}</p>
    </div>
  {/if}

  <Button
    on:click={handlePrimaryAction}
    class="w-full bg-gradient-to-r from-green-600 to-emerald-600 py-3 text-base font-medium text-white hover:from-green-700 hover:to-emerald-700"
    disabled={setupComplete && uiState.hasStatus}
  >
    {#if !isUserAuthenticated}
      Sign in to Bolt2GitHub
      <ExternalLink class="ml-2 h-4 w-4" />
    {:else if !hasInstallation}
      Connect GitHub App
      <ExternalLink class="ml-2 h-4 w-4" />
    {:else}
      Complete Setup
      <Check class="ml-2 h-4 w-4" />
    {/if}
  </Button>
</div>
