/*************************************************************
 * PR CONTROLLER
 * Handles pull request related functionality for all sections
 *************************************************************/

// Assume utility functions (debounce, formatDate, buildApprovalBadge, highlightMatches, etc.) are in utils.js
// Assume pageState, preferences, cachedData, pageDataCache, lastSeenCommentsMap, saveLastSeenComments are in data-manager.js
// Assume API functions (fetchMyOpenPrs, fetchAllMyOpenPrs, enrichPRList, etc.) are in github-api.js
// Assume constants MAX_FILTER_ITEMS are available

/**
 * Initialize PR controllers with event listeners
 */
function initializePRControllers() {
  // Setup event listeners for each section using helper functions
  setupSectionEventListeners('my-open-prs', loadMyOpenPrs, applyMyOpenPrsFilter, 'myOpenPrsPage', 'myOpenPrsPerPage');
  setupSectionEventListeners('my-closed-prs', loadMyClosedPrs, applyMyClosedPrsFilter, 'myClosedPrsPage', 'myClosedPrsPerPage');
  setupSectionEventListeners('my-reviews-open', loadMyReviewsOpen, applyMyReviewsOpenFilter, 'myReviewsOpenPage', 'myReviewsOpenPerPage');
  setupSectionEventListeners('my-reviews-closed', loadMyReviewsClosed, applyMyReviewsClosedFilter, 'myReviewsClosedPage', 'myReviewsClosedPerPage');
  setupSectionEventListeners('open-pr', () => loadPullRequests('open'), applyOpenPrFilter, 'currentPageOpenPRs', 'openPrItemsPerPage');
  setupSectionEventListeners('closed-pr', () => loadPullRequests('closed'), applyClosedPrFilter, 'currentPageClosedPRs', 'closedPrItemsPerPage');

  // Specific setup for Open PRs "Show Only My PRs" checkbox
  const myOpenPrsCheckbox = document.getElementById('my-open-prs-checkbox');
  if (myOpenPrsCheckbox) {
      myOpenPrsCheckbox.checked = !!preferences.myOpenPrsOnly;
      myOpenPrsCheckbox.addEventListener('change', async () => {
          preferences.myOpenPrsOnly = myOpenPrsCheckbox.checked;
          updatePreference('myOpenPrsOnly', preferences.myOpenPrsOnly);
          pageState.currentPageOpenPRs = 1;
          // Clear relevant caches (both raw and enriched page caches)
          const sectionId = 'open-pr';
          const rawCacheKey = `raw_${sectionId}`;
          cachedData[rawCacheKey] = []; // Clear full raw list cache
          pageDataCache[sectionId] = {}; // Clear enriched paginated cache
          tabDataLoaded[sectionId] = false; // Mark tab as needing reload
          await loadPullRequests('open'); // Reload data
          tabDataLoaded[sectionId] = true;
          updateMainTabCounts(); // Update counts which might change
      });
  }
}

