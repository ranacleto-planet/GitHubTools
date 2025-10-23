import os
import requests
import sys

# ==============================================================================
#      Script to Create a New Branch on GitHub via the API using Python
# ==============================================================================

# --- CONFIGURATION ---
GITHUB_TOKEN="TOKEN"

# The owner of the repositories (your GitHub username or organization name)
GITHUB_OWNER = "weareplanet"

# Define your environments here.
# Each key is an environment name, and its value is a list of repository names.
ENVIRONMENTS = {
    "TaxFree": [
        "te-taxfree-android-native",
        "te-common-android",
        "te-common-pax",
        "te-common-utils"        
    ],
    "Launcher": [
        "te-launcher-android-pax",
        "te-common-android",
        "te-common-utils"
    ],
    "TE_PAX": [
        "te-payment-controller-pax",
        "te-payment-core",
        "te-payment-screens-resources",
        "te-payment-screens-unsigned",
        "te-common-android",
        "te-common-pax",
        "te-common-ssl",
        "te-common-utils"        
    ],
    "TE_3CPOS": [
        "te-payment-3cpos-ui",
        "te-payment-controller-7816",
        "te-payment-core",
        "te-payment-screens-resources",
        "te-payment-screens-unsigned",
        "te-common-ssl",
        "te-common-utils"
    ],
    "TE_Worldline_Samoa": [
        "te-payment-controller-wl-samoa",
        "te-payment-controller-wl-samoa-applevas",
        "te-payment-controller-wl-samoa-jni-logger",
        "te-payment-controller-wl-samoa-jni-utils",
        "te-payment-controller-wl-samoa-jtlsserver",
        "te-payment-controller-wl-samoa-logger",
        "te-payment-controller-wl-samoa-maps",
        "te-payment-controller-wl-samoa-printer",
        "te-payment-core",
        "te-common-bouncycastle",
        "te-payment-screens-resources",
        "te-payment-screens-unsigned",
        "te-payment-screens-signed"
    ],
    "TE_Worldline_Spica": [
        "te-payment-controller-wl-spica",
        "te-payment-controller-wl-samoa",
        "te-payment-core",
        "te-common-android",
        "te-common-ssl",
        "te-common-utils",
        "te-common-bouncycastle",        
        "te-payment-screens-resources",
        "te-payment-screens-unsigned",
        "te-payment-screens-signed"
    ],
    "TE_Ingenico": [
        "te-payment-core",
        "te-payment-core-cpp",
        "te-payment-controller-tetra",
        "te-common-cppdk",
        "te-payment-screens-resources",
        "te-payment-screens-unsigned"
    ],
    "TE_VOS": [
        "te-payment-controller-vos",
        "te-common-cppdk",
        "te-payment-core-cpp",
        "te-payment-screens-resources",
        "te-payment-screens-unsigned"
    ],
    "ESCPOS": [
        "te-escpos-pax",
        "te-common-utils",
        "te-common-pax",
        "te-common-android"
    ] 
}

# The default branch to use as a base if none is provided by the user.
DEFAULT_BASE_BRANCH = "main"

# The base URL for the GitHub API
API_URL = "https://api.github.com"
# --- END CONFIGURATION ---

