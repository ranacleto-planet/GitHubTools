/*************************************************************
 * SEARCH CONTROLLER
 * Handles global search and filtering functionality
 *************************************************************/

// Global Search Elements
let globalSearchOverlay, globalSearchInput, globalSearchResults,
    globalSearchLoading, globalSearchCount, globalSearchClose,
    globalSearchToggle, globalSearchScopeOpen, globalSearchScopeClosed,
    searchModeToggle; // <-- Added for Search Mode

// Keep track of selected result for keyboard navigation
let selectedResultIndex = -1;
let currentSearchResults = []; // Renamed from searchResults to avoid confusion

// Consistent constant for max items to fetch for global search
const MAX_SEARCH_ITEMS_GLOBAL = 300;

/**
 * Initialize global search functionality
 */
function initializeGlobalSearch() {
  // Get DOM elements
  globalSearchOverlay = document.getElementById('global-search-overlay');
  globalSearchInput = document.getElementById('global-search-input');
  globalSearchResults = document.getElementById('global-search-results');
  globalSearchLoading = document.getElementById('global-search-loading');
  globalSearchCount = document.getElementById('global-search-count');
  globalSearchClose = document.getElementById('global-search-close');
  globalSearchToggle = document.getElementById('global-search-toggle');
  globalSearchScopeOpen = document.getElementById('global-search-scope-open');
  globalSearchScopeClosed = document.getElementById('global-search-scope-closed');
  searchModeToggle = document.getElementById('search-mode-toggle'); // <-- Get the new toggle group

  // Updated check to include searchModeToggle
  if (!globalSearchOverlay || !globalSearchInput || !searchModeToggle) {
      console.error("Global search elements not found! Required elements might be missing.");
      return;
  }

  // Set up event listeners
  globalSearchToggle.addEventListener('click', openGlobalSearch);
  globalSearchClose.addEventListener('click', closeGlobalSearch);

  // Close on ESC key or when clicking outside of search container
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && globalSearchOverlay.classList.contains('active')) {
      closeGlobalSearch();
    }
  });

  globalSearchOverlay.addEventListener('click', (e) => {
    if (e.target === globalSearchOverlay) {
      closeGlobalSearch();
    }
  });

  // Handle keyboard navigation in search results
  globalSearchInput.addEventListener('keydown', (e) => {
    const resultItems = globalSearchResults.querySelectorAll('.global-search-result-item');
    if (!resultItems.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedResultIndex = Math.min(selectedResultIndex + 1, resultItems.length - 1);
        updateSelectedResult(resultItems);
        ensureVisible(resultItems[selectedResultIndex]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
        updateSelectedResult(resultItems);
        ensureVisible(resultItems[selectedResultIndex]);
        break;
      case 'Enter':
        if (selectedResultIndex >= 0 && selectedResultIndex < resultItems.length) {
          e.preventDefault();
          resultItems[selectedResultIndex].click();
        }
        break;
      case 'Home': // Go to first result
         e.preventDefault();
         selectedResultIndex = 0;
         updateSelectedResult(resultItems);
         ensureVisible(resultItems[selectedResultIndex]);
         break;
      case 'End': // Go to last result
         e.preventDefault();
         selectedResultIndex = resultItems.length - 1;
         updateSelectedResult(resultItems);
         ensureVisible(resultItems[selectedResultIndex]);
         break;
    }
  });

  // --- Modified/New Event Listeners ---
  // Trigger search on input or scope changes
  globalSearchInput.addEventListener('input', performGlobalSearch); // Uses debounced function
  globalSearchScopeOpen.addEventListener('change', performGlobalSearch);
  globalSearchScopeClosed.addEventListener('change', performGlobalSearch);

  // NEW: Search Mode Toggle Listener (using event delegation)
  searchModeToggle.addEventListener('click', (e) => {
      const clickedButton = e.target.closest('.search-mode-button');
      if (!clickedButton || clickedButton.classList.contains('active')) {
          return; // Ignore clicks outside buttons or on the already active button
      }

      // Update active state
      searchModeToggle.querySelectorAll('.search-mode-button').forEach(btn => btn.classList.remove('active'));
      clickedButton.classList.add('active');

      // Trigger search immediately as scope changed
      performGlobalSearch();
  });

  // Add keyboard shortcut (Ctrl/Cmd + K) to open global search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openGlobalSearch();
    }
  });
}

