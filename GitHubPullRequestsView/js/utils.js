/*************************************************************
 * UTILITY FUNCTIONS
 * Generic helper functions used throughout the application
 *************************************************************/

/**
 * Removes the "-planet" suffix from GitHub usernames (case-insensitive).
 * @param {string} owner - GitHub username.
 * @returns {string} Cleaned username.
 */
function cleanOwnerName(owner) {
  return owner ? owner.replace(/-planet$/i, '') : '';
}

/**
 * Formats an ISO date string into a relative or absolute human-readable format.
 * @param {string} dateString - ISO date string.
 * @returns {string} Formatted date string (e.g., "2h ago", "5m ago", "Apr 5", "Mar 10, 2023").
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A'; // Handle null/undefined dates

  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
         return `${diffDays}d ago`;
    } else if (now.getFullYear() === date.getFullYear()) {
        // Same year, show Month Day
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
        // Different year, show Month Day, Year
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return 'Invalid Date'; // Return error indicator
  }
}

/**
 * Extracts Jira-like ticket number (e.g., PGIT-1234) from a string.
 * @param {string} title - String potentially containing a ticket number.
 * @returns {string} Ticket number (e.g., "PGIT-1234") or "N/A" if not found.
 */
function extractTicketNumber(title) {
  if (!title) return 'N/A';
  // Matches common Jira prefixes like PGIT, PTFI, etc., followed by a hyphen and digits.
  // Case-insensitive matching.
  const match = title.match(/\[?([A-Z]{2,6}-\d+)\]?/i);
  return match ? match[1].toUpperCase() : 'N/A'; // Return the captured group (the ticket ID itself)
}

/**
 * Removes PGIT prefix from the title if the setting is enabled.
 * @param {string} title - The original PR title
 * @returns {string} Title with PGIT prefix removed if setting is enabled, otherwise original title
 */
function formatPRTitle(title) {
  if (!title) return '';
  
  // Check if user preference is to remove PGIT prefix
  if (preferences && preferences.removePgitPrefix) {
    // Remove pattern like "PGIT-1234 " or "[PGIT-1234] " from the beginning
    // This handles: PGIT-1234, [PGIT-1234], PGIT-1234:, [PGIT-1234]:, PGIT-1234 -, etc.
    return title.replace(/^\[?([A-Z]{2,6}-\d+)\]?\s*[:\-]?\s*/i, '').trim();
  }
  
  return title;
}

/**
 * Creates HTML for an approval badge based on the approval count.
 * @param {number} approvals - Number of approvals.
 * @returns {string} HTML string for the badge.
 */
function buildApprovalBadge(approvals) {
  const count = Number(approvals) || 0; // Ensure it's a number

  if (count >= 2) {
    return `<span class="approval-badge approval-success" title="${count} approvals"><i class="fas fa-thumbs-up"></i> ${count}</span>`;
  } else if (count === 1) {
    return `<span class="approval-badge approval-one" title="1 approval"><i class="fas fa-check"></i> 1</span>`;
  } else {
    return `<span class="approval-badge approval-none" title="No approvals"><i class="far fa-circle"></i> 0</span>`;
    // Alternative icons: fas fa-times, far fa-hourglass-start
  }
}


/**
 * Highlights occurrences of a search term within a text string using <mark> tags.
 * Case-insensitive highlighting.
 * @param {string} text - The text to highlight within.
 * @param {string} searchTerm - The term to highlight. Can be empty.
 * @returns {string} - HTML string with matches wrapped in <mark> tags, or original text if no term/match.
 */
function highlightMatches(text, searchTerm) {
  if (!text) return '';
  if (!searchTerm) return escapeHTML(text); // Return escaped original text if no search term

  try {
    // Escape searchTerm for safe regex creation
    const escapedTerm = escapeRegExp(searchTerm);
    // Create case-insensitive regex
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    // Replace matches with <mark> tag, ensuring original text is escaped first
    return escapeHTML(text).replace(regex, '<mark class="highlight-match">$1</mark>');
  } catch (e) {
    console.warn("Highlighting regex error:", e);
    return escapeHTML(text); // Fallback to escaped original text on error
  }
}

/**
 * Escapes special characters in a string for safe use in RegExp.
 * @param {string} str - The input string.
 * @returns {string} - String with special regex characters escaped.
 */
function escapeRegExp(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/** Simple HTML escaping function */
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}


