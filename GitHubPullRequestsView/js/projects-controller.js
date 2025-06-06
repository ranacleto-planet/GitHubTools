/*************************************************************
 * PROJECTS CONTROLLER
 * Handles repository/project related functionality
 *************************************************************/

/**
 * Initialize project controller with event listeners
 */
function initializeProjectController() {
  document.getElementById('projects-filter').addEventListener('input', debounce(applyProjectsFilter, 300));
  document.getElementById('projects-prev').addEventListener('click', async () => {
    if (pageState.currentPageProjects > 1) { 
      pageState.currentPageProjects--; 
      await loadProjects(); 
    }
  });
  document.getElementById('projects-next').addEventListener('click', async () => {
    pageState.currentPageProjects++; 
    await loadProjects();
  });
  document.getElementById('projects-items-per-page').addEventListener('change', async function() {
    preferences.projectsPerPage = parseInt(this.value, 10);
    updatePreference('projectsPerPage', preferences.projectsPerPage);
    pageState.currentPageProjects = 1;
    // Clear project cache when changing items per page
    cachedData.projects = [];
    pageDataCache['projects'] = {};
    tabDataLoaded['projects'] = false;
    await loadProjects();
    tabDataLoaded['projects'] = true;
  });
  document.getElementById('projects-refresh').addEventListener('click', async () => {
    // Clear cache on manual refresh
    cachedData.projects = [];
    pageDataCache['projects'] = {};
    pageState.currentPageProjects = 1;
    tabDataLoaded['projects'] = false;
    const filterVal = document.getElementById('projects-filter').value.trim();
    await loadProjects(filterVal !== '');
    tabDataLoaded['projects'] = true;
  });
}

/**
 * Apply filtering to projects
 */
function applyProjectsFilter() {
  const filterVal = document.getElementById('projects-filter').value.toLowerCase().trim();
  
  if (filterVal === '') {
    // If filter is cleared, revert to normal pagination view
    pageState.currentPageProjects = 1;
    loadProjects(false);
    return;
  }
  
  // Clear the page cache when filtering
  pageDataCache['projects'] = {};
  
  // Trigger a search when user types in filter
  loadProjects(true);
}

/**
 * Load projects/repositories
 * @param {boolean} isSearching - Whether we're searching or paginating
 * @returns {Promise<number>} - Number of items loaded
 */
async function loadProjects(isSearching = false) {
  const spinner = document.getElementById('projects-spinner');
  const pagination = document.getElementById('projects-pagination');
  spinner.style.display = 'flex';
  
  try {
    let repos = [];
    const filterVal = document.getElementById('projects-filter').value.toLowerCase().trim();
    
    if (isSearching) {
      // For searching, use all cached repos or fetch all
      repos = cachedData.projects.length > 0 ? 
              cachedData.projects : 
              await fetchAllTeamRepositories();
      
      // Apply filter
      if (filterVal) {
        repos = repos.filter(repo => 
          repo.name.toLowerCase().includes(filterVal) || 
          (repo.description && repo.description.toLowerCase().includes(filterVal))
        );
      }
      
      // Hide pagination when filtering
      pagination.style.display = 'none';
      
      // Update UI to show search is active
      updateSearchUI('projects', true, repos.length, filterVal);
    } else {
      // Check if we have cached data for this page
      const cacheKey = `page_${pageState.currentPageProjects}_${preferences.projectsPerPage}`;
      if (pageDataCache['projects'][cacheKey]) {
        // Use cached data
        repos = pageDataCache['projects'][cacheKey];
        console.log("Using cached Projects data for page", pageState.currentPageProjects);
      } else {
        // Normal page loading
        console.log("Fetching Projects data for page", pageState.currentPageProjects);
        repos = await fetchTeamRepositories(pageState.currentPageProjects, preferences.projectsPerPage);
        
        // Cache the data
        pageDataCache['projects'][cacheKey] = repos;
      }
      
      // Always show pagination and update button state for normal view
      pagination.style.display = 'flex';
      document.getElementById('projects-prev').disabled = (pageState.currentPageProjects <= 1);
      document.getElementById('projects-next').disabled = (repos.length < preferences.projectsPerPage);
      
      // Update UI to show search is not active
      updateSearchUI('projects', false, 0, '');
    }
    
    renderRepositories(repos, isSearching, filterVal);
    
    return repos.length;
  } finally {
    spinner.style.display = 'none';
  }
}

