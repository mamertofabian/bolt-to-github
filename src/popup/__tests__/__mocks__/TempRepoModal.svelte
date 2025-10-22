<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let tempRepoData: unknown;
  export let hasDeletedTempRepo: boolean = false;
  export let hasUsedTempRepoName: boolean = false;
  export let onDeleteTempRepo: () => void = () => {};
  export let onUseTempRepoName: () => void = () => {};
  export let onDismiss: () => void = () => {};
</script>

{#if show}
  <div data-testid="temp-repo-modal">Temp Repo Modal</div>
{/if}
