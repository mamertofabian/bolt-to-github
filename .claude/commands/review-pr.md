Please analyze and review the GitHub Pull Request: $ARGUMENTS.

Follow these steps:

1. Retrieve the PR comments using `gh pr view` on the fork repository
2. Check if the code changes adheres to the referenced GitHub issue if any.
3. If there are unit tests created, make sure it is testing the behavior, not implementation details.
4. Check for critical bugs and possible issues
5. List down your suggestions with category, suggestion title, description, and code snippet. Rate each suggestion's importance from 1-10, classifying the suggestion's impact (Low, Medium, High) based on the suggestion importance score.
6. Make sure to not go beyond the scope but feel free to mention reminders and things to watch out for.
7. Add the review/suggestions as a new PR comment.

Remember to use the GitHub CLI (`gh`) for all GitHub-related tasks.
