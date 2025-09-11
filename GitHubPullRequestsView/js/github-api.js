/*************************************************************
 * GITHUB API
 * Handles all requests to the GitHub API, including caching
 * and data enrichment.
 *************************************************************/

// Ensure GITHUB_TOKEN and GITHUB_USERNAME are defined (e.g., via external JS files)
if (typeof GITHUB_TOKEN === 'undefined' || typeof GITHUB_USERNAME === 'undefined') {
  console.error("GITHUB_TOKEN or GITHUB_USERNAME is not defined. Please create github_token.js and github_username.js");
  // Optionally, provide default values or throw an error
  // GITHUB_TOKEN = 'YOUR_DEFAULT_TOKEN'; // Use with caution
  // GITHUB_USERNAME = 'YOUR_DEFAULT_USERNAME';
  showToast("GitHub credentials missing. Please configure github_token.js and github_username.js.", "error", 0); // 0 duration = persistent
}



/**
 * Wrapper for fetch that handles caching, error notification, and rate limiting awareness.
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {boolean} bypassCache - Whether to bypass cache and force fetch from network
 * @returns {Promise<Response>} - Fetch response (may have `fromCache: true` property)
 */
async function safeFetch(url, options = {}, bypassCache = false) {
  options.headers = {
    ...options.headers,
    Authorization: `token ${GITHUB_TOKEN}`
  };

  // --- Cache Check ---
  if (!bypassCache && (!options.method || options.method.toUpperCase() === 'GET')) {
    const cachedEntry = requestCache.get(url); // Returns { data, status, statusText, timestamp } or null

    if (cachedEntry) {
      // **MODIFIED:** Directly use the validated timestamp from cachedEntry
      let cachedTimestampISO = 'N/A';
      try {
        // Timestamp was already validated by .get(), so this should be safe
        cachedTimestampISO = new Date(cachedEntry.timestamp).toISOString();
      } catch (e) {
        console.error(`CRITICAL: Error converting VALIDATED cached timestamp ${cachedEntry.timestamp} to ISO string for ${url}`, e);
        // If this fails, something is deeply wrong with Date handling.
      }

      // Create Response using data from the entry
      const clonedResponse = new Response(JSON.stringify(cachedEntry.data), { // Use cachedEntry.data
        status: cachedEntry.status || 200,
        statusText: cachedEntry.statusText || 'OK (from cache)',
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Hit': 'true',
          'X-Cached-Timestamp': cachedTimestampISO // Use validated & converted timestamp
        }
      });
      clonedResponse.fromCache = true;
      // console.log("Cache hit for:", url.substring(url.lastIndexOf('/') + 1)); // DEBUG
      return clonedResponse;
    }
     // console.log("Cache miss for:", url.substring(url.lastIndexOf('/') + 1)); // DEBUG
  }

  // --- Network Fetch ---
  try {
    const response = await fetch(url, options);

    // Log rate limit info
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    if (remaining !== null && parseInt(remaining) < 10) {
        const resetTime = new Date(reset * 1000).toLocaleTimeString();
        console.warn(`Low GitHub API Rate Limit: ${remaining}/${limit} remaining. Resets at ${resetTime}.`);
        showToast(`Low GitHub API Rate Limit: ${remaining}/${limit}. Resets at ${resetTime}.`, 'warning', 10000);
    }
    // console.log(`Rate Limit: ${remaining}/${limit}`); // Optional: Log on every request

    // Handle API errors
    if (!response.ok) {
      let errorMsg = `GitHub API Error: ${response.status} ${response.statusText}`;
      let errorType = 'error';
      try {
        const errorBody = await response.json();
        errorMsg += ` - ${errorBody.message || 'No details'}`;
        // Specific handling for common errors
         if (response.status === 404 && errorBody.message?.toLowerCase().includes('not found')) {
            console.warn(`Resource not found (404): ${url}`);
            // Don't show toast for typical 404s unless it's critical
         } else if (response.status === 403 && errorBody.message?.toLowerCase().includes('rate limit exceeded')) {
            errorMsg = `GitHub API Rate Limit Exceeded. Please wait and try again later. Resets at ${new Date(reset * 1000).toLocaleTimeString()}.`;
            errorType = 'error'; // Keep as error
            showToast(errorMsg, errorType, 30000); // Show longer duration
         } else if (response.status === 401) {
             errorMsg = `GitHub API Authentication Error (401). Check your GITHUB_TOKEN.`;
             errorType = 'error';
             showToast(errorMsg, errorType, 0); // Persistent
         } else {
             // Show toast for other non-404 errors
             showToast(errorMsg, errorType, 10000);
         }
      } catch (e) {/* Ignore if response body cannot be parsed */ }


      // Throw an error to stop processing for this item/request
      throw new Error(`API error ${response.status} for ${url}`);
    }


    // --- Cache Successful Response ---
    if (!options.method || options.method.toUpperCase() === 'GET') {
      try {
        const responseClone = response.clone();
        const data = await responseClone.json();
        // **MODIFIED:** Pass data and response details separately to requestCache.set
        requestCache.set(url, data, response.status, response.statusText);
      } catch (e) {
        console.warn(`Failed to parse or cache response body for ${url}:`, e);
      }
    }
    return response; // Return original response

  } catch (error) {
    // Handle network errors (fetch itself failed)
    if (error.message.includes('Failed to fetch')) {
        showToast('Network Error: Failed to connect to GitHub API.', 'error', 10000);
    }
    // Don't re-throw API errors already handled above, but re-throw others
    if (!error.message.startsWith('API error')) {
        console.error(`Error in safeFetch for ${url}:`, error);
        throw error; // Re-throw network errors or unexpected issues
    } else {
        // API errors were already logged and toasted, return null or handle gracefully
         return null; // Or adjust based on how callers handle fetch failures
    }
  }
}

