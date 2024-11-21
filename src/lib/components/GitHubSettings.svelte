<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
  
    export let githubToken: string;
    export let repoOwner: string;
    export let repoName: string;
    export let branch: string;
    export let status: string;
    export let isSettingsValid: boolean;
    export let onSave: () => void;
    export let onInput: () => void;
  </script>
  
  <form on:submit|preventDefault={onSave} class="space-y-4">
    <div class="space-y-2">
      <Label for="githubToken">GitHub Token</Label>
      <Input
        type="password"
        id="githubToken"
        bind:value={githubToken}
        on:input={onInput}
        placeholder="ghp_***********************************"
      />
    </div>
  
    <div class="space-y-2">
      <Label for="repoOwner">Repository Owner</Label>
      <Input
        type="text"
        id="repoOwner"
        bind:value={repoOwner}
        on:input={onInput}
        placeholder="username or organization"
      />
    </div>
  
    <div class="space-y-2">
      <Label for="repoName">Repository Name</Label>
      <Input
        type="text"
        id="repoName"
        bind:value={repoName}
        on:input={onInput}
        placeholder="repository-name"
      />
    </div>
  
    <div class="space-y-2">
      <Label for="branch">Branch</Label>
      <Input
        type="text"
        id="branch"
        bind:value={branch}
        on:input={onInput}
        placeholder="main"
      />
    </div>
  
    <Button type="submit" class="w-full" disabled={!isSettingsValid}>
      Save Settings
    </Button>
  </form>
  
  {#if status}
    <p
      class="mt-4 text-center"
      class:text-green-500={status.includes("success")}
      class:text-red-500={status.includes("Error")}
    >
      {status}
    </p>
  {/if}
  