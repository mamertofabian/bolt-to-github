<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let githubSettings: unknown;
  export let projectSettings: unknown;
  export let uiState: unknown;
  export let isUserAuthenticated: unknown;
</script>

<div data-testid="onboarding-view" data-is-user-authenticated={String(isUserAuthenticated)}>
  Onboarding
</div>