/**
* Generic function to set up event listeners for a PR section
* @param {string} sectionId - Base ID for the section (e.g., 'my-open-prs')
* @param {Function} loadFunction - Function to load data for this section
* @param {Function} filterFunction - Function to apply filter for this section
* @param {string} pageStateKey - Key in `pageState` for current page
* @param {string} prefItemsPerPageKey - Key in `preferences` for items per page
*/
function setupSectionEventListeners(sectionId, loadFunction, filterFunction, pageStateKey, prefItemsPerPageKey) {
  const filterInput = document.getElementById(`${sectionId}-filter`);
  const prevButton = document.getElementById(`${sectionId}-prev`);
  const nextButton = document.getElementById(`${sectionId}-next`);
  const itemsPerPageSelect = document.getElementById(`${sectionId}-items-per-page`);
  const refreshButton = document.getElementById(`${sectionId}-refresh`);

  if (filterInput) filterInput.addEventListener('input', debounce(filterFunction, 300));

  if (prevButton) prevButton.addEventListener('click', async () => {
      if (pageState[pageStateKey] > 1) {
          pageState[pageStateKey]--;
          await loadFunction(); // Load previous page (will use cache if available)
      }
  });

  if (nextButton) nextButton.addEventListener('click', async () => {
      // Check if button is disabled (implies last page)
      if (!nextButton.disabled) {
        pageState[pageStateKey]++;
        await loadFunction(); // Load next page
      }
  });

  if (itemsPerPageSelect) itemsPerPageSelect.addEventListener('change', async function() {
      preferences[prefItemsPerPageKey] = parseInt(this.value, 10);
      updatePreference(prefItemsPerPageKey, preferences[prefItemsPerPageKey]);
      pageState[pageStateKey] = 1; // Reset to page 1
      // Clear enriched page cache for this section
      pageDataCache[sectionId] = {};
      // We don't necessarily need to clear the raw cache here, but reload will refetch page 1 raw data
      await loadFunction(); // Reload data with new page size
  });

  if (refreshButton) refreshButton.addEventListener('click', async () => {
      showToast(`Refreshing ${sectionId.replace('-', ' ')} from GitHub...`, 'info');
      console.log(`🔄 Clearing cache and fetching fresh ${sectionId} data from GitHub`);

      // Clear relevant caches
      const rawCacheKey = `raw_${sectionId}`;
      cachedData[rawCacheKey] = []; // Clear the full raw list cache
      pageDataCache[sectionId] = {}; // Clear enriched paginated cache
      pageState[pageStateKey] = 1; // Reset page

      // Reload data, forcing refresh from API
      const filterVal = filterInput ? filterInput.value.trim() : '';
      // Call load function, passing true for isFiltering if filter has value, and true for forceRefresh
      await loadFunction(filterVal !== '', true);

      // Update main tab counts if this is a main PR tab
      if (sectionId === 'open-pr' || sectionId === 'closed-pr') {
           updateMainTabCounts();
      }
      // Update My Activity subtab counts if it's one of those
      if (sectionId.startsWith('my-')) {
           updateMainTabCounts(); // This function updates all counts now
      }

      showToast(`${sectionId.replace('-', ' ')} refreshed successfully!`, 'success');
  });
}


// --- Filter Application Functions ---
// These simply trigger the corresponding load function with isFiltering = true
function applyMyOpenPrsFilter() { loadMyOpenPrs(true); }
function applyMyClosedPrsFilter() { loadMyClosedPrs(true); }
function applyMyReviewsOpenFilter() { loadMyReviewsOpen(true); }
function applyMyReviewsClosedFilter() { loadMyReviewsClosed(true); }
function applyOpenPrFilter() { loadPullRequests('open', true); }
function applyClosedPrFilter() { loadPullRequests('closed', true); }


/**
 * **REVISED** Centralized function to load data for PR sections. Handles RAW fetch + Enrichment.
 * @param {string} sectionId - ID of the section (e.g., 'my-open-prs', 'open-pr')
 * @param {Function} fetchFunction - API function to fetch paginated RAW data (e.g., fetchMyOpenPrs)
 * @param {Function} fetchAllFunction - API function to fetch all RAW data for filtering (e.g., fetchAllMyOpenPrs)
 * @param {string} pageStateKey - Key in pageState for current page number
 * @param {string} totalStateKey - Key in pageState for total item count (optional)
 * @param {string} itemsPerPageKey - Key in preferences for items per page
 * @param {boolean} isFiltering - Whether filtering is currently active
 * @param {boolean} forceRefresh - Whether to force fetch from API, bypassing cache
 * @returns {Promise<number>} - Number of items rendered
 */