/**
 * Truncates a string to a maximum length, adding an ellipsis if truncated.
 * @param {string} str - The input string.
 * @param {number} maxLength - Maximum desired length.
 * @returns {string} - The original or truncated string.
 */
function truncateString(str, maxLength = 40) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '…' : str;
}
// Specific alias for branch names if needed elsewhere, using the generic function
function truncateBranchName(branchName) {
    return truncateString(branchName, 40);
}


/**
 * Updates pagination controls (buttons, page info) based on current state.
 * @param {number} totalItems - Total number of items available (filtered or unfiltered).
 * @param {number} currentPage - Current page number (1-based).
 * @param {string} sectionId - Base ID for the section (e.g., 'my-open-prs').
 * @param {string} pageInfoId - ID of the element displaying "Page X of Y".
 * @param {number} itemsPerPage - Number of items displayed per page.
 */
function updatePaginationControls(totalItems, currentPage, sectionId, pageInfoId, itemsPerPage) {
  const prevButton = document.getElementById(`${sectionId}-prev`);
  const nextButton = document.getElementById(`${sectionId}-next`);
  const pageInfo = document.getElementById(pageInfoId);
  const paginationContainer = document.getElementById(`${sectionId}-pagination`);

  if (!paginationContainer) return; // No pagination for this section

  // Ensure itemsPerPage is valid
  const validItemsPerPage = Math.max(1, itemsPerPage);
  const totalPages = Math.ceil(totalItems / validItemsPerPage);

  // Update button states
  if (prevButton) prevButton.disabled = currentPage <= 1;
  if (nextButton) nextButton.disabled = currentPage >= totalPages || totalItems === 0;

  // Update page info text
  if (pageInfo) {
    if (totalItems === 0) {
      pageInfo.textContent = 'No results';
    } else {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
  }

  // Show/hide pagination container based on whether there's more than one page
  paginationContainer.style.display = totalPages > 1 ? 'flex' : 'none';
}


/**
 * Sets up clear search ('x') buttons and related UI behavior for filter inputs.
 */
function setupSearchUI() {
  document.querySelectorAll('.filter-input-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('.filter-input');
    const clearBtn = wrapper.querySelector('.clear-search');
    const container = wrapper.closest('.filter-container');
    const statusEl = container?.querySelector('.search-status');

    if (!input || !clearBtn) return;

    // Show/hide clear button based on input value
    const toggleClearButton = () => {
        clearBtn.style.display = input.value.trim() ? 'block' : 'none';
    };

    input.addEventListener('input', toggleClearButton);
    input.addEventListener('change', toggleClearButton); // Handle potential pasting/auto-fill
    toggleClearButton(); // Initial check

    // Clear button click handler
    clearBtn.addEventListener('click', () => {
      if (input.value === '') return; // Don't do anything if already empty
      input.value = '';
      toggleClearButton(); // Hide button immediately

      // Find the related load/filter function and trigger it
      // This assumes the filterFunction is attached via an 'input' listener elsewhere
      input.dispatchEvent(new Event('input', { bubbles: true })); // Trigger the debounced filter
      input.focus();
    });

    // Ensure search status element exists (it might be added dynamically elsewhere too)
    if (container && !statusEl) {
       const newStatusEl = document.createElement('div');
       newStatusEl.className = 'search-status'; // Initially hidden via CSS opacity
       newStatusEl.innerHTML = '<span class="pulse-dot github-dot" data-tooltip="Loading from GitHub"></span>';
       // Insert after wrapper or adjust as needed
       wrapper.insertAdjacentElement('afterend', newStatusEl);
    }
  });
}


/**
 * Updates UI elements to reflect search/filter status (results info, empty state).
 * @param {string} sectionId - Base ID for the section (e.g., 'my-open-prs').
 * @param {boolean} isFiltering - Whether filtering is active.
 * @param {number} resultCount - Number of results found (can be total filtered count).
 * @param {string} searchTerm - The search term used.
 */