/**
 * Open the global search overlay
 */
function openGlobalSearch() {
  globalSearchOverlay.classList.add('active');
  globalSearchInput.focus();
  globalSearchInput.value = ''; // Clear input on open
  globalSearchCount.textContent = '';
  globalSearchResults.innerHTML = '';
  globalSearchLoading.style.display = 'none';
  selectedResultIndex = -1;
  currentSearchResults = []; // Reset results array

  // Reset search mode toggle to default ('title') visually
  searchModeToggle.querySelectorAll('.search-mode-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === 'title');
  });

  // Show welcome message
  globalSearchResults.innerHTML = `
    <div class="global-search-empty">
      <i class="fas fa-search"></i>
      <h3>Search Pull Requests</h3>
      <p>Start typing to search across open and closed pull requests.</p>
    </div>
  `;

  // Pre-populate from selected text if available (optional)
  // const selectedText = window.getSelection().toString().trim();
  // if (selectedText) {
  //   globalSearchInput.value = selectedText;
  //   performGlobalSearch();
  // }
}

/**
 * Close the global search overlay
 */
function closeGlobalSearch() {
  globalSearchOverlay.classList.remove('active');
  globalSearchInput.value = ''; // Clear input on close
  globalSearchCount.textContent = '';
  globalSearchResults.innerHTML = '';
  globalSearchLoading.style.display = 'none';
  selectedResultIndex = -1;
  currentSearchResults = [];
}

/**
 * Update the selected search result highlight
 * @param {NodeList} resultItems - List of result DOM elements
 */
function updateSelectedResult(resultItems) {
  resultItems.forEach((item, index) => {
    item.classList.toggle('selected', index === selectedResultIndex);
  });
}

/**
 * Ensure the selected result is visible in the scrollable area
 * @param {HTMLElement} element - The element to make visible
 */
