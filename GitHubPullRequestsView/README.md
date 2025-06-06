# PullRequestsView
HTML webpage to quickly see the Team's open and closed pull requests. Similar to Gerrit

To use, create a GitHub API token (Settings -> Developer Settings -> Personal access tokens (classic)) with full "repo" permissions. Then authorize that token for the weareplanet organization.
Finally, change the content of the file next to the main html named "github_token.js" and "github_username.js" and replace the token with yours:
```
GITHUB_TOKEN = 'add_your_token_here'
```

```
GITHUB_USERNAME = 'YOUR_USERNAME'
```

Please also rename the files, where you remove the "_" from them. 

![imagem](https://github.com/user-attachments/assets/8cc34ed1-2f7b-4366-87a1-f2ad7bdbecf7)