// ============================================================
// Helper Functions for Data Enrichment
// ============================================================

/**
 * Fetches supplementary data for a list of PRs concurrently.
 * @param {Array} prList - Array of raw PR items from GitHub search API.
 * @param {boolean} isOpen - Indicates if the PRs are open (to decide if approvals are needed).
 * @returns {Promise<Array>} - Array of enriched PR items.
 */
async function enrichPRList(prList, isOpen = true) {
  if (!prList || prList.length === 0) return [];

  // Helper function for safe date parsing and getting timestamp
  function getSafeTimestamp(dateString) {
    if (!dateString) return 0;
    try {
      const timestamp = new Date(dateString).getTime();
      return isNaN(timestamp) ? 0 : timestamp; // Return 0 if Invalid Date
    } catch (e) {
      console.warn(`Could not parse date string: ${dateString}`, e);
      return 0; // Treat as oldest on error
    }
  }

  // **NEW**: Helper function to find the latest review submission date from a list of reviews
  function getLatestReviewTimestamp(reviews) {
    if (!reviews || reviews.length === 0) return 0;
    return reviews.reduce((latest, review) => {
      const currentTs = getSafeTimestamp(review.submitted_at);
      return Math.max(latest, currentTs);
    }, 0);
  }


  const dataPromises = prList.map(pr => {
    const repoUrlParts = pr.repository_url?.split('/');
    const repoName = repoUrlParts?.pop();
    const repoOwner = repoUrlParts?.pop();
    const prNumber = pr.number;

    // --- Fallback Data Structure ---
    const fallbackData = {
      ...pr,
      repoName: repoName || 'N/A',
      repoOwner: repoOwner || 'N/A',
      ownerRaw: pr.user?.login || 'N/A',
      ownerName: cleanOwnerName(pr.user?.login || 'N/A'),
      ticketNumber: extractTicketNumber(pr.title),
      approvals: 0,
      // Use updated_at safely as the ultimate fallback date
      actualLatestDate: pr.updated_at || new Date(0).toISOString(), // Use epoch if updated_at is missing
      branchInfo: null,
      prDetails: null, // Add field for full PR details
      hasMergeConflicts: false // Default to no conflicts
    };

    if (!repoName || !repoOwner || !prNumber) {
      console.warn("Skipping enrichment due to missing data:", pr);
      fallbackData.actualLatestDate = getSafeTimestamp(fallbackData.actualLatestDate) > 0
        ? fallbackData.actualLatestDate
        : new Date(0).toISOString();
      return Promise.resolve(fallbackData);
    }

    // --- Concurrent Fetching (REVISED) ---
    const promises = [
      fetchLatestCommentDate(repoOwner, repoName, prNumber), // Promise<string|null> - Fetches latest comment date
      fetchPRDetails(repoOwner, repoName, prNumber), // **CHANGED** Promise<Object|null> - Fetches full PR details (includes head.sha and branch names)
      fetchReviews(repoOwner, repoName, prNumber), // **CHANGED** Promise<Array> - Fetches reviews
      fetchMergeConflictStatus(repoOwner, repoName, prNumber) // **NEW** Promise<boolean> - Checks for merge conflicts
    ];


    return Promise.all(promises).then(([latestCommentDate, prDetails, reviews, hasMergeConflicts]) => {

      // Check if essential data is missing
      if (!prDetails) {
          console.warn(`Failed to fetch PR details for #${prNumber}. Using fallback.`);
          fallbackData.actualLatestDate = getSafeTimestamp(fallbackData.actualLatestDate) > 0 ? fallbackData.actualLatestDate : new Date(0).toISOString();
          return fallbackData;
      }

      // Use head.sha from the fetched PR details
      const latestSha = prDetails.head?.sha;
      let approvals = 0;

      if (latestSha && reviews && reviews.length > 0) {
        const approvingUsers = new Set();
        reviews.forEach(review => {
          // Count APPROVED reviews that were submitted for the current head SHA
          if (review.state === 'APPROVED' && review.commit_id === latestSha) {
            approvingUsers.add(review.user.login);
          }
          // Alternative logic (might be too broad): Count if approved after the commit date?
          // const reviewTs = getSafeTimestamp(review.submitted_at);
          // const commitTs = getSafeTimestamp(prDetails.head?.repo?.pushed_at); // Less reliable
          // if (review.state === 'APPROVED' && reviewTs > commitTs) { ... }
        });
        approvals = approvingUsers.size;
      }

      // --- Determine Actual Latest Date Safely (Enhanced) ---
      const baseDateTimestamp = getSafeTimestamp(isOpen ? pr.updated_at : (pr.closed_at || pr.updated_at));
      const commentDateTimestamp = getSafeTimestamp(latestCommentDate);
      const latestReviewTimestamp = getLatestReviewTimestamp(reviews); // Get latest review submission
      // **REMOVED** Commit timestamp calculation, not needed for this part anymore

      // Find the maximum valid timestamp
      const maxTimestamp = Math.max(
        baseDateTimestamp,
        commentDateTimestamp,
        latestReviewTimestamp
        // **REMOVED** latestCommitTimestamp
      );

      let actualLatestDateString;
      // Convert the maximum timestamp back to an ISO string from the corresponding source
      // Prioritize specific event timestamps if they are the maximum
      if (maxTimestamp === latestReviewTimestamp && maxTimestamp > 0) {
        // Find the review that matches the max timestamp
        const latestReview = reviews.find(r => getSafeTimestamp(r.submitted_at) === maxTimestamp);
        actualLatestDateString = latestReview?.submitted_at;
      } else if (maxTimestamp === commentDateTimestamp && maxTimestamp > 0) {
        actualLatestDateString = latestCommentDate;
      } else if (maxTimestamp === baseDateTimestamp && maxTimestamp > 0) {
        actualLatestDateString = isOpen ? pr.updated_at : (pr.closed_at || pr.updated_at);
      } else {
        actualLatestDateString = new Date(0).toISOString(); // Fallback to epoch if all else fails
        console.warn(`Could not determine valid latest date for PR #${prNumber}`);
      }
      // --- End Date Calculation ---

      // Extract branch info from prDetails
      const branchInfo = prDetails ? {
        source: prDetails.head?.ref || null,
        target: prDetails.base?.ref || null
      } : null;

      return {
        ...pr, // Keep original data from search result
        repoName,
        repoOwner,
        ownerRaw: pr.user?.login,
        ownerName: cleanOwnerName(pr.user?.login || ''),
        ticketNumber: extractTicketNumber(pr.title),
        approvals: approvals, // Use calculated approvals
        actualLatestDate: actualLatestDateString, // Store the determined valid date string
        branchInfo, // Add extracted branch info
        prDetails, // Store full details if needed later (optional)
        hasMergeConflicts: hasMergeConflicts || false // Add merge conflict status
      };
    }).catch(error => {
      console.error(`Error enriching PR #${prNumber} in ${repoOwner}/${repoName}:`, error);
      // Use the fallback structure, ensuring its date is valid
      fallbackData.actualLatestDate = getSafeTimestamp(fallbackData.actualLatestDate) > 0
        ? fallbackData.actualLatestDate
        : new Date(0).toISOString();
      return fallbackData;
    });
  });

  // Wait for all enrichment promises to complete
  const enrichedList = await Promise.all(dataPromises);

  // --- Safe Sorting ---
  enrichedList.sort((a, b) => {
    const timeA = getSafeTimestamp(a.actualLatestDate);
    const timeB = getSafeTimestamp(b.actualLatestDate);
    return timeB - timeA; // Sort descending (newest first)
  });
  // --- End Sorting ---

  return enrichedList;
}


