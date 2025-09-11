# PullRequestsView

HTML webpage to quickly see the Team's open and closed pull requests. Similar to Gerrit.

## Features

- View all open and closed pull requests for a GitHub organization
- Easy-to-use interface for team collaboration
- Responsive design that works on different screen sizes

## Setup Instructions

### 1. Create GitHub Personal Access Token

To use this application, you need to create a GitHub API token with the following permissions:
- Full "repo" permissions

You can create a personal access token by navigating to:
GitHub Settings → Developer Settings → Personal access tokens (classic)

### 2. Authorize Token for Organization

Authorize your newly created token for the `weareplanet` organization.

### 3. Configure Credentials

Replace the placeholder values in the following files with your actual credentials:

**File: `_github_token.js`**
```javascript
GITHUB_TOKEN = 'add_your_token_here'
```

**File: `_github_username.js`**
```javascript
GITHUB_USERNAME = 'YOUR_USERNAME'
```

### 4. Rename Configuration Files

After updating the credential files, please rename them by removing the underscore prefix:
- `github_token.js` (instead of `_github_token.js`)
- `github_username.js` (instead of `_github_username.js`)

## Usage

Open `index.html` in your web browser to view the pull requests.

## Screenshot

![PullRequestsView Interface](https://github.com/user-attachments/assets/8cc34ed1-2f7b-4366-87a1-f2ad7bdbecf7)

## Technologies Used

This project uses:
- HTML5
- CSS3 (with modern and classic themes)
- JavaScript ES6+
- GitHub API v3
- Pako library for gzip compression
