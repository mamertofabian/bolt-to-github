<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Check, X, Loader2, Settings, Sparkles, ExternalLink, CheckCircle } from 'lucide-svelte';
  import { GITHUB_APP_AUTH_URL } from '$lib/constants';

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
    authMethodChange: string;
  }>();

  export let githubSettings: any;
  export let uiState: any;

  // Simplified state for onboarding
  let isValidatingConnection = false;
  let connectionStatus: 'idle' | 'success' | 'error' = 'idle';
  let validationMessage = '';

  function handleAuthMethodChange(method: 'pat' | 'github_app') {
    dispatch('authMethodChange', method);
  }

  function handleConnectGitHubApp() {
    window.open(GITHUB_APP_AUTH_URL, '_blank');
  }

  async function handleFinishSetup() {
    dispatch('save');
  }

  function handleInput() {
    connectionStatus = 'idle';
  }

  // Determine if setup is complete
  $: isSetupComplete =
    githubSettings.repoOwner &&
    ((githubSettings.authenticationMethod === 'github_app' &&
      githubSettings.githubAppInstallationId) ||
      (githubSettings.authenticationMethod === 'pat' && githubSettings.githubToken));
</script>

<div class="space-y-6">
  <!-- Step Header -->
  <div class="text-center pb-4">
    <div
      class="inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm font-medium mb-3"
    >
      <CheckCircle class="w-4 h-4" />
      Step 3 of 3
    </div>
    <h2 class="text-xl font-semibold text-slate-200">Complete your setup</h2>
    <p class="text-sm text-slate-400 mt-2">Just a few essential details to get you started</p>
  </div>

  <form on:submit|preventDefault={handleFinishSetup} class="space-y-6">
    <!-- Authentication Method Selection -->
    <div class="space-y-4">
      <h3 class="text-sm font-medium text-slate-300">Authentication Method</h3>

      <div class="space-y-3">
        <!-- GitHub App Option -->
        <label
          class="flex items-start space-x-3 cursor-pointer p-3 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
        >
          <input
            type="radio"
            name="authMethod"
            value="github_app"
            checked={githubSettings.authenticationMethod === 'github_app'}
            on:change={() => handleAuthMethodChange('github_app')}
            class="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-2"
          />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <Sparkles size={16} class="text-green-400" />
              <span class="text-slate-200 font-medium">GitHub App</span>
              <span class="px-2 py-0.5 text-xs bg-green-900 text-green-200 rounded"
                >Recommended</span
              >
            </div>
            <p class="text-sm text-slate-400">
              Secure, automatic authentication with no token management required.
            </p>

            {#if githubSettings.authenticationMethod === 'github_app'}
              <div class="mt-3">
                {#if githubSettings.githubAppInstallationId}
                  <!-- Connected State -->
                  <div
                    class="flex items-center gap-3 p-3 bg-green-900/20 border border-green-700 rounded-md"
                  >
                    <Check class="w-5 h-5 text-green-500" />
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        {#if githubSettings.githubAppAvatarUrl}
                          <img
                            src={githubSettings.githubAppAvatarUrl}
                            alt="Profile"
                            class="w-5 h-5 rounded-full"
                          />
                        {/if}
                        <span class="text-green-200 text-sm font-medium">
                          Connected as {githubSettings.githubAppUsername || 'GitHub User'}
                        </span>
                      </div>
                    </div>
                  </div>
                {:else}
                  <!-- Connect Button -->
                  <Button
                    type="button"
                    class="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                    on:click={handleConnectGitHubApp}
                  >
                    Connect with GitHub
                    <ExternalLink size={14} class="ml-2" />
                  </Button>
                {/if}
              </div>
            {/if}
          </div>
        </label>

        <!-- Personal Access Token Option -->
        <label
          class="flex items-start space-x-3 cursor-pointer p-3 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
        >
          <input
            type="radio"
            name="authMethod"
            value="pat"
            checked={githubSettings.authenticationMethod === 'pat'}
            on:change={() => handleAuthMethodChange('pat')}
            class="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-2"
          />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-slate-200 font-medium">Personal Access Token</span>
              <span class="px-2 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Advanced</span>
            </div>
            <p class="text-sm text-slate-400">Use your own GitHub token for direct API access.</p>

            {#if githubSettings.authenticationMethod === 'pat'}
              <div class="mt-3 space-y-3">
                <div>
                  <Label for="githubToken" class="text-slate-200 text-sm">GitHub Token</Label>
                  <div class="relative mt-1">
                    <Input
                      type="password"
                      id="githubToken"
                      bind:value={githubSettings.githubToken}
                      on:input={handleInput}
                      placeholder="ghp_***********************************"
                      class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 pr-10 text-sm"
                    />
                    {#if githubSettings.githubToken}
                      <div class="absolute right-3 top-1/2 -translate-y-1/2">
                        {#if isValidatingConnection}
                          <Loader2 class="h-4 w-4 animate-spin text-slate-400" />
                        {:else if connectionStatus === 'success'}
                          <Check class="h-4 w-4 text-green-500" />
                        {:else if connectionStatus === 'error'}
                          <X class="h-4 w-4 text-red-500" />
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </label>
      </div>
    </div>

    <!-- Repository Owner -->
    <div class="space-y-2">
      <Label for="repoOwner" class="text-slate-200">
        Repository Owner
        <span class="text-sm text-slate-400 ml-1">(Your GitHub username)</span>
      </Label>
      <Input
        type="text"
        id="repoOwner"
        bind:value={githubSettings.repoOwner}
        on:input={handleInput}
        placeholder="username or organization"
        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
        readonly={githubSettings.authenticationMethod === 'github_app'}
        disabled={githubSettings.authenticationMethod === 'github_app'}
      />
      {#if githubSettings.authenticationMethod === 'github_app'}
        <p class="text-sm text-slate-400">ℹ️ Auto-filled from your GitHub App connection</p>
      {/if}
    </div>

    <!-- Status Message -->
    {#if uiState.status}
      <div class="p-3 bg-blue-900/20 border border-blue-700 rounded-md">
        <p class="text-sm text-blue-200">{uiState.status}</p>
      </div>
    {/if}

    <!-- Validation Message -->
    {#if validationMessage}
      <div class="p-3 bg-red-900/20 border border-red-700 rounded-md">
        <p class="text-sm text-red-200">{validationMessage}</p>
      </div>
    {/if}

    <!-- Finish Setup Button -->
    <div class="pt-4">
      <Button
        type="submit"
        class="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 text-base font-medium"
        disabled={!isSetupComplete || uiState.hasStatus}
      >
        {#if uiState.hasStatus && !uiState.status.includes('MAX_WRITE_OPERATIONS')}
          {uiState.status}
        {:else}
          Complete Setup & Start Building
          <Sparkles class="w-4 h-4 ml-2" />
        {/if}
      </Button>
    </div>

    <!-- Help Text -->
    <div class="text-center">
      <p class="text-xs text-slate-500">
        🎉 You're almost ready to start syncing your Bolt projects to GitHub!
      </p>
    </div>
  </form>
</div>
