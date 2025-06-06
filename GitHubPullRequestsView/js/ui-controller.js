/*************************************************************
 * UI CONTROLLER
 * Handles UI interactions, tab switching, dark mode, and settings
 *************************************************************/

// DOM Elements - Declared globally for easy access
let tabs, tabContents, modalTabs, modalTabContents,
    projectDetailsModal, modalCloseBtn, projectDetailsSpinner,
    settingsToggle, settingsPanel, headerLoadingIndicator,
    mainStylesheetLink, themeClassicRadio, themeModernRadio; // Theme elements

/**
 * Initialize all DOM references and basic UI event listeners
 */
function initializeUIElements() {
  // Main tabs
  tabs = document.querySelectorAll('.tab');
  tabContents = document.querySelectorAll('.tab-content');

  // Modal elements
  projectDetailsModal = document.getElementById('project-details-modal');
  modalCloseBtn = document.getElementById('modal-close');
  projectDetailsSpinner = document.getElementById('project-details-spinner');
  modalTabs = document.querySelectorAll('.project-modal-tab');
  modalTabContents = document.querySelectorAll('.project-modal-tab-content');

  // Settings
  settingsToggle = document.getElementById('settings-toggle');
  settingsPanel = document.getElementById('settings-panel');

  // Header Loading
  headerLoadingIndicator = document.getElementById('header-loading');

  // Theme selection elements
  mainStylesheetLink = document.getElementById('main-stylesheet');
  themeClassicRadio = document.querySelector('input[name="theme-select"][value="classic"]');
  themeModernRadio = document.querySelector('input[name="theme-select"][value="modern"]');


  // Ensure critical elements exist
   if (!tabs.length || !tabContents.length || !projectDetailsModal || !settingsPanel) {
       console.error("Crucial UI elements missing, initialization incomplete.");
       // Optionally show an error message to the user
       // showToast("Error initializing UI components.", "error");
       return; // Prevent further setup if basic elements are missing
   }

  // Set up event listeners
  setupTabEventListeners();
  setupModalEventListeners();
  setupDarkModeToggle();
  setupGlobalRefresh(); // Initialize global refresh
  setupUserProfile(); // Initialize user profile
  setupSettingsPanel();
  setupThemeSelection(); // Initialize theme selection
  
  // Initialize global smart table toggle (after DOM is ready)
  setTimeout(() => {
    if (typeof initializeGlobalSmartTableToggle === 'function') {
      initializeGlobalSmartTableToggle();
    }
  }, 100);
}

/**
 * Set up event listeners for the main tabs and sub-tabs
 */
function setupTabEventListeners() {
  // Main tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      handleTabSwitch(tab); // Use a dedicated handler
    });
  });

  // Sub-tabs (using event delegation for efficiency)
  const myActivityTab = document.getElementById('my-activity');
  if (myActivityTab) {
      myActivityTab.addEventListener('click', (e) => {
          if (e.target.matches('.my-prs-subtabs .subtab')) {
              handleSubTabSwitch(e.target, '.my-prs-subtabs .subtab', '#my-open-prs-container, #my-closed-prs-container');
          } else if (e.target.matches('.my-reviews-subtabs .subtab')) {
              handleSubTabSwitch(e.target, '.my-reviews-subtabs .subtab', '#my-reviews-open-container, #my-reviews-closed-container');
          }
      });
  }
}

/**
 * Handles switching between main tabs
 * @param {HTMLElement} tab - The tab element that was clicked
 */
function handleTabSwitch(tab) {
    if (!tab || tab.classList.contains('active')) return; // Ignore if already active

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    tabContents.forEach(c => c.classList.remove('active'));
    const targetContent = document.getElementById(tab.dataset.tab);
    if (targetContent) {
        targetContent.classList.add('active');
    } else {
        console.warn(`Tab content for ${tab.dataset.tab} not found.`);
    }


    // Trigger data loading for the newly activated tab if needed
    loadDataForTab(tab.dataset.tab);
    
    // Update global smart table toggle button state after tab switch
    setTimeout(() => {
        if (typeof updateGlobalToggleButton === 'function') {
            updateGlobalToggleButton();
        }
    }, 200); // Small delay to allow content to render
}

/**
 * Handles switching between sub-tabs within "My Activity"
 * @param {HTMLElement} clickedButton - The sub-tab button clicked
 * @param {string} buttonSelector - Selector for all buttons in the group
 * @param {string} contentSelector - Selector for all content panels in the group
 */
function handleSubTabSwitch(clickedButton, buttonSelector, contentSelector) {
    if (!clickedButton || clickedButton.classList.contains('active')) return;

    const parentGroup = clickedButton.closest('.my-prs-subtabs, .my-reviews-subtabs');
    if (!parentGroup) return;

    // Deactivate siblings
    parentGroup.querySelectorAll(buttonSelector).forEach(b => b.classList.remove('active'));
    document.querySelectorAll(contentSelector).forEach(sc => sc.classList.remove('active'));

    // Activate clicked button and corresponding content
    clickedButton.classList.add('active');
    const targetContent = document.getElementById(clickedButton.dataset.target);
    if (targetContent) {
        targetContent.classList.add('active');
    }
    
    // Update global smart table toggle button state after sub-tab switch
    setTimeout(() => {
        if (typeof updateGlobalToggleButton === 'function') {
            updateGlobalToggleButton();
        }
    }, 200);
}


/**
 * Load data for a specific tab if it hasn't been loaded yet
 * @param {string} tabId - The ID of the tab (e.g., 'open-pr')
 */
async function loadDataForTab(tabId) {
  if (tabDataLoaded[tabId]) {
    console.log(`Tab ${tabId} data already loaded or loading.`);
    return; // Already loaded or in progress
  }

  // Mark as loading to prevent duplicate requests
  tabDataLoaded[tabId] = true; // Mark immediately to prevent race conditions
  console.log(`Initiating data load for tab: ${tabId}`);
  showLoadingIndicator(true); // Show global loading indicator

  try {
    switch (tabId) {
      case 'open-pr':
        await loadPullRequests('open');
        break;
      case 'closed-pr':
        await loadPullRequests('closed');
        break;
      case 'projects':
        await loadProjects();
        break;
      case 'my-activity':
        // My activity components are loaded initially in app.js
        // This case might be needed if lazy loading is implemented differently
        break;
      default:
        console.warn(`No data loading function defined for tab: ${tabId}`);
        tabDataLoaded[tabId] = false; // Reset if no load function
    }
     console.log(`Data loaded successfully for tab: ${tabId}`);
  } catch (error) {
    console.error(`Error loading data for tab ${tabId}:`, error);
    showToast(`Failed to load data for ${tabId.replace('-', ' ')}.`, "error");
    tabDataLoaded[tabId] = false; // Reset on error to allow retry
  } finally {
      showLoadingIndicator(false); // Hide global loading indicator
  }
}


