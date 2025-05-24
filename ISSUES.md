### Issues

These are quick issues that I've found while testing the extension. These will be added as a GitHub issue later, unless it was fixed in the meantime.

- [BUG] After importing a private repository, clicking on use the same repository name uses the default branch, not the imported branch
- [IMPROVEMENT] Refactor the GitHubSettings.svelte component (633 lines is too long)
- [IMPROVEMENT] Refactor the ProjectsList.svelte component (631 lines is too long)
- [IMPROVEMENT] Add pagination to the ProjectsList.svelte component
- [CHECK] Check the auto-delete functionality of the temporary repository
- [IMPROVEMENT] Use ConfirmationDialog.svelte when importing a repository
- [BUG] Subscription status is not persisting and depends much on the consistent calls to the B2G API. Once authenticated from bolt2github.com, the extension should save the refresh token and use it to stay authenticated independently of the landing page.
