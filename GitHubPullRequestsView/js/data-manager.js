/*************************************************************
 * DATA MANAGER
 * Handles application state, caching configuration, and data persistence
 *************************************************************/

// ============ STATE AND CACHE VARIABLES ============

// --- Constants ---
// Max items to fetch when filtering within a tab (can be less than global search)
const MAX_FILTER_ITEMS = 150;
// Max items for global search (defined in search-controller.js as MAX_SEARCH_ITEMS_GLOBAL)

// --- User Preferences (Loaded from localStorage with defaults) ---
const preferences = {
  darkMode: loadPreference('darkMode', false),
  defaultTab: loadPreference('defaultTab', 'my-activity'),
  myOpenPrsOnly: loadPreference('myOpenPrsOnly', false), // For the main 'Open PRs' tab filter

  // Items per page for each section
  myOpenPrsPerPage: loadPreference('myOpenPrsPerPage', 20),
  myClosedPrsPerPage: loadPreference('myClosedPrsPerPage', 20),
  myReviewsOpenPerPage: loadPreference('myReviewsOpenPerPage', 20),
  myReviewsClosedPerPage: loadPreference('myReviewsClosedPerPage', 20),
  openPrItemsPerPage: loadPreference('openPrItemsPerPage', 50),
  closedPrItemsPerPage: loadPreference('closedPrItemsPerPage', 50),
  projectsPerPage: loadPreference('projectsPerPage', 50), // Corrected key name

  // Display settings
  fullWidthTables: loadPreference('fullWidthTables', false),
  showBranchNames: loadPreference('showBranchNames', false),
  showBranchNamesIfNotMain: loadPreference('showBranchNamesIfNotMain', false),
  smartTableMode: loadPreference('smartTableMode', false),
  removePgitPrefix: loadPreference('removePgitPrefix', true),

  // Performance settings
  preloadData: loadPreference('preloadData', false),

  // Cache timeout settings (in minutes, used to initialize requestCache)
  'cache-timeout-default': loadPreference('cache-timeout-default', 30),
  'cache-timeout-repo': loadPreference('cache-timeout-repo', 45),
  'cache-timeout-commits': loadPreference('cache-timeout-commits', 30),
  'cache-timeout-branches': loadPreference('cache-timeout-branches', 30)
};

// --- Current Page States ---
const pageState = {
  // My Activity Tab
  myOpenPrsPage: 1,
  myOpenPrsTotal: 0,
  myClosedPrsPage: 1,
  myClosedPrsTotal: 0,
  myReviewsOpenPage: 1,
  myReviewsOpenTotal: 0,
  myReviewsClosedPage: 1,
  myReviewsClosedTotal: 0,
  // Main Tabs
  currentPageOpenPRs: 1,
  currentPageClosedPRs: 1,
  currentPageProjects: 1,
};

// --- Tab Data Loaded Tracking ---
const tabDataLoaded = {
  'my-activity': false, // Will be marked true after initial loads in app.js
  'open-pr': false,
  'closed-pr': false,
  'projects': false
};

// --- Favorite Projects (from localStorage) ---
let favoriteProjects = JSON.parse(localStorage.getItem('favoriteProjects') || '[]');

// --- Data Caches ---

// Cache for paginated data (stores data per page to avoid refetching on page change)
// Keys: sectionId (e.g., 'my-open-prs'), Value: { 'page_X_Y': { items: [], total: N }, ... }
const pageDataCache = {
  'my-open-prs': {},
  'my-closed-prs': {},
  'my-reviews-open': {},
  'my-reviews-closed': {},
  'open-pr': {},
  'closed-pr': {},
  'projects': {}
};

// Cache for full lists (used for filtering/searching within tabs)
// Stores an array of enriched items.
const cachedData = {
  'my-open-prs': [],
  'my-closed-prs': [],
  'my-reviews-open': [],
  'my-reviews-closed': [],
  'open-pr': [],       // Corresponds to the main 'Open PRs' tab
  'closed-pr': [],     // Corresponds to the main 'Closed PRs' tab
  'projects': []
};

// --- Activity Tracking (for "NEW" badges) ---
let lastSeenCommentsMap = JSON.parse(localStorage.getItem('lastSeenComments') || '{}');
let lastVisitTimeMap = JSON.parse(localStorage.getItem('lastVisitTimes') || '{}');