/**
 * Show or hide the main header loading indicator
 * @param {boolean} show - True to show, false to hide
 */
function showLoadingIndicator(show) {
    if (headerLoadingIndicator) {
        headerLoadingIndicator.style.display = show ? 'block' : 'none';
    }
}

/**
 * Load the default tab on page load based on user preference
 */
function loadDefaultTab() {
  const defaultTabId = loadPreference('defaultTab', 'my-activity');
  const defaultTabElement = document.querySelector(`.tab[data-tab="${defaultTabId}"]`);

  if (defaultTabElement && defaultTabId !== 'my-activity') {
    // Switch UI immediately
    handleTabSwitch(defaultTabElement);
  } else {
    // Ensure 'my-activity' is marked as active if it's the default
    const myActivityTab = document.querySelector(`.tab[data-tab="my-activity"]`);
     if (myActivityTab) myActivityTab.classList.add('active');
     const myActivityContent = document.getElementById('my-activity');
     if (myActivityContent) myActivityContent.classList.add('active');
  }
  // Data loading for the default tab happens in initializeApp or handleTabSwitch
}

/**
 * Set up event listeners for the project details modal
 */
function setupModalEventListeners() {
  if (!modalCloseBtn || !projectDetailsModal) return;

  modalCloseBtn.addEventListener('click', closeProjectDetailsModal);

  projectDetailsModal.addEventListener('click', e => {
    // Close modal if clicking on the overlay itself
    if (e.target === projectDetailsModal) {
      closeProjectDetailsModal();
    }
  });

  // Modal tab switching using event delegation
  const modalMenu = projectDetailsModal.querySelector('.project-modal-tab-menu');
   if (modalMenu) {
       modalMenu.addEventListener('click', (e) => {
           if (e.target.matches('.project-modal-tab') && !e.target.classList.contains('active')) {
               modalTabs.forEach(t => t.classList.remove('active'));
               modalTabContents.forEach(c => c.classList.remove('active'));
               e.target.classList.add('active');
               const targetContent = document.getElementById(e.target.dataset.tab);
               if (targetContent) {
                   targetContent.classList.add('active');
               }
           }
       });
   }

   // Close modal on ESC key
   document.addEventListener('keydown', (e) => {
       if (e.key === 'Escape' && projectDetailsModal.classList.contains('active')) {
           closeProjectDetailsModal();
       }
   });
}

/** Show/Hide Project Details Spinner */
function showProjectSpinner() {
  if (projectDetailsSpinner) projectDetailsSpinner.style.display = 'flex';
}
function hideProjectSpinner() {
  if (projectDetailsSpinner) projectDetailsSpinner.style.display = 'none';
}

/** Open/Close Project Details Modal */
function openProjectDetailsModal() {
  if (projectDetailsModal) projectDetailsModal.classList.add('active');
}
function closeProjectDetailsModal() {
  if (projectDetailsModal) projectDetailsModal.classList.remove('active');
}

/**
 * Load project details into the modal (simplified error handling)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
async function loadProjectDetails(owner, repo) {
  // Reset modal tabs to default (Branches)
  modalTabs.forEach((t, index) => t.classList.toggle('active', index === 0));
  modalTabContents.forEach((c, index) => c.classList.toggle('active', index === 0));

  openProjectDetailsModal();
  showProjectSpinner();

  const branchesContainer = document.getElementById('branches-container');
  const openPrsContainer = document.getElementById('open-prs-container');
  const closedPrsContainer = document.getElementById('closed-prs-container');

  // Clear previous content
  branchesContainer.innerHTML = '<p>Loading branches...</p>';
  openPrsContainer.innerHTML = '<p>Loading open PRs...</p>';
  closedPrsContainer.innerHTML = '<p>Loading closed PRs...</p>';

  try {
    // Fetch data concurrently
    const [branchesResult, openPRsResult, closedPRsResult] = await Promise.allSettled([
      fetchProjectBranches(owner, repo),
      fetchRepoPullRequests(owner, repo, 'open'),
      fetchRepoPullRequests(owner, repo, 'closed')
    ]);

    // Render Branches
    if (branchesResult.status === 'fulfilled' && branchesResult.value.length > 0) {
        renderModalBranches(owner, repo, branchesResult.value, branchesContainer);
    } else {
        branchesContainer.innerHTML = `<p>No branches found or failed to load.</p>`;
        if (branchesResult.status === 'rejected') console.error("Branch fetch error:", branchesResult.reason);
    }

    // Render Open PRs
    if (openPRsResult.status === 'fulfilled' && openPRsResult.value.length > 0) {
        renderModalPRs(openPRsResult.value, openPrsContainer);
    } else {
        openPrsContainer.innerHTML = `<p>No open pull requests found or failed to load.</p>`;
         if (openPRsResult.status === 'rejected') console.error("Open PR fetch error:", openPRsResult.reason);
    }

    // Render Closed PRs
    if (closedPRsResult.status === 'fulfilled' && closedPRsResult.value.length > 0) {
        renderModalPRs(closedPRsResult.value, closedPrsContainer);
    } else {
        closedPrsContainer.innerHTML = `<p>No closed pull requests found or failed to load.</p>`;
        if (closedPRsResult.status === 'rejected') console.error("Closed PR fetch error:", closedPRsResult.reason);
    }

  } catch (error) { // Catch errors from Promise.all itself (unlikely here)
    console.error("Error loading project details:", error);
    branchesContainer.innerHTML = '<p class="error-message">Error loading details.</p>';
    openPrsContainer.innerHTML = '<p class="error-message">Error loading details.</p>';
    closedPrsContainer.innerHTML = '<p class="error-message">Error loading details.</p>';
  } finally {
    hideProjectSpinner();
  }
}

/** Helper to render branches in the modal */
async function renderModalBranches(owner, repo, branches, container) {
    // Fetch commit info concurrently - Limited to avoid too many API calls
    const commitPromises = branches.slice(0, 15).map(b => fetchCommitsOfBranch(owner, repo, b.name, 1)); // Fetch only latest commit
    const commitResults = await Promise.allSettled(commitPromises);

    // Fetch open PRs again just for this repo to link branches
    // Ideally, this data would be passed or cached better
    const openPRsResult = await fetchRepoPullRequests(owner, repo, 'open');
    const branchToPrMap = {};
    if (openPRsResult) {
        openPRsResult.forEach(pr => { branchToPrMap[pr.head.ref] = pr; });
    }


    const branchesWithCommits = branches.map((branch, index) => {
        const commitResult = index < commitResults.length ? commitResults[index] : null;
        const latestCommit = (commitResult?.status === 'fulfilled' && commitResult.value.length > 0) ? commitResult.value[0] : null;
        return { ...branch, latestCommit };
    });

    // Sort branches: protected first, then by latest commit date
     branchesWithCommits.sort((a, b) => {
        if (a.protected && !b.protected) return -1;
        if (!a.protected && b.protected) return 1;
        const dateA = a.latestCommit ? new Date(a.latestCommit.commit.author.date).getTime() : 0;
        const dateB = b.latestCommit ? new Date(b.latestCommit.commit.author.date).getTime() : 0;
        return dateB - dateA; // Newest first
    });


    container.innerHTML = branchesWithCommits.map(b => {
        const latestCommit = b.latestCommit;
        const date = latestCommit ? formatDate(latestCommit.commit.author.date) : 'N/A';
        const committer = latestCommit ? (latestCommit.commit.committer?.name || latestCommit.commit.author?.name || 'N/A') : 'N/A';
        const branchUrl = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(b.name)}`;
        let prBadge = '';
        if (branchToPrMap[b.name]) {
            const pr = branchToPrMap[b.name];
            prBadge = `<span class="modal-pr-link"><a href="${escapeHTML(pr.html_url)}" target="_blank">Open PR #${pr.number}</a></span>`;
        }

        return `
        <div class="modal-branch-item">
            <div class="modal-branch-header">
                <i class="fas fa-code-branch"></i>
                <strong><a href="${branchUrl}" target="_blank">${escapeHTML(b.name)}</a></strong>
                ${b.protected ? '<i class="fas fa-lock protected-icon" title="Protected"></i>' : ''}
                ${prBadge}
            </div>
            <div class="modal-branch-meta">
                <span>Last Commit: ${date} by ${escapeHTML(committer)}</span>
            </div>
        </div>`;
    }).join('');

     // Add some styles for modal items if needed
     const styleSheet = document.styleSheets[0];
     try {
        styleSheet.insertRule('.modal-branch-item { margin-bottom: 10px; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--card-hover-color); }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-branch-header { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-branch-header i { color: var(--text-secondary-color); }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-branch-header .protected-icon { color: var(--warning-color); }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-branch-meta { font-size: 0.8rem; color: var(--text-secondary-color); }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-pr-link { margin-left: auto; background-color: var(--open-pr-color); color: white; font-size: 0.75rem; padding: 2px 6px; border-radius: 10px; white-space: nowrap; }', styleSheet.cssRules.length);
        styleSheet.insertRule('.modal-pr-link a { color: white; text-decoration: none; } .modal-pr-link a:hover { text-decoration: underline; }', styleSheet.cssRules.length);
     } catch {}
}

