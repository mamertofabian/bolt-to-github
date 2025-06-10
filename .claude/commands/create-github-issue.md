Create a new GitHub issue: $ARGUMENTS.

Follow these steps:

1. Parse the issue details from the arguments (title, description, labels, assignees)
2. Validate that we're in a valid Git repository with GitHub remote
3. Use `gh issue create` to create the issue with the provided details
4. Add appropriate labels if specified in the arguments
5. Assign the issue to users if specified in the arguments
6. Set milestone if specified in the arguments
7. Display the created issue URL and details
8. Optionally link to related issues or PRs if mentioned

Remember to use the GitHub CLI (`gh`) for all GitHub-related tasks and ensure proper formatting of the issue content.