/**
 * **NEW/REVISED** Fetches reviews for a PR.
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {Promise<Array>} - Array of review objects
 */
async function fetchReviews(owner, repo, pullNumber) {
  // Fetch more reviews to increase chances of catching relevant ones
  const reviewsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`;

  try {
    const reviewsRes = await safeFetch(reviewsUrl); // Use default cache settings for reviews
    if (!reviewsRes) return []; // Handle null response from safeFetch on API error
    const reviews = await reviewsRes.json();
    return reviews || [];
  } catch (error) {
    // Don't show toast here, handled by safeFetch
    console.warn(`Failed to fetch review data for ${owner}/${repo}#${pullNumber}:`, error.message);
    return []; // Return empty array on error
  }
}




// ============================================================
// Core API Fetching Functions
// ============================================================

/**
* Fetches the latest comment date for a PR/Issue.
* @param {string} owner - Repository owner
* @param {string} repo - Repository name
* @param {number} issueNumber - PR/Issue number
* @returns {Promise<string|null>} - ISO Date string or null
*/
async function fetchLatestCommentDate(owner, repo, issueNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=1&sort=created&direction=desc`;
  try {
    const resp = await safeFetch(url); // Use default cache settings
    if (!resp) return null; // Handle null response from safeFetch
    const comments = await resp.json();
    // Return the creation date of the latest comment
    return comments.length > 0 ? comments[0].created_at : null;
  } catch (error) {
    // Don't show toast for this, just log error and return null
    console.warn(`Failed to fetch latest comment date for ${owner}/${repo}#${issueNumber}:`, error.message);
    return null;
  }
}