/** Helper to render PRs (Open/Closed) in the modal */
function renderModalPRs(prs, container) {
    container.innerHTML = `
    <table class="modal-table">
      <thead>
        <tr>
          <th style="width: 15%;">PR #</th>
          <th style="width: 65%;">Title</th>
          <th style="width: 20%;" class="date-column">Date</th>
        </tr>
      </thead>
      <tbody>
        ${prs.map(pr => `
          <tr>
            <td><a href="${escapeHTML(pr.html_url)}" target="_blank">#${pr.number}</a></td>
            <td>${escapeHTML(formatPRTitle(pr.title))}</td>
            <td class="date-column" data-iso="${pr.state === 'open' ? pr.created_at : pr.closed_at}">
                ${formatDate(pr.state === 'open' ? pr.created_at : pr.closed_at)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
    // Add basic table style if needed
     const styleSheet = document.styleSheets[0];
     try {
       styleSheet.insertRule('.modal-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }', styleSheet.cssRules.length);
       styleSheet.insertRule('.modal-table th, .modal-table td { padding: 6px 8px; border: 1px solid var(--border-color); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }', styleSheet.cssRules.length);
       styleSheet.insertRule('.modal-table th { background-color: var(--table-header-bg); font-weight: 600; }', styleSheet.cssRules.length);
     } catch {}
}

/**
 * Load user contributions (PRs and branches) into the modal
 * @param {string} username - GitHub username
 */
async function loadUserContributions(username) {
  // Reset modal tabs to default (first tab)
  modalTabs.forEach((t, index) => t.classList.toggle('active', index === 0));
  modalTabContents.forEach((c, index) => c.classList.toggle('active', index === 0));

  // Set modal title to user profile
  const modalTitle = document.getElementById('modal-title');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fas fa-user"></i> ${escapeHTML(username)}'s Contributions`;
  }
  
  openProjectDetailsModal();
  showProjectSpinner();

  // Get containers
  const branchesContainer = document.getElementById('branches-container');
  const openPrsContainer = document.getElementById('open-prs-container');
  const closedPrsContainer = document.getElementById('closed-prs-container');

  // Clear previous content
  branchesContainer.innerHTML = '<p>Loading active branches...</p>';
  openPrsContainer.innerHTML = '<p>Loading open PRs...</p>';
  closedPrsContainer.innerHTML = '<p>Loading closed PRs...</p>';

  try {
    // Fetch user's PRs
    const [openPRsResult, closedPRsResult] = await Promise.allSettled([
      fetchAllUserPRs(username, 'open'), // Need to create this function in github-api.js
      fetchAllUserPRs(username, 'closed') // Need to create this function in github-api.js
    ]);
    
    // We'll fetch the user's branches across repos based on their PRs
    let userBranches = [];
    
    // Process open PRs to extract branch information
    if (openPRsResult.status === 'fulfilled' && openPRsResult.value.length > 0) {
      // Extract branch info from PRs
      const openPRs = openPRsResult.value;
      
      // Get unique branches the user has worked on
      openPRs.forEach(pr => {
        if (pr.head && pr.head.ref && pr.head.repo) {
          userBranches.push({
            name: pr.head.ref,
            repo: pr.head.repo.name,
            owner: pr.head.repo.owner.login,
            prLink: pr.html_url,
            prNumber: pr.number,
            updated: pr.updated_at
          });
        }
      });
      
      // Render the PRs
      renderUserPRs(openPRs, openPrsContainer, username);
    } else {
      openPrsContainer.innerHTML = `<p>No open pull requests found for ${escapeHTML(username)}.</p>`;
    }

    // Process closed PRs
    if (closedPRsResult.status === 'fulfilled' && closedPRsResult.value.length > 0) {
      renderUserPRs(closedPRsResult.value, closedPrsContainer, username);
    } else {
      closedPrsContainer.innerHTML = `<p>No closed pull requests found for ${escapeHTML(username)}.</p>`;
    }

    // Render branches
    renderUserBranches(userBranches, branchesContainer);

  } catch (error) {
    console.error("Error loading user contributions:", error);
    branchesContainer.innerHTML = '<p class="error-message">Error loading branches.</p>';
    openPrsContainer.innerHTML = '<p class="error-message">Error loading open PRs.</p>';
    closedPrsContainer.innerHTML = '<p class="error-message">Error loading closed PRs.</p>';
  } finally {
    hideProjectSpinner();
  }
}

/**
 * Render a user's PRs in the modal
 * @param {Array} prs - PRs to render
 * @param {HTMLElement} container - Container element
 * @param {string} username - GitHub username
 */