function ensureVisible(element) {
  if (!element) return;
  // Using 'nearest' is generally smoother than 'center' or 'start'/'end'
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

/**
 * Safely check if a string contains a query (case-insensitive)
 * @param {string|null|undefined} value - The string to check
 * @param {string} query - The query to look for
 * @returns {boolean} - True if the query is in the string
 */
function safeIncludes(value, query) {
  // Ensure query is a string before calling toLowerCase
  const lowerQuery = typeof query === 'string' ? query.toLowerCase() : '';
  if (!lowerQuery) return false; // Don't match if query is empty or not a string
  return value ? String(value).toLowerCase().includes(lowerQuery) : false;
}

/**
 * Fetch all pull requests of a given state for search, handling pagination and enrichment.
 * This now uses the centralized fetchAllPullRequests from github-api.js
 * @param {string} state - 'open' or 'closed'
 * @returns {Promise<Array>} - Array of enriched pull request objects
 */
async function fetchAllPullRequestsForSearch(state) {
    // Use the centralized function which handles caching and enrichment
    // Pass true for forceRefresh if necessary, but usually rely on internal cache logic
    return await fetchAllPullRequests(state, false, MAX_SEARCH_ITEMS_GLOBAL);
}


/**
 * Perform global search across PRs (Debounced and Optimized with Search Mode)
 * - Leverages cachedData from main tabs to reduce API calls.
 * - Fetches data only if missing from cache.
 * - Filters and ranks locally based on selected search mode (Title or Everywhere).
 */
const performGlobalSearch = debounce(async () => {
  const query = globalSearchInput.value.trim();
  const lowerQuery = query.toLowerCase();

  // --- Determine Current Search Mode ---
  const activeModeButton = searchModeToggle.querySelector('.search-mode-button.active');
  const searchMode = activeModeButton ? activeModeButton.dataset.mode : 'title'; // Default to 'title'

  // --- Initial UI Setup ---
  globalSearchResults.innerHTML = ''; // Clear previous results
  selectedResultIndex = -1;
  currentSearchResults = [];
  // Show enhanced loading indicator immediately
  globalSearchLoading.style.display = 'flex';
  // Update loading text based on mode
  // Update loading text based on mode
  let loadingModeText = 'Titles';
  if (searchMode === 'everywhere') loadingModeText = 'Everywhere';
  else if (searchMode === 'branches') loadingModeText = 'Branches';

  globalSearchLoading.innerHTML = `
    <div class="loading-container">
      <div class="loading-icon pulse-animation"><i class="fas fa-search"></i></div>
      <div class="loading-progress">
        <div class="loading-text">Searching (${loadingModeText})...</div>
        <div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>
      </div>
    </div>
  `;
  const loadingStatusTarget = '#global-search-loading .loading-container'; // Target for cache/github dot

  // --- Handle Empty Query ---
  if (query === '') {
    globalSearchLoading.style.display = 'none'; // Hide loading
    globalSearchResults.innerHTML = `
      <div class="global-search-empty">
        <i class="fas fa-search"></i>
        <h3>Search Pull Requests</h3>
        <p>Start typing to search across open and closed pull requests.</p>
      </div>
    `;
    globalSearchCount.textContent = '';
    return;
  }

  try {
    // --- Determine Scopes and Check Caches ---
    const searchOpen = globalSearchScopeOpen.checked;
    const searchClosed = globalSearchScopeClosed.checked;

    if (!searchOpen && !searchClosed) {
      globalSearchLoading.style.display = 'none'; // Hide loading
      globalSearchResults.innerHTML = `
        <div class="global-search-empty">
          <i class="fas fa-filter"></i>
          <h3>No search scope selected</h3>
          <p>Please select at least one scope (Open or Closed PRs) to search.</p>
        </div>
      `;
      globalSearchCount.textContent = '0';
      return;
    }

    let combinedResults = [];
    let needsOpenFetch = false;
    let needsClosedFetch = false;
    let usedCache = false;

    // Check Open PR Cache
    if (searchOpen) {
      if (cachedData['open-pr'] && cachedData['open-pr'].length > 0) {
        console.log("Global Search: Using cachedData['open-pr']");
        combinedResults.push(...cachedData['open-pr']); // Use spread syntax
        usedCache = true;
      } else {
        needsOpenFetch = true;
        console.log("Global Search: Cache miss for open PRs.");
      }
    }

    // Check Closed PR Cache
    if (searchClosed) {
      if (cachedData['closed-pr'] && cachedData['closed-pr'].length > 0) {
        console.log("Global Search: Using cachedData['closed-pr']");
        combinedResults.push(...cachedData['closed-pr']); // Use spread syntax
        usedCache = true;
      } else {
        needsClosedFetch = true;
        console.log("Global Search: Cache miss for closed PRs.");
      }
    }

    // Update loading indicator dot based on cache usage
    updateLoadingIndicator(loadingStatusTarget, usedCache, 0); // 0 duration = persistent while loading

    // --- Fetch Data if Necessary ---
    const fetchPromises = [];
    if (needsOpenFetch) {
      console.log("Global Search: Queuing fetch for open PRs...");
      fetchPromises.push(
        fetchAllPullRequestsForSearch('open').then(results => ({ scope: 'open', data: results || [] }))
      );
    }
    if (needsClosedFetch) {
      console.log("Global Search: Queuing fetch for closed PRs...");
      fetchPromises.push(
        fetchAllPullRequestsForSearch('closed').then(results => ({ scope: 'closed', data: results || [] }))
      );
    }

    // --- Process Fetched Data ---
    if (fetchPromises.length > 0) {
       // Indicate network activity *if* we didn't use any cache
       if (!usedCache) {
           updateLoadingIndicator(loadingStatusTarget, false, 0);
       }
       console.log(`Global Search: Fetching data for ${fetchPromises.length} scope(s)...`);
       const fetchedResults = await Promise.all(fetchPromises);

       fetchedResults.forEach(result => {
         if (result.scope === 'open') {
           console.log(`Global Search: Received ${result.data.length} open PRs from fetch.`);
           cachedData['open-pr'] = result.data; // Store in cache
           combinedResults.push(...result.data); // Add to combined list
         } else if (result.scope === 'closed') {
           console.log(`Global Search: Received ${result.data.length} closed PRs from fetch.`);
           cachedData['closed-pr'] = result.data; // Store in cache
           combinedResults.push(...result.data); // Add to combined list
         }
       });

      // Deduplicate results (important if mixing cached and fetched)
      const uniqueResultsMap = new Map();
      combinedResults.forEach(pr => {
          if (pr && pr.id) { // Ensure pr and pr.id exist
              uniqueResultsMap.set(pr.id, pr);
          } else {
              console.warn("Skipping PR in deduplication due to missing ID:", pr);
          }
      });
      combinedResults = Array.from(uniqueResultsMap.values());
      console.log(`Global Search: Total unique items after fetch/combine: ${combinedResults.length}`);
    } else {
        console.log(`Global Search: Using only cached data. Total items: ${combinedResults.length}`);
    }


    // --- Filtering / Data Fetching based on Mode ---
    if (searchMode === 'branches') {
        // --- Branch Search Logic ---
        console.log(`Global Search: Fetching repositories for branch search...`);
        updateLoadingIndicator(loadingStatusTarget, false, 0); // Indicate network activity

        // 1. Fetch all team repositories (uses cache internally via safeFetch)
        // Use a reasonable limit, maybe slightly higher than MAX_FILTER_ITEMS
        const teamRepos = await fetchAllTeamRepositories(MAX_SEARCH_ITEMS_GLOBAL + 50);
        if (!teamRepos || teamRepos.length === 0) {
            throw new Error("Could not fetch team repositories for branch search.");
        }
        console.log(`Global Search: Found ${teamRepos.length} repositories. Fetching branches...`);

        // 2. Fetch branches for each repository concurrently
        const branchPromises = teamRepos.map(repo =>
            fetchProjectBranches(repo.owner.login, repo.name, 100) // Fetch up to 100 branches per repo
                .then(branches => branches.map(b => ({ // Add repo context
                    ...b,
                    repoOwner: repo.owner.login,
                    repoName: repo.name
                })))
                .catch(err => {
                    console.warn(`Failed to fetch branches for ${repo.full_name}:`, err.message);
                    return []; // Return empty array on error for this repo
                })
        );
        const allBranchArrays = await Promise.all(branchPromises);
        const allBranches = allBranchArrays.flat();
        console.log(`Global Search: Fetched total ${allBranches.length} branches across repositories.`);

        // 3. Filter branches locally
        currentSearchResults = allBranches.filter(branch =>
            branch.name?.toLowerCase().includes(lowerQuery)
        );

        // Simple sorting for branches (by repo, then branch name)
        currentSearchResults.sort((a, b) => {
            const repoA = `${a.repoOwner}/${a.repoName}`;
            const repoB = `${b.repoOwner}/${b.repoName}`;
            if (repoA !== repoB) {
                return repoA.localeCompare(repoB);
            }
            return a.name.localeCompare(b.name);
        });

        console.log(`Global Search: Found ${currentSearchResults.length} matching branches.`);

    } else {
        // --- PR Search Logic (Title or Everywhere) ---
        console.log(`Global Search: Filtering ${combinedResults.length} PRs locally (Mode: ${searchMode}) for query "${query}"`);

        const getMatchScore = (pr, query, mode) => {
            let score = 0;
            const titleLower = pr.title?.toLowerCase() || '';
            const ticketLower = pr.ticketNumber?.toLowerCase() || '';
            const sourceBranchLower = pr.branchInfo?.source?.toLowerCase() || '';
            const targetBranchLower = pr.branchInfo?.target?.toLowerCase() || '';

            if (mode === 'title') {
                if (ticketLower === query && ticketLower !== 'n/a') score += 100;
                if (titleLower.includes(query)) score += 50;
                if (ticketLower !== query && ticketLower.includes(query) && ticketLower !== 'n/a') score += 45;
                return score;
            }

            // Everywhere Mode
            const repoLower = pr.repoName?.toLowerCase() || '';
            const ownerLower = pr.ownerName?.toLowerCase() || '';
            const bodyLower = pr.body?.toLowerCase() || '';

            if (ticketLower === query && ticketLower !== 'n/a') score += 100;
            if (titleLower === query) score += 80;
            if (titleLower.includes(query)) score += 50;
            if (ticketLower !== query && ticketLower.includes(query) && ticketLower !== 'n/a') score += 45;
            if (repoLower.includes(query)) score += 30;
            if (ownerLower.includes(query)) score += 20;
            if (sourceBranchLower.includes(query)) score += 15;
            if (targetBranchLower.includes(query)) score += 10;
            if (bodyLower.includes(query)) score += 5;
            if (pr.labels?.some(label => label.name?.toLowerCase().includes(query))) score += 15;

            return score;
        };

        currentSearchResults = combinedResults
            .map(pr => {
                if (!pr) return null;
                return { ...pr, score: getMatchScore(pr, lowerQuery, searchMode) };
            })
            .filter(pr => pr && pr.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const dateB = new Date(b.actualLatestDate || b.updated_at || 0).getTime();
                const dateA = new Date(a.actualLatestDate || a.updated_at || 0).getTime();
                return dateB - dateA;
            });

        console.log(`Global Search: Found ${currentSearchResults.length} matching PRs (Mode: ${searchMode}).`);
    }

    // --- Display Results ---
    globalSearchCount.textContent = currentSearchResults.length;

    if (currentSearchResults.length === 0) {
      globalSearchResults.innerHTML = `
        <div class="global-search-empty">
          <i class="fas fa-search"></i>
          <h3>No results found for "${escapeHTML(query)}" in ${searchMode === 'branches' ? 'Branches' : 'PRs'}</h3>
          <p>Try a different search term or adjust search mode/scopes.</p>
        </div>
      `;
    } else {
      // --- Render Results ---
      let resultsHtml = '';
      if (searchMode === 'branches') {
          resultsHtml = renderBranchSearchResults(currentSearchResults, query);
      } else {
          resultsHtml = renderPRSearchResults(currentSearchResults, query);
      }


      globalSearchResults.innerHTML = resultsHtml;

      // Add click/keyboard handlers (keep existing logic)
      // Add click/keyboard handlers (adjust based on rendered item class)
      globalSearchResults.querySelectorAll('.global-search-result-item, .global-search-branch-item').forEach(item => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url');
          if (url) { window.open(url, '_blank'); closeGlobalSearch(); }
        });
        item.addEventListener('mouseenter', () => {
          selectedResultIndex = parseInt(item.getAttribute('data-index') || '-1');
          updateSelectedResult(globalSearchResults.querySelectorAll('.global-search-result-item, .global-search-branch-item'));
        });
        item.addEventListener('keydown', (e) => { if(e.key === 'Enter') item.click(); });
      });

      // Select first result automatically if needed
      // Select first result automatically
      const firstResultItem = globalSearchResults.querySelector('.global-search-result-item, .global-search-branch-item');
      if(document.activeElement === globalSearchInput && selectedResultIndex === -1 && firstResultItem) {
          selectedResultIndex = 0;
          updateSelectedResult(globalSearchResults.querySelectorAll('.global-search-result-item, .global-search-branch-item'));
          ensureVisible(firstResultItem); // Ensure first is visible
      }
    }
  } catch (error) {
    console.error('Error performing global search:', error);
    globalSearchResults.innerHTML = `
      <div class="global-search-empty">
        <i class="fas fa-exclamation-circle error-icon" style="color: var(--error-color);"></i>
        <h3>Error searching</h3>
        <p>Something went wrong. Please check the console or try again later.</p>
      </div>
    `;
    globalSearchCount.textContent = 'Error';
  } finally {
    globalSearchLoading.style.display = 'none'; // Hide loading spinner
  }
}, 300); // Keep 300ms debounce