// --- API Request Cache (prevents redundant API calls) ---
const requestCache = {
  // Load from localStorage with decompression if needed
  _store: (function() {
    try {
      const storedData = localStorage.getItem('github_api_cache');
      if (!storedData) return {};
      
      // Check if data is compressed (starts with specific bytes)
      if (storedData.startsWith('pako:')) {
        // Remove the prefix and decompress
        const base64Data = storedData.substring(5); // Skip 'pako:'
        
        // Use the safeDecompress utility function
        const decompressedString = safeDecompress(base64Data);
        if (!decompressedString) {
          console.error('Failed to decompress cache data');
          return {};
        }
        
        return JSON.parse(decompressedString);
      } else {
        // Legacy uncompressed data
        return JSON.parse(storedData);
      }
    } catch (err) {
      console.error('Failed to load or decompress API cache:', err);
      return {};
    }
  })(),
  
  _saveTimeout: null,
  
  // Compression settings
  _compression: {
    enabled: true, // Can be toggled if needed
    prefix: 'pako:', // Identifier for compressed data
  },

  // Cache expiration times in milliseconds (initialized from preferences)
  expirationTimes: {
    default: preferences['cache-timeout-default'] * 60 * 1000,
    repo: preferences['cache-timeout-repo'] * 60 * 1000,
    commits: preferences['cache-timeout-commits'] * 60 * 1000,
    branches: preferences['cache-timeout-branches'] * 60 * 1000,

    // Function to determine expiration time based on URL pattern matching
    getForUrl(url) {
      if (url.includes('/repos/') && url.includes('/branches')) return this.branches;
      if (url.includes('/repos/') && url.includes('/commits')) return this.commits;
      if (url.includes('/repos/') && !url.includes('/pulls') && !url.includes('/issues') && !url.includes('/search')) return this.repo;
      return this.default;
    }
  },

  // Get cached data if available and not expired
  get(url) {
    const cachedEntry = this._store[url];

    // **VALIDATION ON GET:** Check existence and timestamp validity
    // Timestamp is now a direct property of the cachedEntry
    if (!cachedEntry || typeof cachedEntry.timestamp !== 'number' || isNaN(cachedEntry.timestamp) || cachedEntry.timestamp <= 0) {
        if (cachedEntry) { // If entry exists but timestamp is bad, delete it
            console.warn(`Removing cache for ${url} due to invalid/missing timestamp:`, cachedEntry.timestamp);
            delete this._store[url];
            this.debouncedSave();
        }
        return null; // Invalid cache entry
    }

    // Check if expired using the validated timestamp
    const expirationDuration = this.expirationTimes.getForUrl(url);
    if (Date.now() - cachedEntry.timestamp > expirationDuration) {
      delete this._store[url];
      this.debouncedSave();
      return null; // Expired
    }

    // Return the whole entry (data + metadata)
    // safeFetch will need to handle this structure now
    return cachedEntry;
  },

  // Store data in cache with a timestamp
  set(url, responseData, status, statusText) {
    const timestamp = Date.now(); // Get current, valid timestamp

    // **VALIDATION ON SET:** Ensure timestamp is valid before adding
    if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) {
        console.error(`CRITICAL: Failed to generate valid timestamp for caching ${url}. Aborting cache set.`);
        return; // Do not cache if timestamp generation failed
    }

    this._store[url] = {
        data: responseData, // The actual JSON payload
        status: status,
        statusText: statusText,
        timestamp: timestamp // Store the validated timestamp
    };
    this.debouncedSave();
  },

  // Save cache to localStorage (debounced) - unchanged from previous correct version
  debouncedSave() {
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveToLocalStorage(), 2500);
  },

  // Save cache to localStorage with compression
  saveToLocalStorage() {
    try {
      this.cleanupExpired(); // Clean expired items before saving
      const dataToSave = JSON.stringify(this._store);
      
      if (this._compression.enabled) {
        try {
          // Use the safeCompress utility function
          const base64CompressedData = safeCompress(dataToSave);
          
          if (base64CompressedData) {
            // Save with compression prefix
            const prefixedData = this._compression.prefix + base64CompressedData;
            localStorage.setItem('github_api_cache', prefixedData);
            
            const compressionRatio = (prefixedData.length / dataToSave.length * 100).toFixed(1);
            console.log(`API Cache saved with compression. Original: ${formatBytes(dataToSave.length)}, Compressed: ${formatBytes(prefixedData.length)} (${compressionRatio}%)`);
          } else {
            throw new Error('Compression failed');
          }
        } catch (compressErr) {
          console.warn('Compression failed, saving uncompressed:', compressErr);
          localStorage.setItem('github_api_cache', dataToSave);
          console.log(`API Cache saved without compression. Size: ${formatBytes(dataToSave.length)}`);
        }
      } else {
        // Save without compression (legacy mode)
        localStorage.setItem('github_api_cache', dataToSave);
        console.log(`API Cache saved without compression. Size: ${formatBytes(dataToSave.length)}`);
      }
      
      updateCacheStats(); // Update UI stats after saving
    } catch (err) {
      console.error('Failed to save API cache to localStorage:', err);
      // Check specifically for QuotaExceededError
      if (err.name === 'QuotaExceededError' || err.message.toLowerCase().includes('quota')) {
        console.warn('LocalStorage quota exceeded. Clearing 75% of oldest cache entries.'); 
        this.clearOldEntries(0.75); // Clear 75% of oldest entries
        
        console.log("Scheduling another save attempt after clearing cache.");
        this.debouncedSave();
        
        // Optionally, inform the user
        showToast("Storage space low, cleared older cached data.", "warning", 5000);
      } else {
        // Handle other potential storage errors (though less common)
        showToast("Failed to save cache to storage. Settings might not persist.", "error");
      }
    }
  },

  // cleanupExpired - unchanged
  cleanupExpired() {
    const now = Date.now();
    let changed = false;
    for (const url in this._store) {
      const item = this._store[url];
      // Check timestamp validity AND expiration
      if (!item || typeof item.timestamp !== 'number' || isNaN(item.timestamp) || item.timestamp <= 0 || now - item.timestamp > this.expirationTimes.getForUrl(url)) {
        delete this._store[url];
        changed = true;
      }
    }
    // if (changed) console.log("Cleaned up expired/invalid API cache entries.");
  },

  // clearOldEntries - unchanged
  clearOldEntries(percentage = 0.75) { // Default to 75%
    const entries = Object.entries(this._store);
    if (entries.length === 0) return;

    // Sort by timestamp (oldest first). Handle potentially missing timestamps defensively.
    entries.sort(([, a], [, b]) => (a?.timestamp || 0) - (b?.timestamp || 0));

    const removeCount = Math.max(1, Math.ceil(entries.length * percentage)); // Remove at least 1
    let actuallyRemoved = 0;
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      const [url] = entries[i];
      if (this._store[url]) {
          delete this._store[url];
          actuallyRemoved++;
      }
    }
    console.log(`Cleared ${actuallyRemoved} oldest cache entries due to quota.`);
  },

  // getStats - updated to include compression info
  getStats() {
    const entries = Object.keys(this._store).length;
    let rawSize = 0;
    let compressedSize = 0;
    
    try { 
      const rawData = JSON.stringify(this._store);
      rawSize = rawData.length;
      
      // Calculate potential compressed size
      if (this._compression.enabled && rawSize > 0) {
        const compressedData = safeCompress(rawData);
        if (compressedData) {
          compressedSize = this._compression.prefix.length + compressedData.length;
        } else {
          compressedSize = rawSize; // Fallback if compression fails
        }
      } else {
        compressedSize = rawSize; // Set same size if compression is disabled
      }
      
      // Debug output
      console.debug(`Cache stats: ${entries} entries, raw: ${formatBytes(rawSize)}, compressed: ${formatBytes(compressedSize)}`);
    } catch (err) { 
      console.error("Error calculating cache stats:", err);
      // If there's an error, set some default values
      compressedSize = rawSize;
    }
    
    const compressionRatio = rawSize && compressedSize ? ((compressedSize / rawSize) * 100).toFixed(1) : '100';
    
    return { 
      entries: entries, 
      size: formatBytes(rawSize), 
      rawSize: rawSize,
      compressedSize: compressedSize,
      compressedSizeFormatted: formatBytes(compressedSize),
      compressionRatio: `${compressionRatio}%`,
      isCompressed: this._compression.enabled
    };
  },
  
  // Toggle compression setting
  toggleCompression(enabled) {
    if (typeof enabled === 'boolean') {
      this._compression.enabled = enabled;
      this.debouncedSave(); // Re-save with new setting
      return this._compression.enabled;
    }
    return this._compression.enabled;
  }
};

