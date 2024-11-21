<script lang="ts">
    import { onMount } from 'svelte';
  
    let githubToken = '';
    let repoOwner = '';
    let repoName = '';
    let branch = 'main';
    let status = '';
  
    onMount(async () => {
      const result = await chrome.storage.sync.get([
        'githubToken',
        'repoOwner',
        'repoName',
        'branch'
      ]);
      
      githubToken = result.githubToken || '';
      repoOwner = result.repoOwner || '';
      repoName = result.repoName || '';
      branch = result.branch || 'main';
    });
  
    async function saveSettings() {
      try {
        await chrome.storage.sync.set({
          githubToken,
          repoOwner,
          repoName,
          branch
        });
        status = 'Settings saved successfully!';
      } catch (error) {
        status = 'Error saving settings';
        console.error(error);
      }
    }
  </script>
  
  <main class="p-4">
    <h1 class="text-xl font-bold mb-4">Bolt File Processor Settings</h1>
    
    <form on:submit|preventDefault={saveSettings} class="space-y-4">
      <div>
        <label for="githubToken">GitHub Token:</label>
        <input
          type="password"
          id="githubToken"
          bind:value={githubToken}
          class="w-full p-2 border rounded"
        />
      </div>
      
      <div>
        <label for="repoOwner">Repository Owner:</label>
        <input
          type="text"
          id="repoOwner"
          bind:value={repoOwner}
          class="w-full p-2 border rounded"
        />
      </div>
      
      <div>
        <label for="repoName">Repository Name:</label>
        <input
          type="text"
          id="repoName"
          bind:value={repoName}
          class="w-full p-2 border rounded"
        />
      </div>
      
      <div>
        <label for="branch">Branch:</label>
        <input
          type="text"
          id="branch"
          bind:value={branch}
          class="w-full p-2 border rounded"
        />
      </div>
      
      <button
        type="submit"
        class="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Save Settings
      </button>
    </form>
    
    {#if status}
      <p class="mt-4 text-center" class:text-green-500={status.includes('success')} class:text-red-500={status.includes('Error')}>
        {status}
      </p>
    {/if}
  </main>