/**
 * Renders Pull Request search results.
 * @param {Array} results - Array of enriched PR objects with scores.
 * @param {string} query - The original search query for highlighting.
 * @returns {string} HTML string for the results.
 */
function renderPRSearchResults(results, query) {
    return results.map((pr, index) => {
        const isOpen = pr.state === 'open';
        const statusIcon = isOpen ? '<i class="fas fa-code-branch"></i>' : '<i class="fas fa-check-circle"></i>';
        const statusClass = isOpen ? 'open' : 'closed';
        const ticketNumber = pr.ticketNumber || 'N/A';

        const formattedTitle = formatPRTitle(pr.title);
        const titleWithHighlight = highlightMatches(formattedTitle, query);
        const repoWithHighlight = highlightMatches(pr.repoName, query);
        const ownerWithHighlight = highlightMatches(pr.ownerName, query);
        const sourceBranchHighlight = pr.branchInfo?.source ? highlightMatches(pr.branchInfo.source, query) : '';
        const targetBranchHighlight = pr.branchInfo?.target ? highlightMatches(pr.branchInfo.target, query) : '';

        const displayDate = formatDate(pr.actualLatestDate || pr.updated_at);

        return `
          <div class="global-search-result-item" data-url="${escapeHTML(pr.html_url)}" data-index="${index}" role="button" tabindex="0">
            <div class="global-search-result-icon ${statusClass}">
              ${statusIcon}
            </div>
            <div class="global-search-result-content">
              <div class="global-search-result-title">
                ${ticketNumber !== 'N/A' ? `<span class="global-search-ticket">${escapeHTML(ticketNumber)}</span>` : ''}
                ${titleWithHighlight}
              </div>
              <div class="global-search-result-meta">
                <span><i class="fas fa-user"></i> ${ownerWithHighlight}</span>
                <span><i class="fas fa-code"></i> ${repoWithHighlight}</span>
                ${pr.branchInfo?.source ? `<span><i class="fas fa-code-branch"></i> ${sourceBranchHighlight} → ${targetBranchHighlight}</span>` : ''}
                <span><i class="far fa-clock"></i> ${displayDate}</span>
                ${isOpen && pr.approvals > 0 ? `<span><i class="fas fa-thumbs-up"></i> ${pr.approvals}</span>` : ''}
              </div>
            </div>
          </div>
        `;
    }).join('');
}