// Update cache stats by calling the implementation in ui-controller.js
function updateCacheStats() {
  // If the function exists in ui-controller.js, call it
  if (typeof updateCacheStatsUI === 'function') {
    updateCacheStatsUI();
  } else {
    console.warn("updateCacheStatsUI function not found. UI may not be updated properly.");
  }
}

// ============ PERSISTENCE & HELPER FUNCTIONS ============

/** Formats bytes into KB, MB, etc. */
function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}


/** Save last seen comments and visit times to localStorage */
function saveLastSeenComments() {
  try {
    localStorage.setItem('lastSeenComments', JSON.stringify(lastSeenCommentsMap));
    localStorage.setItem('lastVisitTimes', JSON.stringify(lastVisitTimeMap));
  } catch (e) {
      console.error("Failed to save activity tracking data:", e);
  }
}

/** Toggle favorite project status and save */
function toggleFavoriteProject(fullName) {
  const index = favoriteProjects.indexOf(fullName);
  if (index > -1) {
    favoriteProjects.splice(index, 1); // Remove if exists
  } else {
    favoriteProjects.push(fullName); // Add if not exists
  }
  localStorage.setItem('favoriteProjects', JSON.stringify(favoriteProjects));
  return index === -1; // Return true if it was added (is now favorite)
}

