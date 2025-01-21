# GitHubPullRequestsView
HTML webpage to quickly see the Team's open and closed pull requests. Similar to Gerrit

To use, create a GitHub API token (Settings -> Developer Settings -> Personal access tokens (classic)) with full "repo" permissions. Then authorize that token for the weareplanet organization.
Finally, create a file next to the main html named "github_token.js" and add as content:
```
GITHUB_TOKEN = 'add_your_token_here'
```