/**
 * Renders Branch search results.
 * @param {Array} results - Array of branch objects with repo context.
 * @param {string} query - The original search query for highlighting.
 * @returns {string} HTML string for the results.
 */
function renderBranchSearchResults(results, query) {
    return results.map((branch, index) => {
        const branchNameHighlight = highlightMatches(branch.name, query);
        const repoNameHighlight = highlightMatches(branch.repoName, query);
        const ownerHighlight = highlightMatches(branch.repoOwner, query);
        const branchUrl = `https://github.com/${escapeHTML(branch.repoOwner)}/${escapeHTML(branch.repoName)}/tree/${encodeURIComponent(branch.name)}`;
        const repoUrl = `https://github.com/${escapeHTML(branch.repoOwner)}/${escapeHTML(branch.repoName)}`;
        const lastCommitDate = branch.commit?.commit?.author?.date || branch.commit?.commit?.committer?.date;
        const displayDate = lastCommitDate ? formatDate(lastCommitDate) : 'N/A';

        return `
          <div class="global-search-branch-item" data-url="${branchUrl}" data-index="${index}" role="button" tabindex="0">
            <div class="global-search-result-icon branch-icon">
               <i class="fas fa-code-branch"></i>
            </div>
            <div class="global-search-result-content">
              <div class="global-search-result-title branch-title">
                ${branchNameHighlight}
              </div>
              <div class="global-search-result-meta">
                <span><i class="fas fa-book-open"></i> <a href="${repoUrl}" target="_blank" onclick="event.stopPropagation()">${ownerHighlight}/${repoNameHighlight}</a></span>
                ${lastCommitDate ? `<span><i class="far fa-clock"></i> ${displayDate}</span>` : ''}
                ${branch.protected ? `<span><i class="fas fa-lock protected-icon"></i> Protected</span>` : ''}
              </div>
            </div>
          </div>
        `;
    }).join('');
}

// Helper function to escape HTML (simple version)
function escapeHTML(str) {
    if (!str) return '';
    // Basic escaping, sufficient for inserting into HTML text content or attributes
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}