/** Update a user preference object and save to localStorage */
function updatePreference(key, value) {
  if (preferences.hasOwnProperty(key)) {
    preferences[key] = value;
  } else {
      console.warn(`Attempted to update non-standard preference: ${key}`);
  }
  savePreference(key, value); // Save to localStorage regardless
}

/** Load a preference from localStorage */
function loadPreference(key, defaultValue) {
  const saved = localStorage.getItem(key);
  if (saved === null) return defaultValue;
  // Handle boolean strings
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  // Handle numbers
  const num = Number(saved);
  return isNaN(num) ? saved : num; // Return number or original string
}

/** Save a preference to localStorage */
function savePreference(key, value) {
   try {
       localStorage.setItem(key, String(value)); // Store as string
   } catch (e) {
       console.error(`Failed to save preference "${key}":`, e);
       showToast(`Could not save setting: ${key}`, "error");
   }
}

/**
 * Clear specific data caches based on type.
 * @param {Array<string>} cacheTypes - e.g., ['pageData', 'searchData', 'branch']
 */
function clearCaches(cacheTypes) {
  const clearAll = cacheTypes.includes('all');

  if (clearAll || cacheTypes.includes('pageData')) {
    for (const section in pageDataCache) { pageDataCache[section] = {}; }
    console.log("Cleared Page Data Cache.");
  }

  if (clearAll || cacheTypes.includes('searchData')) {
    for (const key in cachedData) { cachedData[key] = []; }
    console.log("Cleared Search Data Cache.");
  }

   if (clearAll || cacheTypes.includes('branch')) {
       // Branch cache is implicit within requestCache now, handled by clearing requestCache
       console.log("Branch data uses API Cache. Clear API Cache to remove.");
   }

   // Optionally clear API request cache
   if (clearAll || cacheTypes.includes('api')) {
       requestCache.clear();
   }

  // Reset tab loaded flags if requested
  if (clearAll || cacheTypes.includes('tabData')) {
    Object.keys(tabDataLoaded).forEach(key => { tabDataLoaded[key] = false; });
    tabDataLoaded['my-activity'] = false; // Reset this too
    console.log("Reset Tab Loaded Flags.");
  }
}


// --- Branch Name Cache (Simple in-memory cache with timestamp) ---
// Note: This is now less critical as API caching handles it, but kept for potential direct use.
const branchNameCache = {};
function getBranchNameFromCache(owner, repo, prNumber, branchInfo = null) {
  const cacheKey = `${owner}/${repo}/${prNumber}`;
  const now = Date.now();
  const expiration = 30 * 60 * 1000; // 30 minutes

  if (branchInfo !== null) {
    // Update cache
    branchNameCache[cacheKey] = { data: branchInfo, timestamp: now };
    return branchInfo;
  }

  // Check cache
  const cached = branchNameCache[cacheKey];
  if (cached && (now - cached.timestamp < expiration)) {
    return cached.data;
  }

  return null; // Not in cache or expired
}