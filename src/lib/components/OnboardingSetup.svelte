<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Check,
    Sparkles,
    ExternalLink,
    Lock,
    Shield,
    RefreshCw,
    HelpCircle,
  } from 'lucide-svelte';
  import { GITHUB_APP_AUTH_URL, TUTORIAL_LINK, CREATE_TOKEN_URL } from '$lib/constants';
  import { githubSettingsActions } from '$lib/stores/githubSettings';

  const dispatch = createEventDispatcher<{
    save: void;
    error: string;
    authMethodChange: string;
  }>();

  export let githubSettings: {
    authenticationMethod?: 'pat' | 'github_app';
    githubAppInstallationId?: number;
    githubAppUsername?: string;
    githubAppAvatarUrl?: string;
    githubToken?: string;
    repoOwner?: string;
  };
  export let uiState: {
    status?: string;
    hasStatus?: boolean;
    [key: string]: unknown;
  };

  // Default to GitHub App authentication when component mounts
  onMount(() => {
    githubSettingsActions.setAuthenticationMethod('github_app');
    handleAuthMethodChange('github_app');
  });

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
    // Clear any previous status on input
  }

  // Determine if setup is complete
  $: isSetupComplete =
    (githubSettings.authenticationMethod === 'github_app' &&
      githubSettings.githubAppInstallationId) ||
    (githubSettings.authenticationMethod === 'pat' &&
      githubSettings.githubToken &&
      githubSettings.repoOwner);
</script>

<div class="space-y-5">
  <!-- Authentication Method Selection with Inline Tutorial -->
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-200 mb-1">Connect your GitHub account</h2>
      <p class="text-sm text-slate-400">Choose your preferred authentication method</p>
    </div>

    <div class="space-y-3">
      <!-- GitHub App Option (Recommended) -->
      <label
        class="flex items-start space-x-3 cursor-pointer p-3 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
      >
        <input
          type="radio"
          name="authMethod"
          value="github_app"
          checked={githubSettings.authenticationMethod === 'github_app' ||
            !githubSettings.authenticationMethod}
          on:change={() => handleAuthMethodChange('github_app')}
          class="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500 focus:ring-2"
        />
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <Sparkles size={16} class="text-green-400" />
            <span class="text-slate-200 font-medium">GitHub App</span>
            <span class="px-2 py-0.5 text-xs bg-green-900 text-green-200 rounded">Recommended</span>
          </div>
          <p class="text-sm text-slate-400 mb-2">
            Secure authentication with automatic token refresh
          </p>
          <div class="flex items-center gap-3 text-xs text-slate-500">
            <div class="flex items-center gap-1">
              <Shield size={12} />
              <span>Enhanced security</span>
            </div>
            <div class="flex items-center gap-1">
              <RefreshCw size={12} />
              <span>One-time setup</span>
            </div>
          </div>

          {#if githubSettings.authenticationMethod === 'github_app'}
            <div class="mt-3">
              {#if githubSettings.githubAppInstallationId}
                <!-- Connected State -->
                <div
                  class="flex items-center gap-3 p-2 bg-green-900/20 border border-green-700 rounded-md"
                >
                  <Check class="w-4 h-4 text-green-500" />
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      {#if githubSettings.githubAppAvatarUrl}
                        <img
                          src={githubSettings.githubAppAvatarUrl}
                          alt="Profile"
                          class="w-4 h-4 rounded-full"
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
                  Connect with GitHub App
                  <ExternalLink size={14} class="ml-2" />
                </Button>

                <!-- Step-by-step Guide -->
                <div class="mt-4 p-3 bg-slate-800/30 border border-slate-700 rounded-md">
                  <h4 class="text-slate-200 text-sm font-medium mb-3">What happens next:</h4>
                  <div class="space-y-2">
                    <div class="flex items-start gap-2">
                      <div
                        class="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5 flex-shrink-0"
                      >
                        1
                      </div>
                      <div>
                        <p class="text-slate-200 text-xs font-medium">
                          Click "Connect with GitHub App"
                        </p>
                        <p class="text-slate-400 text-xs">
                          Opens bolt2github.com in a new tab for secure authentication
                        </p>
                      </div>
                    </div>
                    <div class="flex items-start gap-2">
                      <div
                        class="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5 flex-shrink-0"
                      >
                        2
                      </div>
                      <div>
                        <p class="text-slate-200 text-xs font-medium">Authorize the GitHub App</p>
                        <p class="text-slate-400 text-xs">
                          Review and approve permissions on GitHub
                        </p>
                      </div>
                    </div>
                    <div class="flex items-start gap-2">
                      <div
                        class="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5 flex-shrink-0"
                      >
                        3
                      </div>
                      <div>
                        <p class="text-slate-200 text-xs font-medium">Return to the extension</p>
                        <p class="text-slate-400 text-xs">
                          Extension automatically detects connection and completes setup
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
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
            <Lock size={16} class="text-slate-400" />
            <span class="text-slate-200 font-medium">Personal Access Token</span>
            <span class="px-2 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Advanced</span>
          </div>
          <p class="text-sm text-slate-400 mb-2">
            Manually provide your GitHub token. This method requires manual token creation and
            management.
          </p>

          {#if githubSettings.authenticationMethod === 'pat'}
            <div class="mt-3 space-y-3">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <Label for="githubToken" class="text-slate-200 text-sm">GitHub Token</Label>
                  <a
                    href={CREATE_TOKEN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    title="Create a new token on GitHub"
                  >
                    <HelpCircle size={12} />
                    Create token
                  </a>
                </div>
                <div class="relative">
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
                      <Check class="h-4 w-4 text-green-500" />
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

  <!-- Repository Owner (only show for PAT) -->
  {#if githubSettings.authenticationMethod === 'pat'}
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
      />
    </div>
  {/if}

  <!-- Status Message -->
  {#if uiState.status}
    <div class="p-3 bg-blue-900/20 border border-blue-700 rounded-md">
      <p class="text-sm text-blue-200">{uiState.status}</p>
    </div>
  {/if}

  <!-- Complete Setup Button -->
  <div class="pt-2">
    <Button
      on:click={handleFinishSetup}
      class="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 text-base font-medium"
      disabled={!isSetupComplete || uiState.hasStatus}
    >
      {#if uiState.hasStatus && uiState.status && !uiState.status.includes('MAX_WRITE_OPERATIONS')}
        {uiState.status}
      {:else}
        Complete Setup
        <Check class="w-4 h-4 ml-2" />
      {/if}
    </Button>
  </div>

  <!-- Help Link -->
  <div class="text-center">
    <a
      href={TUTORIAL_LINK}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300"
    >
      <HelpCircle size={12} />
      Need help? Watch setup tutorial
    </a>
  </div>
</div>
