<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let githubToken: string = '';
  export let repoOwner: string = '';
  export let repoName: string = '';
</script>

{#if show}
  <div data-testid="issue-manager">Issue Manager</div>
{/if}