async function loadSectionData(sectionId, fetchFunction, fetchAllFunction, pageStateKey, totalStateKey, itemsPerPageKey, isFiltering = false, forceRefresh = false) {
  const spinner = document.getElementById(`${sectionId}-spinner`);
  const body = document.getElementById(`${sectionId}-body`);
  const filterInput = document.getElementById(`${sectionId}-filter`);
  const filterVal = filterInput ? filterInput.value.toLowerCase().trim() : '';

  if (spinner) spinner.style.display = 'flex';
  if (body) body.innerHTML = ''; // Clear previous results immediately
  updateSearchUI(sectionId, isFiltering, 0, filterVal); // Show searching status early

  try {
      let itemsToRender = [];
      let totalCount = 0;
      const currentPage = pageState[pageStateKey];
      const itemsPerPage = preferences[itemsPerPageKey];
      const enrichedPageCacheKey = `page_${currentPage}_${itemsPerPage}`; // Cache key for ENRICHED page data
      const rawFullListCacheKey = `raw_${sectionId}`; // Cache key for RAW full list used in filtering

      if (isFiltering) {
          // --- Filtering Logic ---
          let allRawItems = cachedData[rawFullListCacheKey] || []; // Get RAW items from cache
          // Fetch all RAW items if cache is empty or forced refresh
          if (forceRefresh || allRawItems.length === 0) {
              console.log(`📊 Fetching all RAW ${sectionId} from API for filtering ${forceRefresh ? '(forced refresh)' : ''}`);
              updateLoadingIndicator(`#${sectionId}-container .search-status`, false, 0); // Show GitHub dot persistently
              allRawItems = await fetchAllFunction(MAX_FILTER_ITEMS, forceRefresh); // Fetch RAW
              cachedData[rawFullListCacheKey] = allRawItems; // Cache the RAW list
          } else {
              console.log(`📊 Using cached RAW ${sectionId} data for filtering`);
              updateLoadingIndicator(`#${sectionId}-container .search-status`, true, 0); // Show Cache dot persistently
          }

          // Enrich ALL raw items before filtering for tabs (simpler than filter-then-enrich subset)
          console.log(`✨ Enriching ${allRawItems.length} RAW items before filtering...`);
          const allEnrichedItems = await enrichPRList(allRawItems, !sectionId.includes('closed'));

          // Filter the ENRICHED list locally
          console.log(`🔍 Filtering ${allEnrichedItems.length} ENRICHED items locally...`);
          const filteredEnrichedItems = allEnrichedItems.filter(pr => filterItem(pr, filterVal)); // Filter ENRICHED data
          totalCount = filteredEnrichedItems.length;

          // Apply pagination to the filtered ENRICHED results
          const startIndex = (currentPage - 1) * itemsPerPage;
          itemsToRender = filteredEnrichedItems.slice(startIndex, startIndex + itemsPerPage);

      } else {
          // --- Normal Pagination Logic ---
          // Check ENRICHED page cache first
          if (!forceRefresh && pageDataCache[sectionId] && pageDataCache[sectionId][enrichedPageCacheKey]) {
              const cachedPageData = pageDataCache[sectionId][enrichedPageCacheKey];
              itemsToRender = cachedPageData.items; // Already enriched
              totalCount = cachedPageData.total;
              if (totalStateKey) pageState[totalStateKey] = totalCount;
              console.log(`📋 Using cached ENRICHED ${sectionId} data for page ${currentPage}`);
              updateLoadingIndicator(`#${sectionId}-container .search-status`, true); // Show Cache dot temporarily
          } else {
              // Fetch RAW data for the current page
              console.log(`🌐 Fetching RAW ${sectionId} data for page ${currentPage}${forceRefresh ? ' (forced refresh)' : ''}`);
              updateLoadingIndicator(`#${sectionId}-container .search-status`, false); // Show GitHub dot temporarily
              const rawData = await fetchFunction(currentPage, itemsPerPage, forceRefresh); // Fetch RAW page
              if (!rawData) throw new Error("Failed to fetch raw data from API."); // Handle API errors

              totalCount = rawData.total_count || 0; // Use total_count from the raw fetch
              if (totalStateKey) pageState[totalStateKey] = totalCount;

              // Enrich the fetched RAW page data
              console.log(`✨ Enriching ${rawData.items.length} RAW items for page ${currentPage}`);
              itemsToRender = await enrichPRList(rawData.items, !sectionId.includes('closed')); // Enrich current page RAW items

              // Cache the ENRICHED page data
              if (!pageDataCache[sectionId]) pageDataCache[sectionId] = {};
              pageDataCache[sectionId][enrichedPageCacheKey] = { items: itemsToRender, total: totalCount };
          }
      }

      // --- Render and Update UI ---
      // Render using the now ENRICHED itemsToRender list
      await renderSectionItems(sectionId, itemsToRender, isFiltering, filterVal);

      // Update the count badge with the determined totalCount
      const countBadge = document.getElementById(`${sectionId}-count`);
      if (countBadge) countBadge.textContent = totalCount;

      // Update pagination buttons and page info text
      updatePaginationControls(totalCount, currentPage, sectionId, `${sectionId}-page-info`, itemsPerPage);
      // Update the results info bar (e.g., "Found X results for 'search'")
      updateSearchUI(sectionId, isFiltering, totalCount, filterVal);

      return itemsToRender.length; // Return the number of items actually rendered on this page

  } catch (error) {
      console.error(`Error loading data for ${sectionId}:`, error);
      showToast(`Failed to load ${sectionId.replace('-', ' ')}.`, "error");
      if (body) body.innerHTML = `<tr><td colspan="6" class="text-center error-message">Error loading data. Please try again.</td></tr>`;
      // Reset counts and pagination on error
      const countBadge = document.getElementById(`${sectionId}-count`);
      if (countBadge) countBadge.textContent = '0';
      updatePaginationControls(0, 1, sectionId, `${sectionId}-page-info`, preferences[itemsPerPageKey]);
      updateSearchUI(sectionId, isFiltering, 0, filterVal);
      return 0;
  } finally {
      if (spinner) spinner.style.display = 'none';
      // Remove persistent loading indicator if filtering is done
      if(isFiltering) updateLoadingIndicator(`#${sectionId}-container .search-status`, false, 1); // Hide dot after filtering finishes
      saveLastSeenComments(); // Save activity status after rendering potentially new items
  }
}