/**
 * Render repositories to the projects table
 * @param {Array} repos - Array of repository objects
 * @param {boolean} isSearching - Whether we're searching
 * @param {string} filterVal - Filter value if searching
 */
function renderRepositories(repos, isSearching = false, filterVal = '') {
  const projectsBody = document.getElementById('projects-body');
  projectsBody.innerHTML = '';
  
  if (!repos.length) {
    projectsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No projects found</td></tr>';
    return;
  }
  
  repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  
  // Separate favorites from others
  const favs = [];
  const others = [];
  repos.forEach(r => {
    if (favoriteProjects.includes(r.full_name)) favs.push(r);
    else others.push(r);
  });
  
  const finalList = [...favs, ...others];
  finalList.forEach(repo => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    const isFav = favoriteProjects.includes(repo.full_name);
    const starClass = isFav ? 'fas fa-star star-icon' : 'far fa-star star-icon inactive';
    const isoDate = repo.updated_at;
    const displayDate = formatDate(isoDate);
    
    // Highlight matches if we're searching
    const nameDisplay = isSearching && filterVal && repo.name.toLowerCase().includes(filterVal) ? 
                       highlightMatches(repo.name, filterVal) : 
                       repo.name;
    
    const descriptionDisplay = isSearching && filterVal && repo.description && repo.description.toLowerCase().includes(filterVal) ? 
                              highlightMatches(repo.description || 'N/A', filterVal) : 
                              repo.description || 'N/A';
    
    row.innerHTML = `
      <td>
        <span class="project-name-star">
          ${nameDisplay}
          <i class="${starClass}" data-fullname="${repo.full_name}" title="Toggle Favorite"></i>
        </span>
      </td>
      <td>${descriptionDisplay}</td>
      <td><a href="${repo.html_url}" target="_blank">Link</a></td>
      <td>${repo.stargazers_count}</td>
      <td>${repo.forks_count}</td>
      <td class="date-column" data-iso="${isoDate}">${displayDate}</td>
    `;
    
    row.addEventListener('click', e => {
      if (e.target.classList.contains('star-icon')) {
        e.stopPropagation();
        handleFavoriteToggle(repo.full_name, e.target);
      } else {
        loadProjectDetails(repo.owner.login, repo.name);
      }
    });
    
    projectsBody.appendChild(row);
  });
}

/**
 * Handle toggling of repository favorites
 * @param {string} fullName - Full name of the repository
 * @param {HTMLElement} iconEl - Star icon element
 */
function handleFavoriteToggle(fullName, iconEl) {
  const isFavorite = toggleFavoriteProject(fullName);
  
  // Update the icon immediately without a full reload
  if (isFavorite) {
    iconEl.className = 'fas fa-star star-icon';
  } else {
    iconEl.className = 'far fa-star star-icon inactive';
  }
  
  // Only reload if we're not in search mode
  const filterVal = document.getElementById('projects-filter').value.trim();
  if (filterVal === '') {
    // We could do a full reload, but that's expensive
    // Instead, we'll just re-sort the existing rows
    const projectsBody = document.getElementById('projects-body');
    const rows = Array.from(projectsBody.querySelectorAll('tr'));
    
    // Separate favorites from others
    const favRows = [];
    const otherRows = [];
    
    rows.forEach(row => {
      const starIcon = row.querySelector('.star-icon');
      if (starIcon && starIcon.classList.contains('fas')) {
        favRows.push(row);
      } else {
        otherRows.push(row);
      }
    });
    
    // Remove all rows
    rows.forEach(row => row.remove());
    
    // Add back in proper order
    favRows.forEach(row => projectsBody.appendChild(row));
    otherRows.forEach(row => projectsBody.appendChild(row));
  }
}