/**
* Fetches full PR details (including head.sha, branches).
* @param {string} owner
* @param {string} repo
* @param {number} prNumber
* @returns {Promise<Object|null>} - Full PR object or null
*/
async function fetchPRDetails(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  try {
    const resp = await safeFetch(url); // Uses default cache
    if (!resp) return null; // Handle null response from safeFetch
    return await resp.json();
  } catch (error) {
    console.warn(`Failed to fetch PR details for ${owner}/${repo}#${prNumber}:`, error.message);
    return null;
  }
}

/**
 * **NEW** Fetches merge conflict status for a PR by checking if it's mergeable.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - PR number
 * @returns {Promise<boolean>} - True if there are merge conflicts, false otherwise
 */
async function fetchMergeConflictStatus(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  try {
    const resp = await safeFetch(url); // Uses same cache as fetchPRDetails
    if (!resp) return false; // Handle null response from safeFetch

    const prData = await resp.json();

    // GitHub API returns mergeable: null when it's still calculating
    // mergeable: false when there are conflicts
    // mergeable: true when it can be merged
    if (prData.mergeable === false) {
      return true; // Has merge conflicts
    }

    // Additional check: if mergeable_state indicates conflicts
    if (prData.mergeable_state === 'dirty' || prData.mergeable_state === 'conflicts') {
      return true; // Has merge conflicts
    }

    return false; // No merge conflicts
  } catch (error) {
    console.warn(`Failed to fetch merge conflict status for ${owner}/${repo}#${prNumber}:`, error.message);
    return false; // Default to no conflicts on error
  }
}


// ============================================================
// Paginated Fetch Functions (Used by Controllers)
// These fetch ONE page and rely on enrichPRList for details.
// ============================================================

/**
* Fetches one page of the user's open PRs.
* @param {number} page
* @param {number} perPage
* @param {boolean} forceRefresh
* @returns {Promise<Object|null>} { items: Array<enriched PR>, total_count: number }
*/
async function fetchMyOpenPrs(page = 1, perPage = 10, forceRefresh = false) {
  const url = `https://api.github.com/search/issues?q=state:open+type:pr+author:${GITHUB_USERNAME}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
  try {
    const resp = await safeFetch(url, {}, forceRefresh);
    if (!resp) return { items: [], total_count: 0 }; // Handle null response
    const data = await resp.json();
    const enrichedItems = await enrichPRList(data.items, true); // Enrich this page
    return { items: enrichedItems, total_count: data.total_count };
  } catch (error) {
    console.error("Failed to fetch My Open PRs:", error);
    return null; // Or return { items: [], total_count: 0 }
  }
}

/** Fetches one page of the user's closed PRs. */
async function fetchMyClosedPrs(page = 1, perPage = 10, forceRefresh = false) {
  const url = `https://api.github.com/search/issues?q=state:closed+type:pr+author:${GITHUB_USERNAME}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
  try {
    const resp = await safeFetch(url, {}, forceRefresh);
    if (!resp) return { items: [], total_count: 0 }; // Handle null response
    const data = await resp.json();
    const enrichedItems = await enrichPRList(data.items, false); // Enrich this page
    return { items: enrichedItems, total_count: data.total_count };
  } catch (error) {
    console.error("Failed to fetch My Closed PRs:", error);
    return null;
  }
}