// --- Specific Load Functions using the Centralized Loader ---
// These now correctly pass the raw-fetching API functions.

async function loadMyOpenPrs(isFiltering = false, forceRefresh = false) {
  return await loadSectionData(
      'my-open-prs',
      fetchMyOpenPrs,       // Fetches RAW page
      fetchAllMyOpenPrs,    // Fetches ALL RAW
      'myOpenPrsPage',
      'myOpenPrsTotal',
      'myOpenPrsPerPage',
      isFiltering,
      forceRefresh
  );
}

async function loadMyClosedPrs(isFiltering = false, forceRefresh = false) {
  return await loadSectionData(
      'my-closed-prs',
      fetchMyClosedPrs,     // Fetches RAW page
      fetchAllMyClosedPrs,  // Fetches ALL RAW
      'myClosedPrsPage',
      'myClosedPrsTotal',
      'myClosedPrsPerPage',
      isFiltering,
      forceRefresh
  );
}

async function loadMyReviewsOpen(isFiltering = false, forceRefresh = false) {
  return await loadSectionData(
      'my-reviews-open',
      fetchMyOpenReviews,   // Fetches RAW page
      fetchAllMyOpenReviews,// Fetches ALL RAW
      'myReviewsOpenPage',
      'myReviewsOpenTotal',
      'myReviewsOpenPerPage',
      isFiltering,
      forceRefresh
  );
}

async function loadMyReviewsClosed(isFiltering = false, forceRefresh = false) {
  return await loadSectionData(
      'my-reviews-closed',
      fetchMyClosedReviews,  // Fetches RAW page
      fetchAllMyClosedReviews, // Fetches ALL RAW
      'myReviewsClosedPage',
      'myReviewsClosedTotal',
      'myReviewsClosedPerPage',
      isFiltering,
      forceRefresh
  );
}

async function loadPullRequests(type, isFiltering = false, forceRefresh = false) {
  const sectionId = `${type}-pr`;
  const pageStateKey = type === 'open' ? 'currentPageOpenPRs' : 'currentPageClosedPRs';
  const itemsPerPageKey = type === 'open' ? 'openPrItemsPerPage' : 'closedPrItemsPerPage';

  return await loadSectionData(
      sectionId,
      // Fetch function needs to match the signature (page, perPage, refresh)
      (page, perPage, refresh) => fetchPullRequests(type, page, preferences.myOpenPrsOnly, perPage, refresh), // Fetches RAW page
      // FetchAll function needs to match the signature (maxItems, refresh)
      (max, refresh) => fetchAllPullRequests(type, refresh, max), // Fetches ALL RAW
      pageStateKey,
      null, // No separate total state key needed here, total comes from raw fetch
      itemsPerPageKey,
      isFiltering,
      forceRefresh
  );
}


