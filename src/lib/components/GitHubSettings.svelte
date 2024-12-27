<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { TUTORIAL_LINK } from "$lib/constants";
  import {
    AlertCircle,
    Youtube,
    Github,
    ExternalLink,
    ChevronUp,
    ChevronDown,
    Check,
    X,
  } from "lucide-svelte";
  import { onMount } from 'svelte';
  import { GitHubService } from "../../services/GitHubService";

  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;
  export let branch: string;
  export let status: string;
  export let isSettingsValid: boolean;
  export let onSave: () => void;
  export let onInput: () => void;
  export let projectId: string | null = null;
  export let projectSettings: Record<string, { repoName: string; branch: string }> = {};
  export let buttonDisabled: boolean = false;

  const GITHUB_SIGNUP_URL = "https://github.com/signup";
  const CREATE_TOKEN_URL =
    "https://github.com/settings/tokens/new?scopes=repo&description=Bolt%20to%20GitHub";

  let showNewUserGuide = true;
  let isValidatingToken = false;
  let isTokenValid: boolean | null = null;
  let tokenValidationTimeout: number;
  let validationError: string | null = null;

  onMount(() => {
    chrome.storage.local.get(['showNewUserGuide'], (result) => {
      showNewUserGuide = result.showNewUserGuide ?? true;
    });
  });

  function toggleNewUserGuide() {
    showNewUserGuide = !showNewUserGuide;
    chrome.storage.local.set({ showNewUserGuide });
  }

  async function validateSettings() {
    if (!githubToken) {
      isTokenValid = null;
      validationError = null;
      return;
    }

    try {
      isValidatingToken = true;
      validationError = null;
      const githubService = new GitHubService(githubToken);
      const result = await githubService.validateTokenAndUser(repoOwner);
      isTokenValid = result.isValid;
      validationError = result.error || null;
    } catch (error) {
      console.error('Error validating settings:', error);
      isTokenValid = false;
      validationError = 'Validation failed';
    } finally {
      isValidatingToken = false;
    }
  }

  function handleTokenInput() {
    onInput();
    isTokenValid = null;
    validationError = null;
    
    // Clear existing timeout
    if (tokenValidationTimeout) {
      clearTimeout(tokenValidationTimeout);
    }
    
    // Debounce validation to avoid too many API calls
    tokenValidationTimeout = setTimeout(() => {
      validateSettings();
    }, 500) as unknown as number;
  }

  function handleOwnerInput() {
    onInput();
    if (githubToken) {
      handleTokenInput(); // This will trigger validation of both token and username
    }
  }

  $: if (projectId && projectSettings[projectId]) {
    repoName = projectSettings[projectId].repoName;
    branch = projectSettings[projectId].branch;
  }
</script>

<div class="space-y-6">
  <!-- Quick Links Section -->
  <div class="rounded-lg bg-slate-800/50 border border-slate-700">
    <button
      on:click={toggleNewUserGuide}
      class="w-full p-4 flex items-center justify-between text-left"
    >
      <h3 class="font-medium text-slate-200 flex items-center gap-2">
        <AlertCircle size={16} />
        New to GitHub?
      </h3>
      {#if showNewUserGuide}
        <ChevronUp
          size={16}
          class="transition-transform duration-300 text-slate-400"
        />
      {:else}
        <ChevronDown
          size={16}
          class="transition-transform duration-300 text-slate-400"
        />
      {/if}
    </button>
    {#if showNewUserGuide}
      <div class="px-4 pb-4 space-y-2">
        <div class="space-y-2 text-sm text-slate-400">
          <p>Follow these steps to get started:</p>
          <ol class="list-decimal list-inside space-y-1 ml-2">
            <li>
              <a
                href={GITHUB_SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                Create a GitHub account
                <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a
                href={CREATE_TOKEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                Generate a GitHub token
                <ExternalLink size={12} />
              </a>
            </li>
          </ol>
        </div>
        <div
          class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700"
        >
          <a
            href={TUTORIAL_LINK}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
          >
            <Youtube size={16} />
            Watch Setup Tutorial
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300"
          >
            <Github size={16} />
            Visit GitHub
          </a>
        </div>
      </div>
    {/if}
  </div>

  <!-- Settings Form -->
  <form on:submit|preventDefault={onSave} class="space-y-4">
    <div class="space-y-2">
      <Label for="githubToken" class="text-slate-200">
        GitHub Token
        <span class="text-sm text-slate-400 ml-2">(Required for uploading)</span>
      </Label>
      <div class="relative">
        <Input
          type="password"
          id="githubToken"
          bind:value={githubToken}
          on:input={handleTokenInput}
          placeholder="ghp_***********************************"
          class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500 pr-10"
        />
        {#if githubToken}
          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            {#if isValidatingToken}
              <div class="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" />
            {:else if isTokenValid === true}
              <Check class="h-4 w-4 text-green-500" />
            {:else if isTokenValid === false}
              <X class="h-4 w-4 text-red-500" />
            {/if}
          </div>
        {/if}
      </div>
      {#if validationError}
        <p class="text-sm text-red-400 mt-1">{validationError}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="repoOwner" class="text-slate-200">
        Repository Owner
        <span class="text-sm text-slate-400 ml-2">(Your GitHub username)</span>
      </Label>
      <Input
        type="text"
        id="repoOwner"
        bind:value={repoOwner}
        on:input={handleOwnerInput}
        placeholder="username or organization"
        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      />
    </div>

    <div class="space-y-2">
      <Label for="repoName" class="text-slate-200">
        Repository Name
        <span class="text-sm text-slate-400 ml-2">
          {#if projectId}
            (Project-specific repository)
          {:else}
            (Default repository)
          {/if}
        </span>
      </Label>
      <Input
        type="text"
        id="repoName"
        bind:value={repoName}
        on:input={onInput}
        placeholder="repository-name"
        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      />
    </div>

    <div class="space-y-2">
      <Label for="branch" class="text-slate-200">
        Branch
        <span class="text-sm text-slate-400 ml-2">(Usually "main")</span>
      </Label>
      <Input
        type="text"
        id="branch"
        bind:value={branch}
        on:input={onInput}
        placeholder="main"
        class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      />
    </div>

    <Button
      type="submit"
      class="w-full bg-blue-600 hover:bg-blue-700 text-white"
      disabled={buttonDisabled || isValidatingToken || !githubToken || !repoOwner || !repoName || !branch || isTokenValid === false}
    >
      {#if isValidatingToken}
        Validating...
      {:else if buttonDisabled}
        {status}
      {:else}
        Save Settings
      {/if}
    </Button>
  </form>
</div>
