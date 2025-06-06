/*************************************************************
 * MAIN APPLICATION
 * Entry point that initializes UI, controllers, and loads initial data.
 *************************************************************/

/**
 * Initialize the application components and load initial data.
 */
async function initializeApp() {
  console.log("🚀 Initializing PullRequestsView...");

  // --- Setup Phase ---
  showLoadingIndicator(true); // Show header loading early
  setupSearchUI(); // Setup clear buttons etc. for search inputs
  initializeUIElements(); // Get DOM refs, setup basic UI listeners (tabs, modal, dark mode, settings)
  initializeGlobalSearch(); // Setup global search overlay and listeners
  initializePRControllers(); // Setup specific listeners for PR sections
  initializeProjectController(); // Setup specific listeners for Projects section
  initializeDropdowns(); // Set initial dropdown values from preferences
  // Settings are initialized within initializeUIElements -> setupSettingsPanel
  setupTableSorting(); // Enable table sorting

  // --- Initial Data Loading ---
  try {
      // Load the default tab's UI state first
      loadDefaultTab();

      // Always load "My Activity" data first as it's often the default/most used
      console.log("⏳ Loading My Activity data...");
      await Promise.all([
          loadMyOpenPrs(),
          loadMyClosedPrs(),
          loadMyReviewsOpen(),
          loadMyReviewsClosed()
      ]);
      tabDataLoaded['my-activity'] = true; // Mark My Activity as loaded
      console.log("✅ My Activity data loaded.");
      
      // Update user activity indicator after My Activity data loads
      if (typeof updateUserActivityIndicator === 'function') {
        updateUserActivityIndicator();
      }


      // Preload other tabs IF enabled in settings AND the tab isn't already active/loaded
      if (preferences.preloadData) {
          console.log("⏳ Preloading other tabs in background...");
          const preloadPromises = [];
          const activeTabId = document.querySelector('.tab.active')?.dataset.tab;

          if (activeTabId !== 'open-pr' && !tabDataLoaded['open-pr']) {
               preloadPromises.push(loadDataForTab('open-pr').catch(e => console.warn("Preload failed for Open PR:", e)));
          }
          if (activeTabId !== 'closed-pr' && !tabDataLoaded['closed-pr']) {
               preloadPromises.push(loadDataForTab('closed-pr').catch(e => console.warn("Preload failed for Closed PR:", e)));
          }
          if (activeTabId !== 'projects' && !tabDataLoaded['projects']) {
              preloadPromises.push(loadDataForTab('projects').catch(e => console.warn("Preload failed for Projects:", e)));
          }
          await Promise.all(preloadPromises);
          console.log("✅ Preloading complete.");
      } else {
          // If not preloading, ensure counts for non-active tabs are updated (minimal fetch)
           console.log("📊 Updating tab counts (no preload)...");
           updateMainTabCounts();
      }

      // Initialize API cache stats in settings panel
      updateCacheStats();

      // Update user activity indicator
      if (typeof updateUserActivityIndicator === 'function') {
        updateUserActivityIndicator();
      }

      console.log("🎉 Application Initialized Successfully!");

  } catch (error) {
      console.error("❌ Error during application initialization:", error);
      showToast("Application failed to initialize correctly. Some data may be missing.", "error");
  } finally {
      showLoadingIndicator(false); // Hide header loading indicator
  }
}

/**
* Refreshes currently visible PR views when settings change (e.g., show/hide branch names).
* Avoids full page reload but refetches data for relevant views.
*/
function refreshAllViews() {
  console.log("🔄 Refreshing views due to settings change...");
  showLoadingIndicator(true);

  // Clear specific caches that depend on the changed settings
  // - Branch Name Cache (Implicitly cleared by clearing API cache or just refetching)
  // - Page Data Cache for PR-related sections needs to be cleared to force re-render
  clearCaches(['pageData', 'tabData']); // Clear page cache and reset loaded flags

  // Determine which tab/subtab is active to reload its data
  const activeTab = document.querySelector('.tab.active');
  const activeTabId = activeTab?.dataset.tab;

  let reloadPromise;

  if (activeTabId === 'my-activity') {
      // Reload all components of My Activity
      reloadPromise = Promise.all([
          loadMyOpenPrs(false, true), // Force refresh
          loadMyClosedPrs(false, true),
          loadMyReviewsOpen(false, true),
          loadMyReviewsClosed(false, true)
      ]).then(() => { tabDataLoaded['my-activity'] = true; });
  } else if (activeTabId) {
      // Reload the specific active tab
      reloadPromise = loadDataForTab(activeTabId); // This will force refresh due to cleared cache/flags
  } else {
      // Fallback: Reload My Activity if no tab seems active
      reloadPromise = loadDataForTab('my-activity');
  }

  // Update counts for other tabs in the background
  updateMainTabCounts();

  reloadPromise
    .then(() => console.log("✅ Views refreshed."))
    .catch(err => console.error("Error refreshing views:", err))
    .finally(() => showLoadingIndicator(false));
}

// --- Global Event Listener ---
// Handles clicks on dynamically generated elements like activity badges

// function handleGlobalClick(event) {
//     const activityBadge = event.target.closest('.new-badge[data-pr-details]');
//     if (activityBadge) {
//         // Parse details and call handler
//         try {
//             const prDetails = JSON.parse(activityBadge.getAttribute('data-pr-details').replace(/&apos;/g, "'"));
//             handleActivityBadgeClick(activityBadge, prDetails.number, prDetails.updated_at);
//         } catch (e) {
//             console.error("Failed to parse PR details from badge:", e);
//         }
//     }
// }
// document.addEventListener('click', handleGlobalClick);
// Note: Using inline onclick for simplicity for now, but event delegation is generally preferred.


// --- Start the App ---
// Initialize the application when the DOM is fully loaded and ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp(); // DOM already loaded
}