/**
* Helper function to filter an ENRICHED PR item based on search text.
* Used for local filtering within tabs AFTER data is enriched.
* @param {Object} pr - The ENRICHED pull request item.
* @param {string} filterVal - The lowercased filter text.
* @returns {boolean} - True if the item matches the filter.
*/
function filterItem(pr, filterVal) {
    if (!filterVal) return true; // No filter applied

    // Check against various fields available in the enriched object
    return (
        safeIncludes(pr.title, filterVal) ||
        safeIncludes(pr.repoName, filterVal) ||
        safeIncludes(pr.ownerName, filterVal) ||
        safeIncludes(pr.ticketNumber, filterVal) ||
        safeIncludes(pr.branchInfo?.source, filterVal) ||
        safeIncludes(pr.branchInfo?.target, filterVal) ||
        safeIncludes(pr.prDetails?.body, filterVal) || // Check body from prDetails
        pr.labels?.some(label => safeIncludes(label.name, filterVal)) // Check labels
    );
}


/**
 * Renders the items (Pull Requests) for a specific section into its table body.
 * Expects ENRICHED items.
 * @param {string} sectionId - Base ID for the section (e.g., 'my-open-prs').
 * @param {Array<Object>} items - Array of ENRICHED Pull Request objects.
 * @param {boolean} isFiltering - Whether filtering is currently active.
 * @param {string} filterVal - The filter value used (for highlighting).
 */
