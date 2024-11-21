<script lang="ts">
  import { onMount } from 'svelte';

  let githubToken = '';
  let repoOwner = '';
  let repoName = '';
  let branch = 'main';
  let status = '';
  let uploadProgress = 0;
  let uploadStatus = 'idle';
  let uploadMessage = '';
  let isSettingsValid = false;

  onMount(async () => {
    // Load settings
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

    // Check settings validity
    checkSettingsValidity();

    // Listen for upload status updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPLOAD_STATUS') {
        uploadStatus = message.status;
        uploadProgress = message.progress || 0;
        uploadMessage = message.message || '';
      }
    });
  });

  function checkSettingsValidity() {
    isSettingsValid = Boolean(
      githubToken && 
      repoOwner && 
      repoName && 
      branch
    );
  }

  async function saveSettings() {
    try {
      await chrome.storage.sync.set({
        githubToken,
        repoOwner,
        repoName,
        branch
      });
      status = 'Settings saved successfully!';
      checkSettingsValidity();
      setTimeout(() => {
        status = '';
      }, 3000);
    } catch (error) {
      status = 'Error saving settings';
      console.error(error);
    }
  }
</script>

<main class="p-4 max-w-md mx-auto">
  <h1 class="text-xl font-bold mb-4">Bolt File Processor Settings</h1>
  
  <!-- Settings Form -->
  <form on:submit|preventDefault={saveSettings} class="space-y-4">
    <div>
      <label for="githubToken" class="block text-sm font-medium mb-1">GitHub Token:</label>
      <input
        type="password"
        id="githubToken"
        bind:value={githubToken}
        on:input={checkSettingsValidity}
        class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="ghp_***********************************"
      />
    </div>
    
    <div>
      <label for="repoOwner" class="block text-sm font-medium mb-1">Repository Owner:</label>
      <input
        type="text"
        id="repoOwner"
        bind:value={repoOwner}
        on:input={checkSettingsValidity}
        class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="username or organization"
      />
    </div>
    
    <div>
      <label for="repoName" class="block text-sm font-medium mb-1">Repository Name:</label>
      <input
        type="text"
        id="repoName"
        bind:value={repoName}
        on:input={checkSettingsValidity}
        class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="repository-name"
      />
    </div>
    
    <div>
      <label for="branch" class="block text-sm font-medium mb-1">Branch:</label>
      <input
        type="text"
        id="branch"
        bind:value={branch}
        on:input={checkSettingsValidity}
        class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="main"
      />
    </div>
    
    <button
      type="submit"
      class="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors
             disabled:bg-gray-300 disabled:cursor-not-allowed"
      disabled={!isSettingsValid}
    >
      Save Settings
    </button>
  </form>
  
  {#if status}
    <p class="mt-4 text-center" class:text-green-500={status.includes('success')} class:text-red-500={status.includes('Error')}>
      {status}
    </p>
  {/if}

  <!-- Upload Status -->
  {#if uploadStatus !== 'idle'}
    <div class="mt-6 p-4 border rounded-lg bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium">
          {#if uploadStatus === 'uploading'}
            Uploading to GitHub...
          {:else if uploadStatus === 'success'}
            Upload Complete!
          {:else if uploadStatus === 'error'}
            Upload Failed
          {/if}
        </span>
        {#if uploadStatus === 'uploading'}
          <span class="text-sm text-gray-600">{uploadProgress}%</span>
        {/if}
      </div>

      <!-- Progress Bar -->
      {#if uploadStatus === 'uploading'}
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div
            class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
            style="width: {uploadProgress}%"
          ></div>
        </div>
      {/if}

      <!-- Status Message -->
      {#if uploadMessage}
        <p class="mt-2 text-sm" class:text-red-500={uploadStatus === 'error'} class:text-green-500={uploadStatus === 'success'}>
          {uploadMessage}
        </p>
      {/if}
    </div>
  {/if}
</main>