/** Fetches one page of open PRs the user is involved in (reviews). */
async function fetchMyOpenReviews(page = 1, perPage = 10, forceRefresh = false) {
  const url = `https://api.github.com/search/issues?q=state:open+type:pr+involves:${GITHUB_USERNAME}+-author:${GITHUB_USERNAME}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
  try {
    const resp = await safeFetch(url, {}, forceRefresh);
    if (!resp) return { items: [], total_count: 0 }; // Handle null response
    const data = await resp.json();
    const enrichedItems = await enrichPRList(data.items, true); // Enrich this page
    return { items: enrichedItems, total_count: data.total_count };
  } catch (error) {
    console.error("Failed to fetch My Open Reviews:", error);
    return null;
  }
}

/** Fetches one page of closed PRs the user is involved in (reviews). */
async function fetchMyClosedReviews(page = 1, perPage = 10, forceRefresh = false) {
  const url = `https://api.github.com/search/issues?q=state:closed+type:pr+involves:${GITHUB_USERNAME}+-author:${GITHUB_USERNAME}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
  try {
    const resp = await safeFetch(url, {}, forceRefresh);
    if (!resp) return { items: [], total_count: 0 }; // Handle null response
    const data = await resp.json();
    const enrichedItems = await enrichPRList(data.items, false); // Enrich this page
    return { items: enrichedItems, total_count: data.total_count };
  } catch (error) {
    console.error("Failed to fetch My Closed Reviews:", error);
    return null;
  }
}



/**
* Fetches one page of open or closed PRs for the team/user.
* @param {string} state - 'open' or 'closed'.
* @param {number} pageNumber
* @param {boolean} myOnly - If true, fetches only user's PRs (for 'open' state).
* @param {number} perPage - Items per page override.
* @param {boolean} forceRefresh
* @returns {Promise<Object|null>} { items: Array<enriched PR>, total_count: number }
*/
async function fetchPullRequests(state, pageNumber, myOnly = false, perPage = null, forceRefresh = false, countOnly = false) {
  // Determine items per page
  const itemsPerPage = perPage ?? (state === 'open' ? preferences.openPrItemsPerPage : preferences.closedPrItemsPerPage);
  const org = 'weareplanet'; // Make configurable?
  const team_slug = 'integra-terminal-development-all'; // Make configurable?

  // Construct the base query
  let query = `state:${state}+type:pr`;

  // Add author/team filter
  if (state === 'open' && myOnly) {
    query += `+author:${GITHUB_USERNAME}`;
  } else {
    // This list should ideally be managed externally or fetched dynamically in a future improvement.
    const teamMembers = [
      'jfonseca-planet', 'varaujo-planet', 'pvieira-planet', 'dkelly-planet',
      'bgigante-planet', 'dbarbosa-planet', 'jneto-planet', 'drehm-planet',
      'cpereira-planet', 'plopes-planet', 'tpinto-planet', 'mcoutinho-planet',
      'anaritar', 'mpinto-planet', 'drodrigues-planet', 'jveiga-planet', 'ranacleto-planet'
      // Add/remove members as needed
    ];
    const authorsQuery = teamMembers.map(m => `author:${m}`).join('+');
    query += `+${authorsQuery}`;
  }

  const url = `https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=${itemsPerPage}&page=${pageNumber}`;

  try {
    const response = await safeFetch(url, {}, forceRefresh);
    if (!response) return { items: [], total_count: 0 }; // Handle null response
    const data = await response.json();

    // If countOnly is true, return only the total_count without enriching items
    if (countOnly) {
      return { items: [], total_count: data.total_count };
    }

    const enrichedItems = await enrichPRList(data.items, state === 'open');
    return { items: enrichedItems, total_count: data.total_count };
  } catch (error) {
    console.error(`Failed to fetch ${state} Pull Requests:`, error);
    return null;
  }
}