async function renderSectionItems(sectionId, items, isFiltering, filterVal) {
  const tbody = document.getElementById(`${sectionId}-body`);
  const container = document.getElementById(`${sectionId}-container`) || document.getElementById(sectionId);
  const emptyState = container?.querySelector(`.empty-state`);

  if (!tbody) {
      console.error(`Table body not found for section: ${sectionId}`);
      return;
  }
  tbody.innerHTML = ''; // Clear previous content

  if (!items || items.length === 0) {
      if (emptyState) {
          emptyState.style.display = 'flex'; // Show empty state
          // Customize empty state message based on context
          const emptyStateP = emptyState.querySelector('p');
          if (emptyStateP) {
              emptyStateP.textContent = isFiltering
                  ? "Try adjusting your search terms or clearing filters."
                  : "There are no pull requests in this category.";
          }
      } else {
          // Fallback if empty state element isn't found
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No items found matching your criteria.</td></tr>`;
      }
      return;
  }

  if (emptyState) emptyState.style.display = 'none'; // Hide empty state if items exist

  // Try smart table rendering first if enabled
  let smartTableHtml = null;
  if (typeof renderSmartTableItems === 'function') {
      smartTableHtml = renderSmartTableItems(sectionId, items, isFiltering, filterVal);
  }

  if (smartTableHtml) {
      // Use smart table rendering
      tbody.innerHTML = smartTableHtml;
      
      // Update global smart table toggle button after rendering
      setTimeout(() => {
          if (typeof updateGlobalToggleButton === 'function') {
              updateGlobalToggleButton();
          }
      }, 50);
      
      return;
  }

  // Fall back to original rendering
  // Generate HTML rows using the enriched item data
  const rowsHtml = items.map(pr => {
      // Ensure we have the necessary enriched data
      const ticketNumber = pr.ticketNumber || 'N/A';
      const repoName = pr.repoName || 'N/A';
      const repoOwner = pr.repoOwner || 'N/A';
      const ownerRaw = pr.ownerRaw || pr.user?.login || 'N/A';
      const ownerName = pr.ownerName || 'N/A';
      const approvals = pr.approvals ?? 0;
      const actualLatestDate = pr.actualLatestDate || pr.updated_at; // Fallback to updated_at
      const displayDate = formatDate(actualLatestDate);
      const approvalsHtml = buildApprovalBadge(approvals);
      const prUrl = pr.html_url || '#'; // Fallback URL

      // --- New Activity Badge Logic ---
      let isNewActivity = false;
      const storedLastSeen = lastSeenCommentsMap[pr.number];
      const storedVisitTime = lastVisitTimeMap[pr.number];
      const now = new Date();

      if (!storedLastSeen) {
          isNewActivity = true;
      } else if (actualLatestDate && new Date(actualLatestDate) > new Date(storedLastSeen)) {
          isNewActivity = true;
      }
      // Auto-hide logic (moved to utils or separate function?)
      if (isNewActivity && storedVisitTime && (now - new Date(storedVisitTime)) > 10 * 60 * 1000) {
          isNewActivity = false;
          lastSeenCommentsMap[pr.number] = actualLatestDate;
          delete lastVisitTimeMap[pr.number];
      }
      if (isNewActivity && !storedVisitTime) {
          lastVisitTimeMap[pr.number] = now.toISOString();
      }
      // -----------------------------

      // --- Branch Info ---
      let branchHtml = '';
      const shouldShowBranches = preferences.showBranchNames || preferences.showBranchNamesIfNotMain;
      
      if (shouldShowBranches && pr.branchInfo) {
          const source = pr.branchInfo.source || '';
          const target = pr.branchInfo.target || '';
          
          // Check if target is a main branch (common main branch names)
          const mainBranches = ['main', 'master', 'develop', 'development', 'dev'];
          const isTargetMainBranch = target && mainBranches.includes(target.toLowerCase());
          
          // Determine if we should show branches based on the settings
          let showBranches = false;
          if (preferences.showBranchNames) {
              showBranches = true; // Always show if the general setting is enabled
          } else if (preferences.showBranchNamesIfNotMain && !isTargetMainBranch) {
              showBranches = true; // Show only if target is not a main branch
          }
          
          if (showBranches && source) {
              const sourceDisplay = highlightMatches(truncateBranchName(source), filterVal);
              const targetDisplay = highlightMatches(target, filterVal);
              branchHtml = `
              <div class="branch-name" style="display: block;">
                  <div class="branch-flow">
                      <i class="fas fa-code-branch"></i>
                      <span class="source-branch" title="${escapeHTML(source)}">${sourceDisplay}</span>
                      ${target ? `<span class="branch-arrow"><i class="fas fa-long-arrow-alt-right"></i></span><span class="target-branch" title="${escapeHTML(target)}">${targetDisplay}</span>` : ''}
                  </div>
              </div>`;
          }
      }
      // -------------------

      // --- Highlighting ---
      const formattedTitle = formatPRTitle(pr.title);
      const titleDisplay = highlightMatches(formattedTitle, filterVal);
      const repoNameDisplay = highlightMatches(repoName, filterVal);
      const ownerNameDisplay = highlightMatches(ownerName, filterVal);
      const ticketNumberDisplay = highlightMatches(ticketNumber, filterVal);
      // --------------------

      // --- Activity Modal Details Attribute ---
      // Ensure all necessary details for the modal are included and stringified correctly
      const prDetailsForBadge = {
          number: pr.number,
          title: pr.title,
          html_url: prUrl,
          repoName: repoName,
          repoOwner: repoOwner,
          updated_at: actualLatestDate // Pass the accurate date
      };
      const prDetailsAttr = `data-pr-details='${JSON.stringify(prDetailsForBadge).replace(/'/g, "'")}'`; // Escape single quotes for HTML attribute
      const newBadge = isNewActivity ?
          `<span class="new-badge" ${prDetailsAttr} onclick="handleActivityBadgeClick(this, ${pr.number}, '${actualLatestDate}')">
              <i class="fas fa-bell"></i> NEW
           </span>` : '';
      // ----------------------------

      // --- Generate Table Row based on Section ---
      const isMyPrSection = sectionId.startsWith('my-') && !sectionId.includes('review');
      const repoLink = `https://github.com/${repoOwner}/${repoName}`;
      const ownerLink = `https://github.com/${ownerRaw}`;
      const ticketLink = `https://jira.weareplanet.com/browse/${ticketNumber}`;

      // --- Merge Conflict Indicator ---
      const mergeConflictIndicator = pr.hasMergeConflicts ?
          `<span class="merge-conflict-badge" title="This PR has merge conflicts that need to be resolved">
              <i class="fas fa-code-branch"></i> CONFLICTS
           </span>` : '';

      // Row Structure: Ticket | PR Name + Branch | [Owner] | Project | Date | Approvals
      let rowHtml = `<tr class="pr-row ${isNewActivity ? 'tr-new-activity' : ''}" data-pr-number="${pr.number}">`; // Add class for potential styling
      // Ticket
      rowHtml += `<td>${ticketNumber !== 'N/A' ? `<a href="${ticketLink}" target="_blank">${ticketNumberDisplay}</a>` : ticketNumberDisplay}</td>`;
      // Title + Badge + Branch (merge conflict badge goes with other badges)
      rowHtml += `<td>${newBadge}${mergeConflictIndicator}<a href="${prUrl}" target="_blank">${titleDisplay}</a>${branchHtml}</td>`;
      // Owner (Conditional)
      if (!isMyPrSection) {
          // Add click handler for developer details
          rowHtml += `<td><a href="javascript:void(0)" class="developer-link" 
                        data-username="${escapeHTML(ownerRaw)}" 
                        data-displayname="${escapeHTML(ownerName)}" 
                        onclick="showDeveloperDetails('${escapeHTML(ownerRaw)}', '${escapeHTML(ownerName)}')">${ownerNameDisplay}</a></td>`;
      }
      // Project
      rowHtml += `<td><a href="${repoLink}" target="_blank">${repoNameDisplay}</a></td>`;
      // Date
      rowHtml += `<td class="date-column" data-iso="${actualLatestDate || ''}">${displayDate}</td>`;
      // Approvals
      rowHtml += `<td class="approval-column">${approvalsHtml}</td>`;
      rowHtml += `</tr>`;

      return rowHtml;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // Add click handlers for developer links
  const developerLinks = tbody.querySelectorAll('.developer-link');
  developerLinks.forEach(link => {
    const username = link.getAttribute('data-username');
    const displayName = link.getAttribute('data-displayname');
    
    // Remove existing onclick to avoid duplicate handlers
    link.removeAttribute('onclick');
    
    // Add click event listener
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showDeveloperDetails(username, displayName);
    });
  });
  
  // Update global smart table toggle button after rendering (for regular tables too)
  setTimeout(() => {
      if (typeof updateGlobalToggleButton === 'function') {
          updateGlobalToggleButton();
      }
  }, 50);
}

