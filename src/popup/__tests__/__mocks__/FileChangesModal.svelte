<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let fileChanges: unknown;
</script>

{#if show}
  <div data-testid="file-changes-modal">File Changes Modal</div>
{/if}
