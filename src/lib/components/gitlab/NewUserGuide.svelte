<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { CREATE_TOKEN_URL } from '../../../services/GitLabService';
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <h3 class="text-lg font-medium">Welcome to Bolt to GitLab! 👋</h3>
    <p class="text-sm text-slate-400">
      To get started, you'll need to set up your GitLab access token.
    </p>
  </div>

  <div class="space-y-2">
    <h4 class="font-medium">Quick Setup Steps:</h4>
    <ol class="ml-4 list-decimal text-sm text-slate-400 space-y-2">
      <li>
        Visit the <a
          href={CREATE_TOKEN_URL}
          target="_blank"
          class="text-blue-400 hover:underline">GitLab token creation page</a
        >
      </li>
      <li>Set a name for your token (e.g., "Bolt to GitLab")</li>
      <li>
        Enable these scopes:
        <ul class="ml-4 list-disc">
          <li>api</li>
          <li>read_api</li>
          <li>read_repository</li>
          <li>write_repository</li>
        </ul>
      </li>
      <li>Click "Create token" and copy your new token</li>
      <li>Paste the token below and set your GitLab username</li>
    </ol>
  </div>

  <div class="pt-2">
    <Button
      variant="outline"
      class="w-full border-slate-800 hover:bg-slate-800 text-slate-200"
      on:click={() => window.open(CREATE_TOKEN_URL, '_blank')}
    >
      Create GitLab Token
    </Button>
  </div>
</div>