/**
 * Handles click on the 'NEW' activity badge.
 * Fetches activity and updates state. Shows modal.
 * @param {HTMLElement} badgeElement - The clicked badge element.
 * @param {number} prNumber - The PR number.
 * @param {string} currentUpdatedAt - The ISO date string of the latest known update (used to mark as seen).
 */
async function handleActivityBadgeClick(badgeElement, prNumber, currentUpdatedAt) {
    if (!badgeElement || badgeElement.classList.contains('loading')) return;
    badgeElement.classList.add('loading');

    const originalHTML = badgeElement.innerHTML;
    badgeElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Loading indicator

    try {
        const prDetailsString = badgeElement.getAttribute('data-pr-details');
        if (!prDetailsString) throw new Error("Missing PR details attribute on badge.");

        // Replace escaped single quotes before parsing
        const prDetails = JSON.parse(prDetailsString.replace(/'/g, "'"));

        // Fetch recent activity using the details
        const changes = await fetchPRActivity(prDetails.repoOwner, prDetails.repoName, prDetails.number);

        // Show the modal with the fetched changes
        showActivityDetails(prDetails, changes); // Assuming showActivityDetails is defined in utils.js or ui-controller.js

        // Update last seen state AFTER successfully showing modal
        lastSeenCommentsMap[prNumber] = currentUpdatedAt; // Mark this update as seen
        delete lastVisitTimeMap[prNumber]; // Remove the visit time marker
        saveLastSeenComments(); // Persist changes

        // Hide the badge smoothly after a short delay
        // Apply styles for hiding transition
        badgeElement.style.transition = 'opacity 0.3s ease, width 0.3s ease, margin 0.3s ease, padding 0.3s ease';
        badgeElement.style.opacity = '0';
        badgeElement.style.width = '0';
        badgeElement.style.padding = '0 0'; // Collapse padding
        badgeElement.style.marginRight = '0'; // Collapse margin

        // Optional: Remove the element completely after transition
        // setTimeout(() => { badgeElement.remove(); }, 300); // Might cause issues if user clicks again quickly

    } catch (error) {
        console.error('Error handling activity badge click:', error);
        showToast('Failed to load recent activity.', 'error');
        badgeElement.innerHTML = originalHTML; // Restore badge on error
    } finally {
        // Remove loading class slightly later to ensure it doesn't conflict with hide transition
        setTimeout(() => badgeElement.classList.remove('loading'), 100);
    }
}


/**
* Update counts in the main tab bar badges and My Activity sub-tab badges.
* Relies on total_count from paginated fetches or state variables.
*/
async function updateMainTabCounts() {
  const openPrCountEl = document.getElementById('open-pr-count');
  const closedPrCountEl = document.getElementById('closed-pr-count');

  // Helper to update a main tab count
  const updateCount = async (state, element) => {
      const sectionId = `${state}-pr`;
      const pageCacheKey = `page_1_${preferences[state === 'open' ? 'openPrItemsPerPage' : 'closedPrItemsPerPage']}`; // Key for page 1 cache
      const rawCacheKey = `raw_${sectionId}`;

      // 1. Check ENRICHED Page 1 Cache for total
      const firstPageCache = pageDataCache[sectionId]?.[pageCacheKey];
      if (firstPageCache?.total !== undefined) {
          element.textContent = firstPageCache.total;
          return; // Found total in enriched cache
      }

      // 2. Check RAW Full List Cache length (less accurate for total)
      // Note: This might under-report if list exceeds MAX_FILTER_ITEMS
      if (cachedData[rawCacheKey]?.length > 0) {
          const cachedLength = cachedData[rawCacheKey].length;
          element.textContent = cachedLength; // Show length as temporary count
          // If it seems capped, try fetching the real total in background
          if (cachedLength >= MAX_FILTER_ITEMS) {
               fetchPullRequests(state, 1, preferences.myOpenPrsOnly, 1) // Fetch page 1, 1 item RAW
                  .then(data => { if (data?.total_count !== undefined) element.textContent = data.total_count; })
                  .catch(() => { /* Keep existing count on error */ });
          }
          return; // Used raw cache length
      }

      // 3. Fetch total count from API (minimal request - page 1, 1 item)
      element.textContent = '...'; // Indicate loading
      try {
          const data = await fetchPullRequests(state, 1, preferences.myOpenPrsOnly, 1); // Fetch RAW page 1, 1 item
          element.textContent = data?.total_count !== undefined ? data.total_count : '0';
      } catch {
          element.textContent = '?'; // Indicate error
      }
  };

  // Update main Open/Closed PR tabs
  if (openPrCountEl) await updateCount('open', openPrCountEl);
  if (closedPrCountEl) await updateCount('closed', closedPrCountEl);

  // Update My Activity sub-tab counts (using state variables updated by loadSectionData)
  const myOpenPrsCount = document.getElementById('my-open-prs-count');
  const myClosedPrsCount = document.getElementById('my-closed-prs-count');
  const myReviewsOpenCount = document.getElementById('my-reviews-open-count');
  const myReviewsClosedCount = document.getElementById('my-reviews-closed-count');

  // Use the total counts stored in pageState during loadSectionData execution
  if (myOpenPrsCount) myOpenPrsCount.textContent = pageState.myOpenPrsTotal || '0';
  if (myClosedPrsCount) myClosedPrsCount.textContent = pageState.myClosedPrsTotal || '0';
  if (myReviewsOpenCount) myReviewsOpenCount.textContent = pageState.myReviewsOpenTotal || '0';
  if (myReviewsClosedCount) myReviewsClosedCount.textContent = pageState.myReviewsClosedTotal || '0';
}