<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { CREATE_TOKEN_URL } from '../../../services/GitLabService';
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-white">Quick Links</h2>
  </div>
  <div class="flex flex-col gap-2">
    <Button
      variant="outline"
      size="sm"
      class="justify-start text-sm"
      on:click={() => window.open('https://gitlab.com/users/sign_up', '_blank')}
    >
      🎯 Create GitLab Account
    </Button>
    <Button
      variant="outline"
      size="sm"
      class="justify-start text-sm"
      on:click={() => window.open(CREATE_TOKEN_URL, '_blank')}
    >
      🔑 Create Access Token
    </Button>
  </div>
  <div class="text-sm text-slate-400 space-y-2">
    <p>
      To use this extension, you'll need a GitLab account and a personal access token with the
      following scopes:
    </p>
    <ul class="list-disc list-inside space-y-1">
      <li>api</li>
      <li>read_api</li>
      <li>read_repository</li>
      <li>write_repository</li>
    </ul>
  </div>
</div>