function updateSearchUI(sectionId, isFiltering, resultCount, searchTerm) {
    const container = document.getElementById(`${sectionId}-container`) || document.getElementById(sectionId); // Find container
    if (!container) return;

    const resultsInfo = document.getElementById(`${sectionId}-results-info`);
    const tableBody = document.getElementById(`${sectionId}-body`);
    const emptyState = container.querySelector(`.empty-state`); // Find empty state within the container

    // Update Results Info Bar
    if (resultsInfo) {
        if (isFiltering && searchTerm) {
            resultsInfo.style.display = 'block';
            if (resultCount === 0) {
                resultsInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> No results found for "<strong>${escapeHTML(searchTerm)}</strong>".`;
            } else {
                resultsInfo.innerHTML = `<i class="fas fa-info-circle"></i> Found <strong>${resultCount}</strong> results for "<strong>${escapeHTML(searchTerm)}</strong>".`;
            }
        } else {
            resultsInfo.style.display = 'none'; // Hide if not filtering or no search term
            resultsInfo.innerHTML = '';
        }
    }

    // Update Empty State Visibility
    if (emptyState && tableBody) {
         // Show empty state only if results are loaded AND the count is 0
         // We rely on the rendering function to clear the table first
        const shouldShowEmptyState = resultCount === 0 && (isFiltering || tableBody.innerHTML.includes('No items found')); // Show if filtering yields 0 OR normal load yields 0
        emptyState.style.display = shouldShowEmptyState ? 'flex' : 'none';
    } else if (emptyState) {
        // Fallback if table body not found
        emptyState.style.display = (isFiltering && resultCount === 0) ? 'flex' : 'none';
    }
}


/**
 * Updates the small status indicator dot next to search inputs.
 * @param {string} containerSelector - CSS selector for the container holding the .search-status element.
 * @param {boolean} fromCache - True if data loaded from cache, false if from network.
 * @param {number} duration - Auto-hide delay in ms (0 = no auto-hide).
 */
function updateLoadingIndicator(containerSelector, fromCache, duration = 2500) {
  const statusContainer = document.querySelector(`${containerSelector} .search-status`);
  if (!statusContainer) return;

  // Set dot color and tooltip based on source
  const dotClass = fromCache ? 'pulse-dot cache-dot' : 'pulse-dot github-dot';
  const tooltipText = fromCache ? 'Loaded from cache' : 'Loaded from GitHub';
  statusContainer.innerHTML = `<span class="${dotClass}" data-tooltip="${tooltipText}"></span>`;

  // Make status visible
  statusContainer.classList.add('visible');

  // Auto-hide after duration
  if (duration > 0) {
    setTimeout(() => {
      statusContainer.classList.remove('visible');
      // Optionally clear innerHTML after fade out if using opacity transition
      // setTimeout(() => { statusContainer.innerHTML = ''; }, 300);
    }, duration);
  }
}


/**
 * Displays a toast notification.
 * @param {string} message - The message to show.
 * @param {'info'|'success'|'warning'|'error'} type - Toast type.
 * @param {number} duration - Duration in ms (0 for persistent).
 */
function showToast(message, type = 'info', duration = 4000) {
  // Log based on type
  switch(type) {
      case 'error': console.error("Toast:", message); break;
      case 'warning': console.warn("Toast:", message); break;
      default: console.log("Toast:", message);
  }

  // Find or create the toast container
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');

  // Add icon
  let iconClass = 'fa-info-circle'; // Default
  if (type === 'success') iconClass = 'fa-check-circle';
  if (type === 'warning') iconClass = 'fa-exclamation-triangle';
  if (type === 'error') iconClass = 'fa-exclamation-circle';

  toast.innerHTML = `
    <div class="toast-icon"><i class="fas ${iconClass}"></i></div>
    <div class="toast-content">${escapeHTML(message)}</div>
    <button class="toast-close" aria-label="Close toast">&times;</button>
  `; // Using times symbol for close

  // Prepend toast so newest appears on top
  container.prepend(toast);

  // Close button handler
  const closeButton = toast.querySelector('.toast-close');
  const removeToast = () => {
      toast.classList.add('toast-hiding');
      // Remove from DOM after animation
      toast.addEventListener('transitionend', () => {
          if (toast.parentElement) toast.remove();
      }, { once: true });
      // Fallback removal if transition doesn't fire
       setTimeout(() => { if (toast.parentElement) toast.remove(); }, 400);
  };
  closeButton.addEventListener('click', removeToast);

  // Trigger show animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto-remove after duration (if duration > 0)
  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

/** Dismisses all currently visible toasts */
function clearAllToasts() {
  const container = document.getElementById('toast-container');
  if (container) {
    container.querySelectorAll('.toast').forEach(toast => {
      toast.classList.add('toast-hiding');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => { if (toast.parentElement) toast.remove(); }, 400);
    });
  }
}


/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce delay in milliseconds.
 * @param {boolean} immediate - If true, trigger the function on the leading edge instead of the trailing.
 * @returns {Function} A new debounced function.
 */
function debounce(func, wait = 300, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}


/**
 * Show activity details in a modal popup.
 * @param {Object} prDetails - Details of the PR.
 * @param {Array} changes - Array of activity items.
 */
function showActivityDetails(prDetails, changes) {
  let overlay = document.getElementById('activity-details-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'activity-details-overlay';
    overlay.className = 'activity-details-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideActivityDetails(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('active')) hideActivityDetails(); });
  }

  const formattedTitle = formatPRTitle(prDetails.title);
  const truncatedTitle = truncateString(formattedTitle, 60);

  overlay.innerHTML = `
    <div class="activity-details-container" role="dialog" aria-modal="true" aria-labelledby="activity-details-title">
      <div class="activity-details-header">
        <h3 class="activity-details-title" id="activity-details-title">
          <i class="fas fa-history"></i> <!-- Changed icon -->
          Recent Activity: PR #${prDetails.number}
        </h3>
        <button class="activity-details-close" onclick="hideActivityDetails()" aria-label="Close activity details">
          &times; <!-- Use times symbol -->
        </button>
      </div>
      <div class="activity-details-body">
        <div class="activity-pr-info">
          <h4>${escapeHTML(truncatedTitle)}</h4>
          <div class="activity-pr-meta">
            <a href="${escapeHTML(prDetails.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
            <span>Repository: ${escapeHTML(prDetails.repoName)}</span>
          </div>
        </div>
        <div class="activity-changes">
          ${renderActivityChanges(changes)}
        </div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // Focus the close button or the container for accessibility
    overlay.querySelector('.activity-details-close')?.focus();
  });
}

/** Hide the activity details modal */
function hideActivityDetails() {
  const overlay = document.getElementById('activity-details-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.addEventListener('transitionend', () => {
      if (overlay.parentElement) overlay.remove();
    }, { once: true });
    // Fallback removal
     setTimeout(() => { if (overlay?.parentElement) overlay.remove(); }, 400);
  }
}