/**
* Fetches one page of team repositories.
* @param {number} page
* @param {number} perPage
* @param {boolean} forceRefresh
* @returns {Promise<Array>} - Raw repository objects (no enrichment needed here).
*/
async function fetchTeamRepositories(page = 1, perPage = 10, forceRefresh = false) {
  const org = 'weareplanet'; // Make configurable?
  const team_slug = 'integra-terminal-development-all'; // Make configurable?
  const url = `https://api.github.com/orgs/${org}/teams/${team_slug}/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
  try {
    const response = await safeFetch(url, {}, forceRefresh);
    if (!response) return []; // Handle null response
    return await response.json(); // Returns array directly
  } catch (error) {
    console.error("Failed to fetch Team Repositories:", error);
    return []; // Return empty array on error
  }
}

// ============================================================
// "Fetch All" Functions (Used for Filtering/Search)
// These handle pagination internally and return enriched lists.
// ============================================================

/** Generic helper to fetch all items for a given paginated function. */
async function fetchAllPaginated(fetchPageFunction, maxItems = 100, forceRefresh = false) {
  let allItems = [];
  let page = 1;
  const perPage = 50; // Fetch larger pages when getting all

  while (allItems.length < maxItems) {
    const data = await fetchPageFunction(page, perPage, forceRefresh); // Pass forceRefresh
    // Check for error or empty response
    if (!data || !data.items || data.items.length === 0) {
      // If it's page 1 and there's an error/no data, break immediately
      if (page === 1 && (!data || data.total_count === 0)) break;
      // If not page 1, maybe just reached the end
      if (data && data.items && data.items.length === 0) break;
      // If !data (error), maybe try next page cautiously or break? Let's break.
      if (!data) break;
    }

    allItems = allItems.concat(data.items); // data.items are already enriched by fetchPageFunction

    // Stop if we have enough items or reached the total reported count
    if (allItems.length >= maxItems || (data.total_count !== undefined && allItems.length >= data.total_count)) {
        break;
    }
    page++;
  }
  // Return only up to maxItems, already sorted by fetchPageFunction -> enrichPRList
  return allItems.slice(0, maxItems);
}

async function fetchAllMyOpenPrs(maxItems = MAX_FILTER_ITEMS, forceRefresh = false) {
  return fetchAllPaginated(fetchMyOpenPrs, maxItems, forceRefresh);
}
async function fetchAllMyClosedPrs(maxItems = MAX_FILTER_ITEMS, forceRefresh = false) {
  return fetchAllPaginated(fetchMyClosedPrs, maxItems, forceRefresh);
}
async function fetchAllMyOpenReviews(maxItems = MAX_FILTER_ITEMS, forceRefresh = false) {
  return fetchAllPaginated(fetchMyOpenReviews, maxItems, forceRefresh);
}
async function fetchAllMyClosedReviews(maxItems = MAX_FILTER_ITEMS, forceRefresh = false) {
  return fetchAllPaginated(fetchMyClosedReviews, maxItems, forceRefresh);
}
/** Fetches all PRs (open or closed) up to maxItems for filtering/search. */
async function fetchAllPullRequests(state, forceRefresh = false, maxItems = MAX_SEARCH_ITEMS_GLOBAL) {
  const fetchFn = (page, perPage, refresh) => fetchPullRequests(state, page, preferences.myOpenPrsOnly, perPage, refresh);
  return fetchAllPaginated(fetchFn, maxItems, forceRefresh);
}
/** Fetches all team repositories up to maxItems for filtering/search. */
async function fetchAllTeamRepositories(maxItems = MAX_FILTER_ITEMS, forceRefresh = false) {
  let allRepos = [];
  let page = 1;
  const perPage = 50;

  while (allRepos.length < maxItems) {
    const repos = await fetchTeamRepositories(page, perPage, forceRefresh); // Pass forceRefresh
    if (!repos || repos.length === 0) {
      break; // No more data or error
    }
    allRepos = allRepos.concat(repos);
    if (repos.length < perPage) { // GitHub doesn't always give total_count for repo lists
      break;
    }
    page++;
  }
  // Already sorted by API `sort=updated`
  return allRepos.slice(0, maxItems);
}


// ============================================================
// Specific Detail Fetch Functions (Used by Modals etc.)
// ============================================================

/** Fetches branches for a specific repo (paginated if needed). */
async function fetchProjectBranches(owner, repo, maxBranches = 50) {
  // Usually fewer than 50 branches, pagination might not be strictly needed
  const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=${maxBranches}`;
  try {
    const res = await safeFetch(url); // Use default cache
    if (!res) return []; // Handle null response
    return await res.json();
  } catch (error) {
    console.error(`Failed to fetch branches for ${owner}/${repo}:`, error);
    return [];
  }
}

