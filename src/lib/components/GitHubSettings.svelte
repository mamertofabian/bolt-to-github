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
    <Label for="githubToken" class="text-slate-200">GitHub Token</Label>
    <Input
      type="password"
      id="githubToken"
      bind:value={githubToken}
      on:input={onInput}
      placeholder="ghp_***********************************"
      class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
    />
  </div>

  <div class="space-y-2">
    <Label for="repoOwner" class="text-slate-200">Repository Owner</Label>
    <Input
      type="text"
      id="repoOwner"
      bind:value={repoOwner}
      on:input={onInput}
      placeholder="username or organization"
      class="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
    />
  </div>

  <div class="space-y-2">
    <Label for="repoName" class="text-slate-200">Repository Name</Label>
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
    <Label for="branch" class="text-slate-200">Branch</Label>
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
    disabled={!isSettingsValid}
  >
    Save Settings
  </Button>
</form>

{#if status}
  <p
    class="mt-4 text-center"
    class:text-green-400={status.includes("success")}
    class:text-red-400={status.includes("Error")}
  >
    {status}
  </p>
{/if}