/**
 * Render activity changes list HTML for the modal.
 * @param {Array} changes - Array of activity items.
 * @returns {string} HTML string.
 */
function renderActivityChanges(changes) {
  if (!changes || changes.length === 0) {
    return '<div class="activity-empty">No recent relevant activity found.</div>';
  }

  return changes.map(change => {
    let typeClass = 'update'; // Default
    let typeIcon = 'fas fa-info-circle';
    let typeLabel = 'Update';

    // Determine display based on standardized type from fetchPRActivity
    switch (change.type) {
      case 'comment': typeClass = 'comment'; typeIcon = 'far fa-comment'; typeLabel = 'Comment'; break;
      case 'review': typeClass = 'review'; typeIcon = 'fas fa-code-branch'; typeLabel = 'Review'; break; // Using branch icon
      case 'commit': typeClass = 'commit'; typeIcon = 'fas fa-code-commit'; typeLabel = 'Commit'; break;
      case 'merged': typeClass = 'merged'; typeIcon = 'fas fa-code-merge'; typeLabel = 'Merged'; break;
      case 'closed': typeClass = 'closed'; typeIcon = 'far fa-check-circle'; typeLabel = 'Closed'; break;
      case 'reopened': typeClass = 'reopened'; typeIcon = 'fas fa-door-open'; typeLabel = 'Reopened'; break;
      // Add more cases if needed based on timeline events
    }

    // Sanitize content before rendering
    const safeContent = escapeHTML(change.content || 'No content');
    // Basic markdown link handling (simple version)
    const linkedContent = safeContent.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    return `
      <div class="activity-diff-item">
        <div class="activity-diff-header">
          <div class="activity-author">
            <div class="activity-author-avatar">
              <img src="${escapeHTML(change.author_avatar || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png')}" alt="${escapeHTML(change.author)} avatar">
            </div>
            <div class="activity-author-info">
              <span class="activity-author-name">${escapeHTML(change.author)}</span>
              <span class="activity-diff-date" title="${new Date(change.date).toLocaleString()}">${formatDate(change.date)}</span>
            </div>
          </div>
          <span class="activity-diff-type ${typeClass}">
            <i class="${typeIcon}"></i> ${typeLabel}
          </span>
        </div>
        <div class="activity-diff-content">
          ${linkedContent}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Safely compresses data using pako
 * @param {string} data - Data string to compress
 * @returns {string|null} - Base64 encoded compressed string or null on error
 */
function safeCompress(data) {
  try {
    if (!data) return null;
    
    // Use Uint8Array.from with TextEncoder for proper binary handling
    const textEncoder = new TextEncoder();
    const binaryData = textEncoder.encode(data);
    
    // Compress the binary data
    const compressedData = pako.deflate(binaryData);
    
    // Convert compressed data to base64
    const base64String = btoa(
      Array.from(compressedData)
        .map(byte => String.fromCharCode(byte))
        .join('')
    );
    
    // Debug log to check compression result
    console.debug(`Compression: Original size: ${formatBytes(data.length)}, Compressed size: ${formatBytes(base64String.length)}`);
    
    return base64String;
  } catch (err) {
    console.error('Compression failed:', err);
    return null;
  }
}

/**
 * Safely decompresses data using pako
 * @param {string} base64Data - Base64 encoded compressed string
 * @returns {string|null} - Original string or null on error
 */
function safeDecompress(base64Data) {
  try {
    if (!base64Data) return null;
    
    // Convert base64 to binary array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Decompress
    const decompressedData = pako.inflate(bytes);
    
    // Convert back to string using TextDecoder
    return new TextDecoder().decode(decompressedData);
  } catch (err) {
    console.error('Decompression failed:', err);
    return null;
  }
}

/**
 * Show developer details in a modal popup.
 * @param {string} username - GitHub username of the developer
 * @param {string} displayName - Display name of the developer (cleaned version)
 */
function showDeveloperDetails(username, displayName) {
  let overlay = document.getElementById('developer-details-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'developer-details-overlay';
    overlay.className = 'activity-details-overlay'; // Reuse existing styles
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideDeveloperDetails(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('active')) hideDeveloperDetails(); });
  }

  overlay.innerHTML = `
    <div class="activity-details-container developer-details-container" role="dialog" aria-modal="true" aria-labelledby="developer-details-title">
      <div class="activity-details-header">
        <h3 class="activity-details-title" id="developer-details-title">
          <i class="fas fa-user-circle"></i>
          Developer: ${escapeHTML(displayName)}
        </h3>
        <button class="activity-details-close" onclick="hideDeveloperDetails()" aria-label="Close developer details">
          &times;
        </button>
      </div>
      <div class="activity-details-body">
        <div class="developer-info">
          <div class="developer-profile">
            <div class="developer-avatar-container">
              <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="developer-profile-info">
              <h4>${escapeHTML(displayName)}</h4>
              <div class="developer-meta">
                <a href="https://github.com/${escapeHTML(username)}" target="_blank" rel="noopener noreferrer">
                  <i class="fab fa-github"></i> View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <div class="developer-tabs">
          <div class="developer-tab-menu">
            <div class="developer-tab active" data-tab="developer-prs">
              <i class="fas fa-code-pull-request"></i> Pull Requests
            </div>
            <div class="developer-tab" data-tab="developer-branches">
              <i class="fas fa-code-branch"></i> Branches
            </div>
          </div>
          
          <div class="developer-tab-content active" id="developer-prs">
            <div class="developer-section-header">
              <div class="developer-section-title">Recent Pull Requests</div>
              <div class="developer-section-filters">
                <button class="dev-filter-btn active" data-filter="all">All</button>
                <button class="dev-filter-btn" data-filter="open">Open</button>
                <button class="dev-filter-btn" data-filter="closed">Closed</button>
              </div>
            </div>
            <div class="developer-loading">
              <i class="fas fa-spinner fa-spin"></i>
              <span>Loading pull requests...</span>
            </div>
            <div class="developer-prs-list"></div>
          </div>
          
          <div class="developer-tab-content" id="developer-branches">
            <div class="developer-section-header">
              <div class="developer-section-title">Active Branches</div>
            </div>
            <div class="developer-loading">
              <i class="fas fa-spinner fa-spin"></i>
              <span>Loading branches...</span>
            </div>
            <div class="developer-branches-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add tab switching functionality
  const tabs = overlay.querySelectorAll('.developer-tab');
  const tabContents = overlay.querySelectorAll('.developer-tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      overlay.querySelector(`#${tabId}`).classList.add('active');
    });
  });
  
  // Add filter functionality
  const filterBtns = overlay.querySelectorAll('.dev-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');
      
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const prItems = overlay.querySelectorAll('.developer-pr-item');
      prItems.forEach(item => {
        if (filter === 'all' || item.getAttribute('data-state') === filter) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  requestAnimationFrame(() => {
    overlay.classList.add('active');
    overlay.querySelector('.activity-details-close')?.focus();
    
    // Fetch developer data
    loadDeveloperDetails(username, overlay);
  });
}

/** Hide the developer details modal */
function hideDeveloperDetails() {
  const overlay = document.getElementById('developer-details-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.addEventListener('transitionend', () => {
      if (overlay.parentElement) overlay.remove();
    }, { once: true });
    // Fallback removal
     setTimeout(() => { if (overlay?.parentElement) overlay.remove(); }, 400);
  }
}