/** Fetches commits for a specific branch (limited). */
async function fetchCommitsOfBranch(owner, repo, branchName, limit = 1) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branchName)}&per_page=${limit}`;
  try {
    const res = await safeFetch(url); // Use default cache
    if (!res) return []; // Handle null response
    return await res.json();
  } catch (error) {
    console.error(`Failed to fetch commits for ${owner}/${repo} branch ${branchName}:`, error);
    return [];
  }
}

/** Fetches PRs for a specific repo (limited). */
async function fetchRepoPullRequests(owner, repo, state = 'open', limit = 20) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}`;
  try {
    const res = await safeFetch(url); // Use default cache
    if (!res) return []; // Handle null response
    // Check if the response was actually JSON before parsing
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await res.json();
    } else {
        console.warn(`Received non-JSON response for ${url}`);
        return [];
    }
  } catch (error) {
    // Catch JSON parsing errors specifically if needed
    if (error instanceof SyntaxError) {
       console.error(`Failed to parse JSON response for ${owner}/${repo} PRs:`, error);
    } else {
       console.error(`Failed to fetch ${state} PRs for ${owner}/${repo}:`, error);
    }
    return [];
  }
}



/**
 * Fetch recent activity items (comments, reviews, commits) for a specific PR.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<Array>} Array of activity items, sorted newest first.
 */