function renderUserPRs(prs, container, username) {
  if (!prs || prs.length === 0) {
    container.innerHTML = `<p>No pull requests found for ${escapeHTML(username)}.</p>`;
    return;
  }
  
  // Group PRs by repository for better organization
  const prsByRepo = {};
  prs.forEach(pr => {
    const repoName = pr.base?.repo?.full_name || 'Unknown Repository';
    if (!prsByRepo[repoName]) {
      prsByRepo[repoName] = [];
    }
    prsByRepo[repoName].push(pr);
  });
  
  // Build HTML output for each repository group
  let output = '';
  for (const [repoName, repoPRs] of Object.entries(prsByRepo)) {
    output += `
    <div class="user-repo-group">
      <h3 class="user-repo-name">
        <i class="fas fa-code-repository"></i> ${escapeHTML(repoName)}
        <span class="user-repo-count">${repoPRs.length} PRs</span>
      </h3>
      <table class="modal-table">
        <thead>
          <tr>
            <th style="width: 15%;">PR #</th>
            <th style="width: 65%;">Title</th>
            <th style="width: 20%;" class="date-column">Date</th>
          </tr>
        </thead>
        <tbody>
          ${repoPRs.map(pr => `
            <tr>
              <td><a href="${escapeHTML(pr.html_url)}" target="_blank">#${pr.number}</a></td>
              <td>${escapeHTML(formatPRTitle(pr.title))}</td>
              <td class="date-column" data-iso="${pr.state === 'open' ? pr.created_at : pr.closed_at}">
                  ${formatDate(pr.state === 'open' ? pr.created_at : pr.closed_at)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  }
  
  container.innerHTML = output;
  
  // Add styles for user-specific views
  const styleSheet = document.styleSheets[0];
  try {
    styleSheet.insertRule('.user-repo-group { margin-bottom: 20px; }', styleSheet.cssRules.length);
    styleSheet.insertRule('.user-repo-name { font-size: 1rem; padding: 8px 0; display: flex; align-items: center; gap: 8px; }', styleSheet.cssRules.length);
    styleSheet.insertRule('.user-repo-count { margin-left: auto; background: var(--accent-color); color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.75rem; }', styleSheet.cssRules.length);
  } catch {}
}

/**
 * Render a user's branches in the modal
 * @param {Array} branches - Branches to render
 * @param {HTMLElement} container - Container element
 */
function renderUserBranches(branches, container) {
  if (!branches || branches.length === 0) {
    container.innerHTML = '<p>No active branches found.</p>';
    return;
  }
  
  // Group branches by repository
  const branchesByRepo = {};
  branches.forEach(branch => {
    const repoKey = `${branch.owner}/${branch.repo}`;
    if (!branchesByRepo[repoKey]) {
      branchesByRepo[repoKey] = [];
    }
    branchesByRepo[repoKey].push(branch);
  });
  
  // Build HTML output
  let output = '';
  for (const [repoKey, repoBranches] of Object.entries(branchesByRepo)) {
    output += `
    <div class="user-repo-group">
      <h3 class="user-repo-name">
        <i class="fas fa-code-repository"></i> ${escapeHTML(repoKey)}
        <span class="user-repo-count">${repoBranches.length} branches</span>
      </h3>
      <div class="user-branches-container">
        ${repoBranches.map(branch => {
          const branchUrl = `https://github.com/${branch.owner}/${branch.repo}/tree/${encodeURIComponent(branch.name)}`;
          return `
          <div class="modal-branch-item">
            <div class="modal-branch-header">
              <i class="fas fa-code-branch"></i>
              <strong><a href="${branchUrl}" target="_blank">${escapeHTML(branch.name)}</a></strong>
              ${branch.prNumber ? 
                `<span class="modal-pr-link"><a href="${escapeHTML(branch.prLink)}" target="_blank">PR #${branch.prNumber}</a></span>` : 
                ''}
            </div>
            <div class="modal-branch-meta">
              <span>Last updated: ${formatDate(branch.updated)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  
  container.innerHTML = output;
}

/**
 * Set up user profile functionality
 */
function setupUserProfile() {
  const userProfileToggle = document.getElementById('user-profile-toggle');
  
  if (!userProfileToggle) {
    console.warn('User profile toggle not found');
    return;
  }

  // Set initial state
  updateUserActivityIndicator();

  userProfileToggle.addEventListener('click', () => {
    showUserProfile();
  });
}

/**
 * Show user profile modal with current user's activity
 */
function showUserProfile() {
  if (typeof GITHUB_USERNAME === 'undefined' || !GITHUB_USERNAME) {
    showToast('GitHub username not configured. Please check your settings.', 'error');
    return;
  }

  // Use the existing developer details modal but customize for current user
  showDeveloperDetails(GITHUB_USERNAME, GITHUB_USERNAME);
  
  // Customize the modal title and content for current user
  setTimeout(() => {
    customizeUserProfileModal();
  }, 100);
}

/**
 * Customize the developer modal for the current user
 */
async function customizeUserProfileModal() {
  const overlay = document.getElementById('developer-details-overlay');
  if (!overlay) return;

  // Update modal title
  const modalTitle = overlay.querySelector('.activity-details-title');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fas fa-user-circle"></i> My Activity Dashboard`;
  }

  // Add user activity summary
  const developerProfile = overlay.querySelector('.developer-profile');
  if (developerProfile) {
    try {
      const activitySummary = await generateUserActivitySummary(GITHUB_USERNAME);
      const summaryHTML = `
        <div class="user-activity-summary">
          <h4><i class="fas fa-chart-line"></i> Quick Stats</h4>
          <div class="activity-stats-grid">
            <div class="activity-stat-item">
              <div class="stat-icon"><i class="fas fa-code-pull-request"></i></div>
              <div class="stat-info">
                <div class="stat-value">${activitySummary.totalPRs}</div>
                <div class="stat-label">Total PRs</div>
              </div>
            </div>
            <div class="activity-stat-item">
              <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
              <div class="stat-info">
                <div class="stat-value">${activitySummary.openPRs}</div>
                <div class="stat-label">Open PRs</div>
              </div>
            </div>
            <div class="activity-stat-item">
              <div class="stat-icon"><i class="fas fa-clock"></i></div>
              <div class="stat-info">
                <div class="stat-value">${activitySummary.recentActivity}</div>
                <div class="stat-label">This Week</div>
              </div>
            </div>
            <div class="activity-stat-item">
              <div class="stat-icon"><i class="fas fa-code-branch"></i></div>
              <div class="stat-info">
                <div class="stat-value">${activitySummary.totalBranches}</div>
                <div class="stat-label">Active Branches</div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Insert the summary after the developer profile
      developerProfile.insertAdjacentHTML('afterend', summaryHTML);
    } catch (error) {
      console.warn('Failed to generate user activity summary:', error);
    }
  }
}

/**
 * Generate user activity summary statistics
 */
async function generateUserActivitySummary(username) {
  try {
    const [prs, branches] = await Promise.allSettled([
      fetchDeveloperPRs(username, false),
      fetchDeveloperBranches(username, [], false)
    ]);

    const prData = prs.status === 'fulfilled' ? prs.value : [];
    const branchData = branches.status === 'fulfilled' ? branches.value : [];

    // Calculate stats
    const totalPRs = prData.length;
    const openPRs = prData.filter(pr => pr.state === 'open').length;
    
    // Recent activity (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentActivity = prData.filter(pr => {
      const prDate = new Date(pr.updated_at);
      return prDate > oneWeekAgo;
    }).length;

    // Active branches (branches with recent commits)
    const activeBranches = branchData.filter(branch => {
      if (!branch.commit || !branch.commit.commit || !branch.commit.commit.committer) return false;
      const branchDate = new Date(branch.commit.commit.committer.date);
      return branchDate > oneWeekAgo;
    }).length;

    return {
      totalPRs,
      openPRs,
      recentActivity,
      totalBranches: activeBranches
    };
  } catch (error) {
    console.warn('Error generating activity summary:', error);
    return {
      totalPRs: 0,
      openPRs: 0,
      recentActivity: 0,
      totalBranches: 0
    };
  }
}

/**
 * Update the activity indicator on the user profile icon
 */
async function updateUserActivityIndicator() {
  const userProfileToggle = document.getElementById('user-profile-toggle');
  if (!userProfileToggle || typeof GITHUB_USERNAME === 'undefined' || !GITHUB_USERNAME) {
    return;
  }

  try {
    // Check if user has recent activity (PRs in the last 7 days)
    const recentPRs = await fetchDeveloperPRs(GITHUB_USERNAME, false);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const hasRecentActivity = recentPRs && recentPRs.some(pr => {
      const prDate = new Date(pr.updated_at);
      return prDate > oneWeekAgo;
    });

    if (hasRecentActivity) {
      userProfileToggle.classList.add('has-activity');
      userProfileToggle.title = 'View my activity (recent activity detected)';
    } else {
      userProfileToggle.classList.remove('has-activity');
      userProfileToggle.title = 'View my activity';
    }
  } catch (error) {
    console.warn('Failed to check user activity:', error);
    userProfileToggle.classList.remove('has-activity');
  }
}

/**
 * Set up global refresh functionality
 */
function setupGlobalRefresh() {
  const globalRefreshToggle = document.getElementById('global-refresh-toggle');
  
  if (!globalRefreshToggle) {
    console.warn('Global refresh toggle not found');
    return;
  }

  globalRefreshToggle.addEventListener('click', async () => {
    // Show toast notification
    showToast('Refreshing all pages...', 'info');
    
    // Disable the button temporarily to prevent multiple clicks
    globalRefreshToggle.disabled = true;
    globalRefreshToggle.style.opacity = '0.6';
    
    try {
      console.log('🔄 Starting global refresh of all pages');
      
      // Clear all caches
      clearAllCaches();
      
      // Get the currently active tab
      const activeTab = document.querySelector('.tab.active');
      const currentTabId = activeTab ? activeTab.dataset.tab : 'my-activity';
      
      // Refresh all sections by triggering their individual refresh buttons
      await refreshAllSections();
      
      // Reload the current tab's data to ensure it's up to date
      await loadDataForTab(currentTabId);
      
      // Update all counts
      if (typeof updateMainTabCounts === 'function') {
        updateMainTabCounts();
      }
      
      showToast('All pages refreshed successfully!', 'success');
      console.log('✅ Global refresh completed successfully');
      
      // Update user activity indicator after refresh
      updateUserActivityIndicator();
      
    } catch (error) {
      console.error('❌ Error during global refresh:', error);
      showToast('Error refreshing some pages. Please try again.', 'error');
    } finally {
      // Re-enable the button
      globalRefreshToggle.disabled = false;
      globalRefreshToggle.style.opacity = '1';
    }
  });
}

/**
 * Clear all caches for a fresh start
 */
function clearAllCaches() {
  console.log('🗑️ Clearing all caches');
  
  // Clear data caches if they exist
  if (typeof cachedData !== 'undefined') {
    Object.keys(cachedData).forEach(key => {
      cachedData[key] = [];
    });
  }
  
  // Clear page data cache if it exists
  if (typeof pageDataCache !== 'undefined') {
    Object.keys(pageDataCache).forEach(key => {
      pageDataCache[key] = {};
    });
  }
  
  // Reset tab loaded states
  if (typeof tabDataLoaded !== 'undefined') {
    Object.keys(tabDataLoaded).forEach(key => {
      tabDataLoaded[key] = false;
    });
  }
  
  // Reset page states to page 1
  if (typeof pageState !== 'undefined') {
    Object.keys(pageState).forEach(key => {
      if (key.includes('Page') || key.includes('page')) {
        pageState[key] = 1;
      }
    });
  }
}

/**
 * Refresh all sections by programmatically clicking their refresh buttons
 */
async function refreshAllSections() {
  const refreshButtons = [
    'my-open-prs-refresh',
    'my-closed-prs-refresh',
    'my-reviews-open-refresh',
    'my-reviews-closed-refresh',
    'open-pr-refresh',
    'closed-pr-refresh',
    'projects-refresh'
  ];
  
  console.log('🔄 Triggering refresh for all sections');
  
  // Create promises for all refresh operations
  const refreshPromises = refreshButtons.map(buttonId => {
    return new Promise((resolve) => {
      const button = document.getElementById(buttonId);
      if (button) {
        console.log(`🔄 Refreshing section: ${buttonId}`);
        // Trigger the click event which will handle the refresh
        button.click();
        // Give it a moment to start the refresh
        setTimeout(resolve, 100);
      } else {
        console.warn(`⚠️ Refresh button not found: ${buttonId}`);
        resolve();
      }
    });
  });
  
  // Wait for all refresh operations to start
  await Promise.all(refreshPromises);
  
  // Give additional time for the refreshes to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Set up the dark mode toggle functionality
 */
function setupDarkModeToggle() {
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (!darkModeToggle) return;

  // Initialize dark mode based on saved preference
  const savedDarkMode = loadPreference('darkMode', false);
  document.body.classList.toggle('dark-mode', savedDarkMode);

  darkModeToggle.addEventListener('click', () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    savePreference('darkMode', isDarkMode); // Use helper function

    // Optional: Add ripple effect or other visual feedback
    const ripple = document.createElement('span');
    ripple.classList.add('theme-toggle-ripple');
    // Apply necessary styles for ripple (position, size, bg, animation)
    ripple.style.position = 'absolute';
    ripple.style.width = '10px'; // Start small
    ripple.style.height = '10px';
    ripple.style.borderRadius = '50%';
    ripple.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
    ripple.style.transform = 'translate(-50%, -50%) scale(0)';
    ripple.style.transition = 'transform 0.6s ease-out, opacity 0.6s ease-out';
    ripple.style.opacity = '1';
    ripple.style.top = '50%'; // Center ripple
    ripple.style.left = '50%';
    ripple.style.zIndex = '-1'; // Behind icons

    darkModeToggle.appendChild(ripple);

    // Trigger animation
    requestAnimationFrame(() => {
        ripple.style.transform = 'translate(-50%, -50%) scale(10)'; // Expand ripple
        ripple.style.opacity = '0';
    });

    // Remove ripple after animation
    setTimeout(() => {
        if (darkModeToggle.contains(ripple)) {
            darkModeToggle.removeChild(ripple);
        }
    }, 600);
  });
}

/**
 * Set up the settings panel interactions and load initial values
 */
function setupSettingsPanel() {
  if (!settingsToggle || !settingsPanel) return;

  // Toggle panel visibility
  settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click listener from closing immediately
    settingsPanel.classList.toggle('active');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    // Close if the click is outside the panel AND outside the toggle button
    if (settingsPanel.classList.contains('active') && !settingsPanel.contains(e.target) && e.target !== settingsToggle && !settingsToggle.contains(e.target)) {
      settingsPanel.classList.remove('active');
    }
  });
   // Close panel on ESC key
   document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsPanel.classList.contains('active')) {
          settingsPanel.classList.remove('active');
      }
   });

  // === Initialize Settings Controls ===

  // Default Landing Page
  const defaultTabSetting = loadPreference('defaultTab', 'my-activity');
  const defaultTabRadio = document.querySelector(`input[name="default-tab"][value="${defaultTabSetting}"]`);
  if (defaultTabRadio) defaultTabRadio.checked = true;

  document.querySelectorAll('input[name="default-tab"]').forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.checked) {
        savePreference('defaultTab', this.value);
      }
    });
  });

  // Full-width Tables
  const fullWidthCheckbox = document.getElementById('full-width-tables');
  if (fullWidthCheckbox) {
      fullWidthCheckbox.checked = preferences.fullWidthTables; // Use loaded preferences
      document.body.classList.toggle('full-width-tables', preferences.fullWidthTables);
      fullWidthCheckbox.addEventListener('change', function() {
          preferences.fullWidthTables = this.checked;
          savePreference('fullWidthTables', this.checked);
          document.body.classList.toggle('full-width-tables', this.checked);
      });
  }

  // Show Branch Names (mutually exclusive with showBranchNamesIfNotMain)
  const showBranchCheckbox = document.getElementById('show-branch-names');
  const showBranchIfNotMainCheckbox = document.getElementById('show-branch-names-if-not-main');
  
  if (showBranchCheckbox) {
      showBranchCheckbox.checked = preferences.showBranchNames; // Use loaded preferences
      document.body.classList.toggle('show-branch-names', preferences.showBranchNames);
      showBranchCheckbox.addEventListener('change', function() {
          if (this.checked) {
              // Uncheck the other option
              if (showBranchIfNotMainCheckbox) {
                  showBranchIfNotMainCheckbox.checked = false;
                  preferences.showBranchNamesIfNotMain = false;
                  savePreference('showBranchNamesIfNotMain', false);
              }
          }
          preferences.showBranchNames = this.checked;
          savePreference('showBranchNames', this.checked);
          document.body.classList.toggle('show-branch-names', this.checked);
          refreshAllViews(); // Refresh views to apply change
      });
  }

  // Show Branch Names If Not Main (mutually exclusive with showBranchNames)
  if (showBranchIfNotMainCheckbox) {
      showBranchIfNotMainCheckbox.checked = preferences.showBranchNamesIfNotMain; // Use loaded preferences
      showBranchIfNotMainCheckbox.addEventListener('change', function() {
          if (this.checked) {
              // Uncheck the other option
              if (showBranchCheckbox) {
                  showBranchCheckbox.checked = false;
                  preferences.showBranchNames = false;
                  savePreference('showBranchNames', false);
                  document.body.classList.toggle('show-branch-names', false);
              }
          }
          preferences.showBranchNamesIfNotMain = this.checked;
          savePreference('showBranchNamesIfNotMain', this.checked);
          refreshAllViews(); // Refresh views to apply change
      });
  }

  // Preload Data
  const preloadCheckbox = document.getElementById('preload-data');
  if (preloadCheckbox) {
      preloadCheckbox.checked = preferences.preloadData; // Use loaded preferences
      preloadCheckbox.addEventListener('change', function() {
          preferences.preloadData = this.checked;
          savePreference('preloadData', this.checked);
          // Note: This setting takes effect on next page load/initialization
          showToast("Preload setting will apply on next app start.", "info");
      });
  }

  // Smart Table Mode
  const smartTableCheckbox = document.getElementById('smart-table-mode');
  if (smartTableCheckbox) {
      smartTableCheckbox.checked = preferences.smartTableMode; // Use loaded preferences
      smartTableCheckbox.addEventListener('change', function() {
          preferences.smartTableMode = this.checked;
          savePreference('smartTableMode', this.checked);
          refreshAllViews(); // Refresh views to apply change
          showToast(`Smart table mode ${this.checked ? 'enabled' : 'disabled'}.`, 'info');
      });
  }

  // Remove PGIT Prefix
  const removePgitPrefixCheckbox = document.getElementById('remove-pgit-prefix');
  if (removePgitPrefixCheckbox) {
      removePgitPrefixCheckbox.checked = preferences.removePgitPrefix; // Use loaded preferences
      removePgitPrefixCheckbox.addEventListener('change', function() {
          preferences.removePgitPrefix = this.checked;
          savePreference('removePgitPrefix', this.checked);
          refreshAllViews(); // Refresh views to apply change
          showToast(`PGIT prefix ${this.checked ? 'hidden' : 'shown'} in ticket names.`, 'info');
      });
  }

  // Cache Timeout Sliders
  initializeCacheTimeoutSliders();

  // API Cache Stats & Clear Button
  updateCacheStatsUI(); // Initial update
  const clearCacheButton = document.getElementById('clear-api-cache');
  if (clearCacheButton) {
      clearCacheButton.addEventListener('click', () => {
          requestCache.clear();
          showToast('API request cache has been cleared.', 'success');
          updateCacheStatsUI();
      });
  }

  // Reset All Data Button
  const clearAllButton = document.getElementById('clear-all-data');
  if (clearAllButton) {
    clearAllButton.addEventListener('click', () => {
      if (confirm('ARE YOU SURE?\n\nThis will clear ALL settings, cache, favorites, and other stored data.\nThe page will reload.')) {
        // Clear localStorage completely
        localStorage.clear();
        // Optionally clear sessionStorage if used
        // sessionStorage.clear();
        // Reload the page to apply changes
        window.location.reload();
      }
    });
  }
}


/**
 * Update the API cache statistics in the settings panel
 * This is the main implementation used by both UI and data-manager
 */
function updateCacheStatsUI() {
  const statsElement = document.getElementById('cache-stats');
  if (!statsElement) return;
  
  try {
    const stats = requestCache.getStats();
    console.debug("Updating cache stats UI with:", stats);
    
    // Update entries count
    const entriesEl = statsElement.querySelector('.cache-stat-item:nth-child(1) .cache-stat-value');
    if (entriesEl) entriesEl.textContent = stats.entries;
    
    // Update raw size
    const sizeEl = statsElement.querySelector('.cache-stat-item:nth-child(2) .cache-stat-value');
    if (sizeEl) sizeEl.textContent = stats.size;
    
    // Update compression toggle state
    const compressionToggle = document.getElementById('compression-toggle');
    if (compressionToggle) {
      compressionToggle.checked = stats.isCompressed;
      
      // Setup toggle event listener if it doesn't exist yet
      if (!compressionToggle.hasAttribute('data-listener-added')) {
        compressionToggle.addEventListener('change', function() {
          requestCache.toggleCompression(this.checked);
          showToast(`Cache compression ${this.checked ? 'enabled' : 'disabled'}`, 'info', 2000);
          setTimeout(updateCacheStatsUI, 100); // Update shortly after toggle changes
        });
        compressionToggle.setAttribute('data-listener-added', 'true');
      }
    }
    
    // Update compression bar and text
    const compressionBarEl = statsElement.querySelector('.compression-bar');
    const compressionPercentEl = statsElement.querySelector('.compression-percent');
    const compressionSizeEl = statsElement.querySelector('.compression-size');
    const compressionInfoEl = statsElement.querySelector('.compression-info');
    
    if (compressionBarEl && compressionPercentEl && compressionSizeEl) {
      // Calculate compression percentage
      // If raw size is 0, set percentage to 0 to avoid division by zero
      const percent = stats.rawSize ? Math.min(100, Math.max(0, (stats.compressedSize / stats.rawSize) * 100)) : 0;
      const saving = Math.max(0, 100 - percent); // Ensure it's not negative
      
      // Update the UI with compression information
      compressionBarEl.style.width = `${percent}%`;
      compressionPercentEl.textContent = `${saving.toFixed(1)}% saved`;
      compressionSizeEl.textContent = stats.compressedSizeFormatted;
      
      // Add/remove disabled class based on compression state
      if (compressionInfoEl) {
        compressionInfoEl.classList.toggle('compression-disabled', !stats.isCompressed);
      }
      
      // Add a brief pulse animation to indicate the stats were updated
      statsElement.classList.add('stats-updating');
      setTimeout(() => statsElement.classList.remove('stats-updating'), 1000);
    }
  } catch (e) {
    console.error('Failed to update cache stats UI:', e);
  }
}

// Alias the function for backward compatibility
function updateCacheStats() {
  updateCacheStatsUI();
}

/**
 * Initialize cache timeout sliders and their displays
 */
function initializeCacheTimeoutSliders() {
  const sliders = [
    { id: 'cache-timeout-default', key: 'default' },
    { id: 'cache-timeout-repo', key: 'repo' },
    { id: 'cache-timeout-commits', key: 'commits' },
    { id: 'cache-timeout-branches', key: 'branches' }
  ];

  sliders.forEach(({ id, key }) => {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(`${id}-value`);
    const container = slider?.closest('.cache-timeout-item'); // Parent container

    if (!slider || !valueDisplay || !container) return;

    // Load initial value (convert ms back to minutes for the slider)
    const currentTimeoutMs = requestCache.expirationTimes[key];
    const currentTimeoutMin = Math.round(currentTimeoutMs / (60 * 1000));

    // Clamp value to slider min/max just in case stored value is out of bounds
    const min = parseInt(slider.min, 10);
    const max = parseInt(slider.max, 10);
    slider.value = Math.max(min, Math.min(max, currentTimeoutMin));
    valueDisplay.textContent = formatCacheTimeoutValue(slider.value);

    // Update display on input
    slider.addEventListener('input', function() {
      valueDisplay.textContent = formatCacheTimeoutValue(this.value);
    });

    // Save and apply on change
    slider.addEventListener('change', function() {
      const minutes = parseInt(this.value, 10);
      const newTimeoutMs = minutes * 60 * 1000;

      // Save preference (key used is the slider ID)
      savePreference(id, minutes);

      // Update the cache configuration
      requestCache.expirationTimes[key] = newTimeoutMs;

      // Visual feedback
      container.classList.add('saving');
      showToast(`${valueDisplay.textContent} timeout saved for ${key.charAt(0).toUpperCase() + key.slice(1)}.`, 'success', 2000);
      setTimeout(() => container.classList.remove('saving'), 1500); // Remove pulse after animation
    });
  });

  // Add compression toggle if it doesn't exist
  const compressionToggle = document.getElementById('compression-toggle');
  if (compressionToggle) {
    compressionToggle.checked = requestCache._compression.enabled;
    
    // Use our consolidated function for updating UI
    compressionToggle.addEventListener('change', function() {
      requestCache.toggleCompression(this.checked);
      showToast(`Cache compression ${this.checked ? 'enabled' : 'disabled'}`, 'info', 2000);
      updateCacheStatsUI(); // Update stats display
    });
    compressionToggle.setAttribute('data-listener-added', 'true');
  }
}


/**
 * Format cache timeout value (in minutes) for display
 * @param {string|number} minutesStr - The timeout value in minutes (can be string from slider)
 * @returns {string} Formatted timeout string (e.g., "5 min", "1 hour", "2.5 hours")
 */
function formatCacheTimeoutValue(minutesStr) {
  const minutes = parseInt(minutesStr, 10);
  if (isNaN(minutes)) return 'N/A';

  if (minutes < 60) {
    return `${minutes} min`;
  } else {
    const hours = minutes / 60;
    // Show .5 for half hours, otherwise integer
    const displayHours = hours % 1 === 0 ? hours : hours.toFixed(1);
    return `${displayHours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
}

/**
 * Initialize dropdown values from stored preferences
 */
function initializeDropdowns() {
    const setDropdownValue = (id, value) => {
        const select = document.getElementById(id);
        if (select) select.value = value.toString();
    };

    setDropdownValue('my-open-prs-items-per-page', preferences.myOpenPrsPerPage);
    setDropdownValue('my-closed-prs-items-per-page', preferences.myClosedPrsPerPage);
    setDropdownValue('my-reviews-open-items-per-page', preferences.myReviewsOpenPerPage);
    setDropdownValue('my-reviews-closed-items-per-page', preferences.myReviewsClosedPerPage);
    setDropdownValue('open-pr-items-per-page', preferences.openPrItemsPerPage);
    setDropdownValue('closed-pr-items-per-page', preferences.closedPrItemsPerPage);
    setDropdownValue('projects-items-per-page', preferences.projectsPerPage);
}


/**
 * Set up table sorting functionality using event delegation
 */
function setupTableSorting() {
  // Add listener to a common ancestor (e.g., document or a main container)
  document.addEventListener('click', (e) => {
    // Check if the clicked element is a sortable table header `<th>`
    const headerCell = e.target.closest('.table-sortable th');
    if (!headerCell) return; // Exit if not a header cell

    const table = headerCell.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return; // Exit if no table body found

    const headerIndex = Array.prototype.indexOf.call(headerCell.parentNode.children, headerCell);
    const currentIsDesc = headerCell.classList.contains('sort-desc');
    const isDateColumn = headerCell.classList.contains('date-column');

    // Reset sort classes on all headers in the same `<thead>`
    headerCell.parentNode.querySelectorAll('th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
    });

    // Set new sort class on the clicked header
    headerCell.classList.toggle('sort-desc', !currentIsDesc);
    headerCell.classList.toggle('sort-asc', currentIsDesc);
    const isDescending = headerCell.classList.contains('sort-desc');

    // Sort rows
    Array.from(tbody.querySelectorAll('tr'))
      .sort((rowA, rowB) => {
        const cellA = rowA.children[headerIndex];
        const cellB = rowB.children[headerIndex];

        let valueA, valueB;

        if (isDateColumn) {
            valueA = new Date(cellA.getAttribute('data-iso') || 0).getTime();
            valueB = new Date(cellB.getAttribute('data-iso') || 0).getTime();
        } else {
            valueA = cellA.innerText.trim();
            valueB = cellB.innerText.trim();
             // Attempt numeric sort if applicable
             const numA = parseFloat(valueA);
             const numB = parseFloat(valueB);
             if (!isNaN(numA) && !isNaN(numB)) {
                 valueA = numA;
                 valueB = numB;
             }
        }

        // Comparison logic
        let comparison = 0;
        if (valueA < valueB) {
            comparison = -1;
        } else if (valueA > valueB) {
            comparison = 1;
        }

        return isDescending ? (comparison * -1) : comparison;
      })
      .forEach(row => tbody.appendChild(row)); // Reappend rows in sorted order
  });
}


/*************************************************************
 * THEME SELECTION
 *************************************************************/

/**
 * Sets up the theme selection radio buttons and loads the saved theme.
 */
function setupThemeSelection() {
  const themeGroup = document.getElementById('theme-selection-group');
  if (!themeGroup || !mainStylesheetLink || !themeClassicRadio || !themeModernRadio) {
    console.error("Theme selection elements not found.");
    return;
  }

  // Load saved theme or default to 'classic'
  const savedTheme = loadPreference('selectedTheme', 'classic');
  applyTheme(savedTheme);

  // Add event listener for theme changes
  themeGroup.addEventListener('change', (event) => {
    if (event.target.name === 'theme-select') {
      const newTheme = event.target.value;
      savePreference('selectedTheme', newTheme);
      applyTheme(newTheme);
      showToast(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`, 'info', 2000);
    }
  });
}

/**
 * Applies the selected theme by updating the stylesheet link and radio buttons.
 * @param {string} themeName - The name of the theme to apply ('classic' or 'modern').
 */
function applyTheme(themeName) {
  if (!mainStylesheetLink || !themeClassicRadio || !themeModernRadio) return;

  const classicPath = 'css/styles-classic.css';
  const modernPath = 'css/styles-modern.css';

  if (themeName === 'modern') {
    mainStylesheetLink.href = modernPath;
    themeModernRadio.checked = true;
    console.log("Applied Modern theme.");
  } else { // Default to classic
    mainStylesheetLink.href = classicPath;
    themeClassicRadio.checked = true;
    console.log("Applied Classic theme.");
  }
}


/*************************************************************
 * THEME SELECTION
 *************************************************************/

/**
 * Sets up the theme selection radio buttons and loads the saved theme.
 */
function setupThemeSelection() {
  const themeGroup = document.getElementById('theme-selection-group');
  if (!themeGroup || !mainStylesheetLink || !themeClassicRadio || !themeModernRadio) {
    console.error("Theme selection elements not found.");
    return;
  }

  // Load saved theme or default to 'classic'
  const savedTheme = loadPreference('selectedTheme', 'classic');
  applyTheme(savedTheme);

  // Add event listener for theme changes
  themeGroup.addEventListener('change', (event) => {
    if (event.target.name === 'theme-select') {
      const newTheme = event.target.value;
      savePreference('selectedTheme', newTheme);
      applyTheme(newTheme);
      showToast(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`, 'info', 2000);
    }
  });
}

/**
 * Applies the selected theme by updating the stylesheet link and radio buttons.
 * @param {string} themeName - The name of the theme to apply ('classic' or 'modern').
 */
function applyTheme(themeName) {
  if (!mainStylesheetLink || !themeClassicRadio || !themeModernRadio) return;

  const classicPath = 'css/styles-classic.css';
  const modernPath = 'css/styles-modern.css';

  if (themeName === 'modern') {
    mainStylesheetLink.href = modernPath;
    themeModernRadio.checked = true;
    console.log("Applied Modern theme.");
  } else { // Default to classic
    mainStylesheetLink.href = classicPath;
    themeClassicRadio.checked = true;
    console.log("Applied Classic theme.");
  }
}


/*************************************************************
 * THEME SELECTION
 *************************************************************/

/**
 * Sets up the theme selection radio buttons and loads the saved theme.
 */
function setupThemeSelection() {
  const themeGroup = document.getElementById('theme-selection-group');
  if (!themeGroup || !mainStylesheetLink || !themeClassicRadio || !themeModernRadio) {
    console.error("Theme selection elements not found.");
    return;
  }

  // Load saved theme or default to 'classic'
  const savedTheme = loadPreference('selectedTheme', 'classic');
  applyTheme(savedTheme);

  // Add event listener for theme changes
  themeGroup.addEventListener('change', (event) => {
    if (event.target.name === 'theme-select') {
      const newTheme = event.target.value;
      savePreference('selectedTheme', newTheme);
      applyTheme(newTheme);
      showToast(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`, 'info', 2000);
    }
  });
}

/**
 * Applies the selected theme by updating the stylesheet link and radio buttons.
 * @param {string} themeName - The name of the theme to apply ('classic' or 'modern').
 */
function applyTheme(themeName) {
  if (!mainStylesheetLink || !themeClassicRadio || !themeModernRadio) return;

  const classicPath = 'css/styles-classic.css';
  const modernPath = 'css/styles-modern.css';

  if (themeName === 'modern') {
    mainStylesheetLink.href = modernPath;
    themeModernRadio.checked = true;
    console.log("Applied Modern theme.");
  } else { // Default to classic
    mainStylesheetLink.href = classicPath;
    themeClassicRadio.checked = true;
    console.log("Applied Classic theme.");
  }
}