/**
 * Load developer details (PRs and branches) into the modal
 * @param {string} username - GitHub username
 * @param {HTMLElement} overlay - The modal overlay element
 */
async function loadDeveloperDetails(username, overlay) {
  let developerPRs = []; // Define the variable at the beginning of the function
  
  try {
    // Fetch developer PRs
    const prsContainer = overlay.querySelector('.developer-prs-list');
    const prsLoadingEl = overlay.querySelector('#developer-prs .developer-loading');
    
    if (prsContainer && prsLoadingEl) {
      prsLoadingEl.style.display = 'flex'; // Show loading
      prsContainer.innerHTML = ''; // Clear previous content
      
      developerPRs = await fetchDeveloperPRs(username); // Assign to the variable defined above
      renderDeveloperPRs(developerPRs, overlay);
      
      prsLoadingEl.style.display = 'none'; // Hide loading when done
    }
    
    // Fetch developer branches
    const branchesContainer = overlay.querySelector('.developer-branches-list');
    const branchesLoadingEl = overlay.querySelector('#developer-branches .developer-loading');
    
    if (branchesContainer && branchesLoadingEl) {
      branchesLoadingEl.style.display = 'flex'; // Show loading
      branchesContainer.innerHTML = ''; // Clear previous content
      
      // Pass the fetched PRs to the updated fetchDeveloperBranches function
      const developerBranches = await fetchDeveloperBranches(username, developerPRs);
      renderDeveloperBranches(developerBranches, overlay);
      
      branchesLoadingEl.style.display = 'none'; // Hide loading when done
    }
    
    // Try to get developer avatar from one of their PRs
    if (developerPRs && developerPRs.length > 0 && developerPRs[0].user?.avatar_url) {
      const avatarContainer = overlay.querySelector('.developer-avatar-container');
      if (avatarContainer) {
        avatarContainer.innerHTML = `
          <img src="${escapeHTML(developerPRs[0].user.avatar_url)}" alt="${escapeHTML(username)} avatar" class="developer-avatar">
        `;
      }
    }
  } catch (error) {
    console.error('Error loading developer details:', error);
    
    const prsContainer = overlay.querySelector('.developer-prs-list');
    const branchesContainer = overlay.querySelector('.developer-branches-list');
    const prsLoadingEl = overlay.querySelector('#developer-prs .developer-loading');
    const branchesLoadingEl = overlay.querySelector('#developer-branches .developer-loading');
    
    if (prsContainer) {
      prsContainer.innerHTML = 
        '<p class="error-message"><i class="fas fa-exclamation-triangle"></i> Failed to load pull requests.</p>';
    }
    
    if (branchesContainer) {
      branchesContainer.innerHTML = 
        '<p class="error-message"><i class="fas fa-exclamation-triangle"></i> Failed to load branches.</p>';
    }
    
    // Make sure to hide loading indicators even on error
    if (prsLoadingEl) prsLoadingEl.style.display = 'none';
    if (branchesLoadingEl) branchesLoadingEl.style.display = 'none';
  }
}