async function fetchPRActivity(owner, repo, prNumber) {
  // **NEW:** Helper function for safe date parsing within this function's scope
  function getSafeTimestamp(dateString) {
    if (!dateString) return 0;
    try {
      const timestamp = new Date(dateString).getTime();
      return isNaN(timestamp) ? 0 : timestamp;
    } catch (e) {
      console.warn(`Could not parse date string in fetchPRActivity: ${dateString}`, e);
      return 0;
    }
  }
  // --- End Helper ---

  try {
    const timelineUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/timeline?per_page=30`; // Use timeline API
    const resp = await safeFetch(timelineUrl, {}, true); // Force refresh for latest activity
    if (!resp) throw new Error("Failed to fetch timeline from API."); // Handle null response

    const timelineEvents = await resp.json();
    if (!Array.isArray(timelineEvents)) throw new Error("Invalid timeline response from API.");


    const relevantEvents = timelineEvents.filter(event =>
      ['committed', 'commented', 'reviewed', 'merged', 'closed', 'reopened'].includes(event.event)
    ).map(event => {
      // Prioritize specific date fields based on event type
      let eventDate = event.created_at; // Default
      if (event.event === 'committed' && event.commit?.committer?.date) {
        eventDate = event.commit.committer.date;
      } else if (event.event === 'reviewed' && event.submitted_at) {
        eventDate = event.submitted_at;
      }

      let activity = {
        type: event.event,
        date: eventDate, // Assign determined date
        author: event.actor?.login || event.author?.name || event.user?.login || 'System',
        author_avatar: event.actor?.avatar_url || event.author?.avatar_url || event.user?.avatar_url,
        content: ''
      };

      // Simplified content assignment (original logic was good)
      switch (event.event) {
        case 'committed': activity.content = event.message || 'Commit added'; activity.type = 'commit'; break;
        case 'commented': activity.content = event.body || 'Comment added'; activity.type = 'comment'; break;
        case 'reviewed': activity.content = event.body || `Review: ${event.state}`; activity.type = 'review'; break;
        case 'merged': activity.content = `PR Merged by ${activity.author}`; activity.type = 'merged'; break;
        case 'closed': activity.content = `PR Closed ${event.commit_id ? 'via commit' : 'manually'} by ${activity.author}`; activity.type = 'closed'; break;
        case 'reopened': activity.content = `PR Reopened by ${activity.author}`; activity.type = 'reopened'; break;
      }
      return activity;

    }).filter(a => a.date); // Ensure event has a date string before proceeding

    // **MODIFIED:** Sort by date safely, newest first
    relevantEvents.sort((a, b) => getSafeTimestamp(b.date) - getSafeTimestamp(a.date));

    return relevantEvents.slice(0, 15); // Return recent events

  } catch (error) {
    console.error(`Error fetching PR timeline for ${owner}/${repo}#${prNumber}:`, error);
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Fetches all pull requests for a specific GitHub user
 * @param {string} username - GitHub username
 * @param {boolean} forceRefresh - Whether to bypass cache
 * @returns {Promise<Array>} - Array of PR objects
 */
async function fetchDeveloperPRs(username, forceRefresh = false) {
  // Fetch both open and closed PRs for the user
  try {
    // Fetch open PRs
    const openUrl = `https://api.github.com/search/issues?q=type:pr+author:${username}+state:open&sort=updated&order=desc&per_page=30`;
    const openResp = await safeFetch(openUrl, {}, forceRefresh);

    // Fetch closed PRs
    const closedUrl = `https://api.github.com/search/issues?q=type:pr+author:${username}+state:closed&sort=updated&order=desc&per_page=30`;
    const closedResp = await safeFetch(closedUrl, {}, forceRefresh);

    if (!openResp || !closedResp) return [];

    const openPRs = await openResp.json();
    const closedPRs = await closedResp.json();

    // Combine and return only the actual PR items
    return [...(openPRs.items || []), ...(closedPRs.items || [])];
  } catch (error) {
    console.error(`Failed to fetch PRs for developer ${username}:`, error);
    return [];
  }
}

/**
 * Fetches branches from repositories where the specified user has created Pull Requests.
 * This approach includes private repositories the dashboard user has access to.
 * @param {string} username - GitHub username (used for logging).
 * @param {Array} developerPRs - Array of PR objects fetched for the developer.
 * @param {boolean} forceRefresh - Whether to bypass cache for branch fetches.
 * @returns {Promise<Array>} - Array of branch objects with added repo/owner context.
 */
async function fetchDeveloperBranches(username, developerPRs, forceRefresh = false) {
  if (!developerPRs || developerPRs.length === 0) {
    console.log(`No PRs found for ${username}, skipping branch fetch.`);
    return [];
  }

  // 1. Extract unique repository full names from PRs
  const uniqueRepoFullNames = new Set();
  developerPRs.forEach(pr => {
    // Extract repo full_name reliably (handle potential variations in PR object structure)
    const repoFullName = pr.repository_url?.match(/repos\/(.+)/)?.[1] || pr.base?.repo?.full_name;
    if (repoFullName) {
      uniqueRepoFullNames.add(repoFullName);
    } else {
        console.warn("Could not extract repository name from PR:", pr);
    }
  });

  if (uniqueRepoFullNames.size === 0) {
      console.log(`Could not identify any repositories from ${username}'s PRs.`);
      return [];
  }

  console.log(`Fetching branches for ${username} from ${uniqueRepoFullNames.size} unique repositories:`, Array.from(uniqueRepoFullNames));

  // 2. Fetch branches for each relevant repository concurrently
  const branchPromises = Array.from(uniqueRepoFullNames).map(async (fullName) => {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) {
        console.warn(`Invalid repository name format skipped: ${fullName}`);
        return []; // Skip invalid names
    }
    try {
      // Use existing function to fetch branches for a specific repo
      // Fetch more branches per repo now, as we are targeting relevant ones
      const branches = await fetchProjectBranches(owner, repo, 100); // Fetch up to 100 branches

      // Add repo/owner context to each branch
      return branches.map(branch => ({
        ...branch, // Keep original branch data (name, commit, protected)
        repo: repo,
        owner: owner,
        // Add last commit date for potential sorting later if needed
        lastCommitDate: branch.commit?.commit?.author?.date || branch.commit?.commit?.committer?.date || null
      }));
    } catch (error) {
      // Log error but continue fetching for other repos
      console.warn(`Failed to fetch branches for ${owner}/${repo}:`, error.message);
      return []; // Return empty array for this repo on error
    }
  });

  // 3. Await all promises and flatten the results
  try {
    const branchGroups = await Promise.all(branchPromises);
    const allBranches = branchGroups.flat(); // Flatten the array of arrays

    // Optional: Sort branches (e.g., by repo then by last commit date descending)
    allBranches.sort((a, b) => {
        const repoCompare = `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`);
        if (repoCompare !== 0) return repoCompare;
        // Sort by date descending within the same repo
        const dateB = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
        const dateA = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
        return dateA - dateB; // Newest first
    });


    console.log(`Fetched a total of ${allBranches.length} branches for ${username} across relevant repos.`);
    return allBranches;

  } catch (error) {
      console.error(`Error processing branch fetches for developer ${username}:`, error);
      return []; // Return empty on overall processing error
  }
}