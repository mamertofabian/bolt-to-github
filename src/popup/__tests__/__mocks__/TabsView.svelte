<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let uiState: unknown;
  export let githubSettings: unknown;
  export let projectSettings: unknown;
  export let projectId: unknown;
  export let isAuthenticationValid: unknown;
  export let isUserPremium: unknown;
  export let projectStatusRef: unknown = null;
</script>

<div role="tablist" data-testid="tabs-view">
  <button role="tab">Home</button>
  <button role="tab">Settings</button>
</div>