/**
 * Render developer PRs in the modal
 * @param {Array} prs - Array of PR objects
 * @param {HTMLElement} overlay - The modal overlay element
 */
function renderDeveloperPRs(prs, overlay) {
  const container = overlay.querySelector('.developer-prs-list');
  
  if (!prs || prs.length === 0) {
    container.innerHTML = '<div class="empty-state-mini"><i class="fas fa-code-pull-request"></i><p>No pull requests found</p></div>';
    return;
  }
  
  // Sort by updated date (newest first)
  prs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  
  const prHtml = prs.map(pr => {
    const isOpen = pr.state === 'open';
    const statusClass = isOpen ? 'open' : 'closed';
    const statusIcon = isOpen ? 
      '<i class="fas fa-code-branch"></i>' : 
      '<i class="fas fa-check-circle"></i>';
    const statusText = isOpen ? 'Open' : 'Closed';
    const repoName = pr.repository_url ? pr.repository_url.split('/').pop() : 'Unknown';
    
    return `
      <div class="developer-pr-item" data-state="${pr.state}">
        <div class="developer-pr-icon ${statusClass}">
          ${statusIcon}
        </div>
        <div class="developer-pr-content">
          <a href="${escapeHTML(pr.html_url)}" target="_blank" rel="noopener noreferrer" class="developer-pr-title">
            ${escapeHTML(formatPRTitle(pr.title))}
          </a>
          <div class="developer-pr-meta">
            <span class="repo-name"><i class="fas fa-code"></i> ${escapeHTML(repoName)}</span>
            <span class="pr-number">#${pr.number}</span>
            <span class="pr-status ${statusClass}">${statusText}</span>
            <span class="pr-date"><i class="far fa-calendar-alt"></i> ${formatDate(pr.updated_at)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = prHtml;
}

/**
 * Render developer branches in the modal
 * @param {Array} branches - Array of branch objects
 * @param {HTMLElement} overlay - The modal overlay element
 */
function renderDeveloperBranches(branches, overlay) {
    const container = overlay.querySelector('.developer-branches-list');

    if (!branches || branches.length === 0) {
        container.innerHTML = '<div class="empty-state-mini"><i class="fas fa-code-branch"></i><p>No branches found in relevant repositories</p></div>';
        return;
    }

    // Branches are already sorted by repo, then date descending by fetchDeveloperBranches

    let currentRepoFullName = '';
    let branchesHtml = '';

    branches.forEach(branch => {
        const repoFullName = `${branch.owner}/${branch.repo}`;
        const repoUrl = `https://github.com/${escapeHTML(branch.owner)}/${escapeHTML(branch.repo)}`;

        // Start a new repo group if the repo changes
        if (repoFullName !== currentRepoFullName) {
            if (currentRepoFullName) {
                branchesHtml += '</div></div>'; // Close previous branch list and repo group
            }
            currentRepoFullName = repoFullName;
            branchesHtml += `
                <div class="developer-repo-group">
                    <h4 class="developer-repo-name">
                        <i class="fas fa-book-open"></i>
                        <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" title="Go to repository">${escapeHTML(repoFullName)}</a>
                    </h4>
                    <div class="developer-branches-sublist">
            `; // Start new group and sublist
        }

        // Add the branch item
        const branchUrl = `${repoUrl}/tree/${encodeURIComponent(branch.name)}`;
        const lastCommitDate = branch.lastCommitDate ? formatDate(branch.lastCommitDate) : 'N/A';
        const lastCommitter = branch.commit?.commit?.author?.name || branch.commit?.commit?.committer?.name || 'N/A';
        const committerAvatar = branch.commit?.author?.avatar_url || branch.commit?.committer?.avatar_url || null;

        branchesHtml += `
            <div class="developer-branch-item">
                <div class="branch-icon-name">
                    <i class="fas fa-code-branch"></i>
                    <a href="${branchUrl}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(branch.name)}">
                        ${escapeHTML(truncateString(branch.name, 60))}
                    </a>
                    ${branch.protected ? '<i class="fas fa-lock protected-icon" title="Protected branch"></i>' : ''}
                </div>
                <div class="branch-details">
                    ${committerAvatar ? `<img src="${escapeHTML(committerAvatar)}" alt="${escapeHTML(lastCommitter)}" class="committer-avatar" title="Last committer: ${escapeHTML(lastCommitter)}">` : ''}
                    <span class="branch-last-commit" title="Last commit date">
                        <i class="far fa-clock"></i> ${lastCommitDate}
                    </span>
                </div>
            </div>
        `;
    });

    // Close the last repo group and sublist
    if (currentRepoFullName) {
        branchesHtml += '</div></div>';
    }

    container.innerHTML = branchesHtml;

    // Styles will be added/updated in css/styles.css
}