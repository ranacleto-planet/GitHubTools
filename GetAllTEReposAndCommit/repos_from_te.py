import os
import requests
from git import Repo

# Replace with your organization and token
org_name = "weareplanet"
token = "MY_TOKEN"

base_url = f"https://api.github.com"
headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json"
}

# File to be added
folder_path = ".github/workflows"
file_name = "cherrypick_workflow.yml"
branch_name = "add-cherrypick-workflow"
commit_message = "Add cherrypick workflow"
pr_title = "Add cherrypick workflow"
pr_body = "This PR adds a new GitHub Actions workflow for cherrypicking commits."

# Reviewers
reviewers = ["bgigante-planet", "varaujo-planet"]

# File to store PR URLs
output_file = "created_prs.txt"

def read_workflow_file():
    if not os.path.exists(file_name):
        print(f"Error: The file '{file_name}' does not exist in the current directory.")
        exit(1)
    with open(file_name, "r") as file:
        return file.read()

def create_branch_and_push(repo_url, repo_name, workflow_content):
    try:
        # Clone the repository
        local_path = f"./{repo_name}"
        if os.path.exists(local_path):
            print(f"Directory {local_path} already exists. Skipping clone.")
        else:
            print(f"Cloning {repo_name}...")
            Repo.clone_from(repo_url, local_path)


        repo = Repo(local_path)

        # Create a new branch
        print(f"Creating branch {branch_name} in {repo_name}...")
        repo.git.checkout("-b", branch_name)

        # Create the .github/workflows folder if it doesn't exist
        workflows_path = os.path.join(local_path, folder_path)
        os.makedirs(workflows_path, exist_ok=True)

        # Add the workflow file
        file_path = os.path.join(workflows_path, file_name)
        with open(file_path, "w") as file:
            file.write(workflow_content)

        # Commit and push the changes
        repo.git.add(folder_path)
        repo.git.commit("-m", commit_message)
        origin = repo.remote(name="origin")
        origin.push(branch_name)

        # Return the branch name for PR creation
        return branch_name
    except Exception as e:
        print(f"Error while processing {repo_name}: {e}")
        return None

def create_pull_request(repo_name, branch_name):
															 
			   
						  
    if not branch_name:
        return None
					   
	 

    try:
        pr_url = f"{base_url}/repos/{org_name}/{repo_name}/pulls"
        pr_data = {
            "title": pr_title,
            "head": branch_name,
            "base": "main",  # Replace with the default branch of your repositories, if different
            "body": pr_body
        }

        response = requests.post(pr_url, headers=headers, json=pr_data)
        if response.status_code == 201:
            pr_data = response.json()
            pr_number = pr_data["number"]
            pr_link = pr_data["html_url"]
            print(f"Pull request created for {repo_name}: {pr_link}")

            # Add reviewers
            add_reviewers(repo_name, pr_number)

            return pr_link
        else:
            print(f"Failed to create pull request for {repo_name}: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error while creating pull request for {repo_name}: {e}")
        return None

def add_reviewers(repo_name, pr_number):
    try:
        reviewers_url = f"{base_url}/repos/{org_name}/{repo_name}/pulls/{pr_number}/requested_reviewers"
        data = {"reviewers": reviewers}
							  
	 
        response = requests.post(reviewers_url, headers=headers, json=data)
        if response.status_code == 201:
            print(f"Reviewers added to PR #{pr_number} in {repo_name}.")
        else:
            print(f"Failed to add reviewers to PR #{pr_number} in {repo_name}: {response.status_code} {response.text}")
    except Exception as e:
        print(f"Error while adding reviewers to PR #{pr_number} in {repo_name}: {e}")

def main():
    # Step 1: Read the workflow file content
    workflow_content = read_workflow_file()
    
    # Step 2: Fetch repositories
    repo_url = f"{base_url}/orgs/{org_name}/repos?per_page=100"
    repos = []
    page = 1

    while True:
        print(f"Fetching page {page} of repositories...")
        response = requests.get(f"{repo_url}&page={page}", headers=headers)
        if response.status_code != 200:
            print(f"Error fetching repositories: {response.status_code} {response.text}")
            break

        data = response.json()
        if not data:
            break

        repos.extend(data)
        page += 1

    # Step 3: Filter repositories starting with "te-" and ignore "te-payment-test"
    filtered_repos = [repo for repo in repos if repo["name"].startswith("te-") and repo["name"] != "te-payment-test"]

    
    # Step 4: Create PRs for each filtered repository
    pr_urls = []
    for repo in filtered_repos:
        repo_name = repo["name"]
        repo_url = repo["clone_url"]

        print(f"Processing repository: {repo_name}")
        try:
            branch_name = create_branch_and_push(repo_url, repo_name, workflow_content)
            pr_url = create_pull_request(repo_name, branch_name)

            if pr_url:
                pr_urls.append(pr_url)
        except Exception as e:
            print(f"Skipping {repo_name} due to error: {e}")

    # Step 5: Write PR URLs to the output file
    with open(output_file, "w") as file:
        for url in pr_urls:
            file.write(url + "\n")
    print(f"\nPR URLs written to {output_file}")

if __name__ == "__main__":
    main()