def create_github_branch(repo_name, new_branch, base_branch, owner, token):
    """
    Creates a new branch in a specified GitHub repository.

    This function performs two main steps:
    1. Gets the SHA hash of the latest commit on the base branch.
    2. Creates a new branch (a 'ref') pointing to that SHA.
    """
    print("--------------------------------------------------")
    print(f"➡️  Processing repository: {owner}/{repo_name}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # --- Step 1: Get the SHA of the base branch's latest commit ---
    print(f"1. Fetching SHA for head of '{base_branch}'...")
    ref_url = f"{API_URL}/repos/{owner}/{repo_name}/git/ref/heads/{base_branch}"
    
    try:
        response = requests.get(ref_url, headers=headers)
        response.raise_for_status()  # This will raise an exception for HTTP errors (4xx or 5xx)

        sha = response.json()["object"]["sha"]
        print(f"   ✅ Found SHA: {sha}")

    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching SHA for '{base_branch}' in {repo_name}: {e}")
        # Check for 404 specifically, which means the branch doesn't exist
        if response.status_code == 404:
            print(f"   Could not find the branch '{base_branch}'. Please ensure it exists.")
        else:
            print(f"   Response Body: {response.text}")
            print("   Please check repository name, owner, and token permissions.")
        return False

    # --- Step 2: Create the new branch (ref) pointing to that SHA ---
    print(f"2. Creating new branch '{new_branch}'...")
    create_ref_url = f"{API_URL}/repos/{owner}/{repo_name}/git/refs"
    payload = {
        "ref": f"refs/heads/{new_branch}",
        "sha": sha,
    }

    try:
        response = requests.post(create_ref_url, headers=headers, json=payload)
        
        if response.status_code == 201: # 201 Created
            print(f"✅ Successfully created branch '{new_branch}' from '{base_branch}' in {owner}/{repo_name}")
            print("")
            return True
        elif response.status_code == 422: # 422 Unprocessable Entity (branch likely exists)
            print(f"⚠️  Branch '{new_branch}' already exists in {owner}/{repo_name}.")
            print("")
            return True 
        else:
            response.raise_for_status()

    except requests.exceptions.RequestException as e:
        print(f"❌ Error creating branch in {repo_name}: {e}")
        print(f"   Response Body: {response.text}")
        return False

    return False


def main():
    """Main function to drive the script."""
    
    # 1. Let the user select an environment
    env_names = list(ENVIRONMENTS.keys())
    print("Please select an environment to create branches in:")
    for i, name in enumerate(env_names):
        print(f"  {i + 1}. {name}")

    selected_env_name = None
    while not selected_env_name:
        try:
            choice = input(f"Enter your choice (1-{len(env_names)}): ")
            choice_index = int(choice) - 1
            if 0 <= choice_index < len(env_names):
                selected_env_name = env_names[choice_index]
            else:
                print("Invalid number. Please try again.")
        except ValueError:
            print("Invalid input. Please enter a number.")
    
    selected_repos = ENVIRONMENTS[selected_env_name]
    
    
    # 2. Get the desired branch name from user input
    new_branch_name = input("Enter the name for the new branch: ")
    if not new_branch_name:
        print("❌ Error: Branch name cannot be empty.")
        sys.exit(1)

    # 3. Get the base branch, with a default value
    prompt = f"Enter the base branch name (default: {DEFAULT_BASE_BRANCH}): "
    selected_base_branch = input(prompt) or DEFAULT_BASE_BRANCH


    # 4. --- CONFIRMATION STEP ---
    print("\n" + "="*50)
    print("           PLEASE CONFIRM YOUR ACTION")
    print("="*50)
    print(f"  Environment:      {selected_env_name}")
    print(f"  New Branch Name:  {new_branch_name}")
    print(f"  Base Branch:      {selected_base_branch}")
    print("\nThis action will create the new branch in the following repositories:")
    for repo in selected_repos:
        print(f"  - {GITHUB_OWNER}/{repo}")
    print("="*50)

    confirm = input("\nAre you sure you want to proceed? (y/n): ")
    if confirm.lower() not in ['y', 'yes']:
        print("\n❌ Operation cancelled by user.")
        sys.exit(0)
    
    # 5. Loop through the list of repositories and create the branch in each
    print(f"\n✅ Confirmation received. Starting branch creation...\n")

    all_successful = True
    for repo in selected_repos:
        success = create_github_branch(
            repo_name=repo,
            new_branch=new_branch_name,
            base_branch=selected_base_branch,
            owner=GITHUB_OWNER,
            token=GITHUB_TOKEN
        )
        if not success:
            all_successful = False
    
    if all_successful:
        print("🎉 All done! Branches created successfully.")
    else:
        print("❌ Some branches could not be created. Please review the errors above.")
        sys.exit(1)

# This makes the script executable
if __name__ == "__main__":
    main()