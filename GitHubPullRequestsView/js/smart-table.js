/*************************************************************
 * SMART TABLE CONTROLLER
 * Handles intelligent grouping and rendering of table data
 * to reduce repetition and improve UX
 *************************************************************/

// Utility functions that may not be available in utils.js
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncateBranchName(branchName, maxLength = 25) {
    if (!branchName || branchName.length <= maxLength) return branchName;
    return branchName.substring(0, maxLength - 3) + '...';
}

/**
 * Groups PR items by common properties to reduce repetition
 * @param {Array} items - Array of enriched PR objects
 * @param {string} sectionId - Section identifier
 * @returns {Array} - Array of grouped items with metadata
 */
function groupPRItems(items, sectionId) {
    if (!items || items.length === 0) return [];
    
    // Determine grouping strategy based on section
    const isMyPrSection = sectionId.startsWith('my-') && !sectionId.includes('review');
    
    // Group by ticket number first (most common repetition)
    const ticketGroups = new Map();
    
    items.forEach(pr => {
        const ticketNumber = pr.ticketNumber || 'N/A';
        if (!ticketGroups.has(ticketNumber)) {
            ticketGroups.set(ticketNumber, []);
        }
        ticketGroups.get(ticketNumber).push(pr);
    });
    
    const groupedResults = [];
    
    // Process each ticket group
    ticketGroups.forEach((prs, ticketNumber) => {
        if (prs.length === 1) {
            // Single PR for this ticket - no grouping needed
            groupedResults.push({
                type: 'single',
                data: prs[0],
                isMyPrSection
            });
        } else {
            // Multiple PRs for the same ticket - group them
            // Further group by project within the ticket
            const projectGroups = new Map();
            
            prs.forEach(pr => {
                const projectKey = `${pr.repoOwner}/${pr.repoName}`;
                if (!projectGroups.has(projectKey)) {
                    projectGroups.set(projectKey, []);
                }
                projectGroups.get(projectKey).push(pr);
            });
            
            // Always create a single group for the same ticket, regardless of project count
            // Sort all PRs by latest date first
            const allPrsForTicket = prs.sort((a, b) => new Date(b.actualLatestDate) - new Date(a.actualLatestDate));
            
            // Determine the primary project (the one with the most recent PR or most PRs)
            const projectPrCounts = new Map();
            let primaryProject = null;
            let primaryProjectPrs = [];
            
            projectGroups.forEach((projectPrs, projectKey) => {
                projectPrCounts.set(projectKey, projectPrs.length);
                if (!primaryProject || projectPrs.length > primaryProjectPrs.length ||
                    (projectPrs.length === primaryProjectPrs.length &&
                     new Date(projectPrs[0].actualLatestDate) > new Date(primaryProjectPrs[0].actualLatestDate))) {
                    primaryProject = projectKey;
                    primaryProjectPrs = projectPrs;
                }
            });
            
            groupedResults.push({
                type: 'ticket-group',
                ticketNumber,
                projectKey: primaryProject,
                repoName: primaryProjectPrs[0].repoName,
                repoOwner: primaryProjectPrs[0].repoOwner,
                items: allPrsForTicket,
                projectCount: projectGroups.size,
                isMyPrSection
            });
        }
    });
    
    // Sort groups by most recent activity
    groupedResults.sort((a, b) => {
        const getLatestDate = (group) => {
            if (group.type === 'single') {
                return new Date(group.data.actualLatestDate);
            } else {
                return new Date(group.items[0].actualLatestDate);
            }
        };
        return getLatestDate(b) - getLatestDate(a);
    });
    
    return groupedResults;
}

/**
 * Renders grouped PR items into HTML
 * @param {Array} groupedItems - Array of grouped items from groupPRItems
 * @param {boolean} isFiltering - Whether filtering is active
 * @param {string} filterVal - Filter value for highlighting
 * @returns {string} - HTML string for table body
 */
function renderGroupedItems(groupedItems, isFiltering, filterVal) {
    if (!groupedItems || groupedItems.length === 0) return '';
    
    let html = '';
    
    groupedItems.forEach(group => {
        if (group.type === 'single') {
            // Render single PR normally
            html += renderSinglePRRow(group.data, group.isMyPrSection, filterVal);
        } else {
            // Render grouped PRs
            html += renderGroupedPRRows(group, filterVal);
        }
    });
    
    return html;
}

/**
 * Renders a single PR row (same as original)
 * @param {Object} pr - PR object
 * @param {boolean} isMyPrSection - Whether this is a "My PRs" section
 * @param {string} filterVal - Filter value for highlighting
 * @returns {string} - HTML string for single row
 */
function renderSinglePRRow(pr, isMyPrSection, filterVal) {
    return generatePRRowHTML(pr, isMyPrSection, filterVal, false);
}

/**
 * Renders grouped PR rows with smart grouping
 * @param {Object} group - Group object from groupPRItems
 * @param {string} filterVal - Filter value for highlighting
 * @returns {string} - HTML string for grouped rows
 */
function renderGroupedPRRows(group, filterVal) {
    let html = '';
    const { ticketNumber, repoName, repoOwner, items, projectCount, isMyPrSection } = group;
    
    // Generate unique group ID
    const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create group header row (collapsed by default)
    html += `<tr class="smart-table-group-header collapsed" data-group-id="${groupId}">`;
    
    // Ticket cell (clean ticket number only)
    const ticketLink = ticketNumber !== 'N/A' ? `https://jira.weareplanet.com/browse/${ticketNumber}` : '#';
    const ticketDisplay = highlightMatches(ticketNumber, filterVal);
    html += `<td class="smart-table-group-cell ticket-group">
        ${ticketNumber !== 'N/A' ? `<a href="${ticketLink}" target="_blank">${ticketDisplay}</a>` : ticketDisplay}
        <button class="smart-table-toggle-btn" onclick="toggleSmartTableGroup(this)" title="Expand/Collapse group">
            <i class="fas fa-chevron-down"></i>
        </button>
    </td>`;
    
    // PR Name cell - always show badge, and PR names when expanded (unless PRs = projects)
    // Get unique PR names (filter duplicates)
    const uniquePrNames = [...new Set(items.map(pr => formatPRTitle(pr.title)))];
    const prNamesHtml = uniquePrNames.map(name => highlightMatches(name, filterVal)).join(', ');
    
    const badgeContent = `<span class="smart-table-group-badge">${items.length} PRs</span>`;
    
    // PR names should be hidden initially (groups start expanded) and shown when collapsed
    // Always create the span so it can be toggled, even if PRs equal projects (show by default since collapsed)
    const prNamesSpan = `<span class="smart-table-pr-names" style="display: inline-block;">${prNamesHtml}</span>`;
    
    // Only show project badge if there are multiple projects AND it's not equal to PR count
    const projectBadge = (projectCount > 1 && items.length !== projectCount) ?
        ` <span class="smart-table-multi-project-badge">${projectCount} projects</span>` : '';
    
    html += `<td class="smart-table-group-cell pr-name-group">
        ${badgeContent}${projectBadge}${prNamesSpan}
    </td>`;
    
    // Owner cell - show all unique owners
    if (!isMyPrSection) {
        const uniqueOwners = [...new Set(items.map(pr => pr.ownerName || pr.ownerRaw || pr.user?.login || 'N/A'))];
        const ownerDisplay = uniqueOwners.length === 1 ?
            highlightMatches(uniqueOwners[0], filterVal) :
            highlightMatches(uniqueOwners.join(', '), filterVal);
        html += `<td class="smart-table-group-cell owner-group">${ownerDisplay}</td>`;
    }
    
    // Project cell - show primary project or "Multiple projects" if spanning multiple
    let projectCellContent;
    if (projectCount > 1) {
        // Show that this spans multiple projects
        const uniqueProjects = [...new Set(items.map(pr => pr.repoName))];
        const repoNameDisplay = highlightMatches(repoName, filterVal);
        projectCellContent = `<span class="smart-table-multi-project">${repoNameDisplay} + ${projectCount - 1} more</span>`;
    } else {
        // Single project
        const repoLink = `https://github.com/${repoOwner}/${repoName}`;
        const repoNameDisplay = highlightMatches(repoName, filterVal);
        projectCellContent = `<a href="${repoLink}" target="_blank">${repoNameDisplay}</a>`;
    }
    html += `<td class="smart-table-group-cell project-group">${projectCellContent}</td>`;
    
    // Date cell showing date range
    const latestDate = formatDate(items[0].actualLatestDate);
    const oldestDate = items.length > 1 ? formatDate(items[items.length - 1].actualLatestDate) : latestDate;
    const dateRange = items.length > 1 && latestDate !== oldestDate ?
        `${oldestDate} - ${latestDate}` : latestDate;
    
    html += `<td class="smart-table-group-cell date-group">
        <span class="date-range">${dateRange}</span>
    </td>`;
    
    // Approvals cell showing minimum approval status across all PRs
    // 0 = no approvals in any PR, 1 = some PRs have approvals, 2 = all PRs have 2+ approvals
    const approvalCounts = items.map(pr => pr.approvals || 0);
    const hasNoApprovals = approvalCounts.every(count => count === 0);
    const hasAllFullyApproved = approvalCounts.every(count => count >= 2);
    
    let groupApprovalStatus;
    if (hasNoApprovals) {
        groupApprovalStatus = 0; // No approvals in any PR
    } else if (hasAllFullyApproved) {
        groupApprovalStatus = 2; // All PRs have 2+ approvals
    } else {
        groupApprovalStatus = 1; // Some PRs have approvals, but not all are fully approved
    }
    
    const approvalsHtml = buildApprovalBadge(groupApprovalStatus);
    
    html += `<td class="smart-table-group-cell approval-group">
        ${approvalsHtml}
    </td>`;
    
    html += `</tr>`;
    
    // Render individual PRs in the group (with reduced redundancy, hidden by default)
    items.forEach((pr, index) => {
        html += generatePRRowHTML(pr, isMyPrSection, filterVal, true, index === 0, groupId, true);
    });
    
    return html;
}

/**
 * Generates HTML for a single PR row with smart table considerations
 * @param {Object} pr - PR object
 * @param {boolean} isMyPrSection - Whether this is a "My PRs" section
 * @param {string} filterVal - Filter value for highlighting
 * @param {boolean} isGrouped - Whether this row is part of a group
 * @param {boolean} isFirstInGroup - Whether this is the first row in a group
 * @returns {string} - HTML string for the row
 */
function generatePRRowHTML(pr, isMyPrSection, filterVal, isGrouped = false, isFirstInGroup = false, groupId = null, hiddenByDefault = false) {
    // Get all the necessary data (same as original renderSectionItems)
    const ticketNumber = pr.ticketNumber || 'N/A';
    const repoName = pr.repoName || 'N/A';
    const repoOwner = pr.repoOwner || 'N/A';
    const ownerRaw = pr.ownerRaw || pr.user?.login || 'N/A';
    const ownerName = pr.ownerName || 'N/A';
    const approvals = pr.approvals ?? 0;
    const actualLatestDate = pr.actualLatestDate || pr.updated_at;
    const displayDate = formatDate(actualLatestDate);
    const approvalsHtml = buildApprovalBadge(approvals);
    const prUrl = pr.html_url || '#';
    
    // New Activity Badge Logic (same as original)
    let isNewActivity = false;
    const storedLastSeen = lastSeenCommentsMap[pr.number];
    const storedVisitTime = lastVisitTimeMap[pr.number];
    const now = new Date();

    if (!storedLastSeen) {
        isNewActivity = true;
    } else if (actualLatestDate && new Date(actualLatestDate) > new Date(storedLastSeen)) {
        isNewActivity = true;
    }
    
    if (isNewActivity && storedVisitTime && (now - new Date(storedVisitTime)) > 10 * 60 * 1000) {
        isNewActivity = false;
        lastSeenCommentsMap[pr.number] = actualLatestDate;
        delete lastVisitTimeMap[pr.number];
    }
    if (isNewActivity && !storedVisitTime) {
        lastVisitTimeMap[pr.number] = now.toISOString();
    }
    
    // Branch Info (same as original)
    let branchHtml = '';
    const shouldShowBranches = preferences.showBranchNames || preferences.showBranchNamesIfNotMain;
    
    if (shouldShowBranches && pr.branchInfo) {
        const source = pr.branchInfo.source || '';
        const target = pr.branchInfo.target || '';
        
        const mainBranches = ['main', 'master', 'develop', 'development', 'dev'];
        const isTargetMainBranch = target && mainBranches.includes(target.toLowerCase());
        
        let showBranches = false;
        if (preferences.showBranchNames) {
            showBranches = true;
        } else if (preferences.showBranchNamesIfNotMain && !isTargetMainBranch) {
            showBranches = true;
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
    
    // Highlighting
    const formattedTitle = formatPRTitle(pr.title);
    const titleDisplay = highlightMatches(formattedTitle, filterVal);
    const repoNameDisplay = highlightMatches(repoName, filterVal);
    const ownerNameDisplay = highlightMatches(ownerName, filterVal);
    const ticketNumberDisplay = highlightMatches(ticketNumber, filterVal);
    
    // Activity Modal Details Attribute
    const prDetailsForBadge = {
        number: pr.number,
        title: pr.title,
        html_url: prUrl,
        repoName: repoName,
        repoOwner: repoOwner,
        updated_at: actualLatestDate
    };
    const prDetailsAttr = `data-pr-details='${JSON.stringify(prDetailsForBadge).replace(/'/g, "'")}'`;
    const newBadge = isNewActivity ?
        `<span class="new-badge" ${prDetailsAttr} onclick="handleActivityBadgeClick(this, ${pr.number}, '${actualLatestDate}')">
            <i class="fas fa-bell"></i> NEW
         </span>` : '';
    
    // Merge Conflict Indicator
    const mergeConflictIndicator = pr.hasMergeConflicts ?
        `<span class="merge-conflict-badge" title="This PR has merge conflicts that need to be resolved">
            <i class="fas fa-code-branch"></i> CONFLICTS
         </span>` : '';
    
    // Links
    const repoLink = `https://github.com/${repoOwner}/${repoName}`;
    const ownerLink = `https://github.com/${ownerRaw}`;
    const ticketLink = `https://jira.weareplanet.com/browse/${ticketNumber}`;
    
    // Generate row with smart table classes
    const rowClasses = ['pr-row'];
    if (isNewActivity) rowClasses.push('tr-new-activity');
    if (isGrouped) rowClasses.push('smart-table-grouped-row');
    if (isFirstInGroup) rowClasses.push('smart-table-first-in-group');
    
    let rowHtml = `<tr class="${rowClasses.join(' ')}" data-pr-number="${pr.number}"${groupId ? ` data-group-id="${groupId}"` : ''}${hiddenByDefault ? ' style="display: none;"' : ''}>`;
    
    if (isGrouped) {
        // In grouped mode, show reduced information
        // Only show PR title, owner (if not My PRs), date, and approvals
        // Ticket and project are shown in the group header
        
        // Empty ticket cell with grouping indicator
        rowHtml += `<td class="smart-table-grouped-cell smart-table-empty-cell">
            <span class="smart-table-group-indicator">└</span>
        </td>`;
        
        // PR Title with full information
        rowHtml += `<td class="smart-table-grouped-cell">${newBadge}${mergeConflictIndicator}<a href="${prUrl}" target="_blank">${titleDisplay}</a>${branchHtml}</td>`;
        
        // Owner (if not My PRs section)
        if (!isMyPrSection) {
            rowHtml += `<td class="smart-table-grouped-cell"><a href="javascript:void(0)" class="developer-link"
                          data-username="${escapeHTML(ownerRaw)}"
                          data-displayname="${escapeHTML(ownerName)}"
                          onclick="showDeveloperDetails('${escapeHTML(ownerRaw)}', '${escapeHTML(ownerName)}')">${ownerNameDisplay}</a></td>`;
        }
        
        // Project cell (show actual project info for reference, especially useful when group spans multiple projects)
        const prRepoLink = `https://github.com/${pr.repoOwner}/${pr.repoName}`;
        const prRepoNameDisplay = highlightMatches(pr.repoName, filterVal);
        rowHtml += `<td class="smart-table-grouped-cell smart-table-project-cell">
            <a href="${prRepoLink}" target="_blank" class="smart-table-project-ref">${prRepoNameDisplay}</a>
        </td>`;
        
        // Date
        rowHtml += `<td class="smart-table-grouped-cell date-column">${displayDate}</td>`;
        
        // Approvals
        rowHtml += `<td class="smart-table-grouped-cell approval-column">${approvalsHtml}</td>`;
        
    } else {
        // Normal mode - show all information (same as original)
        // Ticket
        rowHtml += `<td>${ticketNumber !== 'N/A' ? `<a href="${ticketLink}" target="_blank">${ticketNumberDisplay}</a>` : ticketNumberDisplay}</td>`;
        
        // Title + Badge + Branch
        rowHtml += `<td>${newBadge}${mergeConflictIndicator}<a href="${prUrl}" target="_blank">${titleDisplay}</a>${branchHtml}</td>`;
        
        // Owner (Conditional)
        if (!isMyPrSection) {
            rowHtml += `<td><a href="javascript:void(0)" class="developer-link" 
                          data-username="${escapeHTML(ownerRaw)}" 
                          data-displayname="${escapeHTML(ownerName)}" 
                          onclick="showDeveloperDetails('${escapeHTML(ownerRaw)}', '${escapeHTML(ownerName)}')">${ownerNameDisplay}</a></td>`;
        }
        
        // Project
        rowHtml += `<td><a href="${repoLink}" target="_blank">${repoNameDisplay}</a></td>`;
        
        // Date
        rowHtml += `<td class="date-column">${displayDate}</td>`;
        
        // Approvals
        rowHtml += `<td class="approval-column">${approvalsHtml}</td>`;
    }
    
    rowHtml += `</tr>`;
    return rowHtml;
}

/**
 * Enhanced render function that uses smart table when enabled
 * @param {string} sectionId - Section identifier
 * @param {Array} items - Array of enriched PR objects
 * @param {boolean} isFiltering - Whether filtering is active
 * @param {string} filterVal - Filter value for highlighting
 * @returns {string} - HTML string for table body
 */
function renderSmartTableItems(sectionId, items, isFiltering, filterVal) {
    if (!preferences.smartTableMode || !items || items.length === 0) {
        // Fall back to normal rendering
        return null; // Signal to use normal rendering
    }
    
    // Group the items intelligently
    const groupedItems = groupPRItems(items, sectionId);
    
    // Check if grouping actually provides benefit
    const totalGroups = groupedItems.filter(g => g.type !== 'single').length;
    if (totalGroups === 0) {
        // No grouping benefit, use normal rendering
        return null;
    }
    
    // Render grouped items
    return renderGroupedItems(groupedItems, isFiltering, filterVal);
}

/**
 * Toggles the visibility of grouped rows in smart table
 * @param {HTMLElement} toggleBtn - The toggle button that was clicked
 */
function toggleSmartTableGroup(toggleBtn) {
    const groupHeader = toggleBtn.closest('.smart-table-group-header');
    if (!groupHeader) return;
    
    const groupId = groupHeader.dataset.groupId;
    if (!groupId) return;
    
    const isCollapsed = groupHeader.classList.contains('collapsed');
    const prNamesElement = groupHeader.querySelector('.smart-table-pr-names');
    
    // Find all rows belonging to this specific group
    const table = groupHeader.closest('table');
    const groupRows = table.querySelectorAll(`tr[data-group-id="${groupId}"].smart-table-grouped-row`);
    
    if (isCollapsed) {
        // Expand the group
        groupHeader.classList.remove('collapsed');
        
        // Show all rows belonging to this group
        groupRows.forEach(row => {
            row.style.display = '';  // Remove inline style, let CSS handle it
        });
        
        // Hide PR names when expanded (details are in individual rows)
        if (prNamesElement) {
            prNamesElement.style.display = 'none';
        }
        
        // Update button tooltip
        toggleBtn.title = "Collapse group";
    } else {
        // Collapse the group
        groupHeader.classList.add('collapsed');
        
        // Hide all rows belonging to this group
        groupRows.forEach(row => {
            row.style.display = 'none';
        });
        
        // Show PR names when collapsed (to provide summary info)
        if (prNamesElement) {
            prNamesElement.style.display = 'inline-block';
        }
        
        // Update button tooltip
        toggleBtn.title = "Expand group";
    }
    
    // Prevent event bubbling to avoid potential conflicts
    event.preventDefault();
    event.stopPropagation();
}

/**
 * Toggles all smart table groups in the current view to collapsed/expanded state
 * @param {boolean} collapse - True to collapse all groups, false to expand all
 */
function toggleAllSmartTableGroups(collapse) {
    // Find all smart table group headers in the currently active tab
    const activeTabContent = document.querySelector('.tab-content.active');
    if (!activeTabContent) return;
    
    const allGroupHeaders = activeTabContent.querySelectorAll('.smart-table-group-header');
    
    allGroupHeaders.forEach(groupHeader => {
        const groupId = groupHeader.dataset.groupId;
        if (!groupId) return;
        
        const isCurrentlyCollapsed = groupHeader.classList.contains('collapsed');
        const prNamesElement = groupHeader.querySelector('.smart-table-pr-names');
        const table = groupHeader.closest('table');
        const groupRows = table.querySelectorAll(`tr[data-group-id="${groupId}"].smart-table-grouped-row`);
        const toggleBtn = groupHeader.querySelector('.smart-table-toggle-btn');
        
        if (collapse && !isCurrentlyCollapsed) {
            // Collapse this group
            groupHeader.classList.add('collapsed');
            groupRows.forEach(row => {
                row.style.display = 'none';
            });
            if (prNamesElement) {
                prNamesElement.style.display = 'inline-block';
            }
            if (toggleBtn) {
                toggleBtn.title = "Expand group";
            }
        } else if (!collapse && isCurrentlyCollapsed) {
            // Expand this group
            groupHeader.classList.remove('collapsed');
            groupRows.forEach(row => {
                row.style.display = '';
            });
            if (prNamesElement) {
                prNamesElement.style.display = 'none';
            }
            if (toggleBtn) {
                toggleBtn.title = "Collapse group";
            }
        }
    });
    
    // Update the global toggle button state
    updateGlobalToggleButton();
}

/**
 * Updates the global toggle button's appearance based on current group states
 */
function updateGlobalToggleButton() {
    const globalToggleBtn = document.querySelector('.global-smart-table-toggle');
    if (!globalToggleBtn) return;
    
    const activeTabContent = document.querySelector('.tab-content.active');
    if (!activeTabContent) return;
    
    const allGroupHeaders = activeTabContent.querySelectorAll('.smart-table-group-header');
    if (allGroupHeaders.length === 0) {
        // No smart groups visible, hide the button
        globalToggleBtn.style.display = 'none';
        return;
    }
    
    // Show the button since we have smart groups
    globalToggleBtn.style.display = 'flex';
    
    const collapsedGroups = activeTabContent.querySelectorAll('.smart-table-group-header.collapsed');
    const expandedGroups = allGroupHeaders.length - collapsedGroups.length;
    
    const icon = globalToggleBtn.querySelector('i');
    const buttonText = globalToggleBtn.querySelector('.button-text');
    
    if (collapsedGroups.length === allGroupHeaders.length) {
        // All groups are collapsed - show expand all
        icon.className = 'fas fa-expand-alt';
        buttonText.textContent = 'Expand All';
        globalToggleBtn.title = 'Expand all smart groups';
        globalToggleBtn.dataset.action = 'expand';
    } else if (expandedGroups === allGroupHeaders.length) {
        // All groups are expanded - show collapse all
        icon.className = 'fas fa-compress-alt';
        buttonText.textContent = 'Collapse All';
        globalToggleBtn.title = 'Collapse all smart groups';
        globalToggleBtn.dataset.action = 'collapse';
    } else {
        // Mixed state - show collapse all (most useful default)
        icon.className = 'fas fa-compress-alt';
        buttonText.textContent = 'Collapse All';
        globalToggleBtn.title = 'Collapse all smart groups';
        globalToggleBtn.dataset.action = 'collapse';
    }
}

/**
 * Handles the global toggle button click
 */
function handleGlobalToggleClick() {
    const globalToggleBtn = document.querySelector('.global-smart-table-toggle');
    if (!globalToggleBtn) return;
    
    const action = globalToggleBtn.dataset.action;
    const shouldCollapse = action === 'collapse';
    
    // Add visual feedback
    globalToggleBtn.classList.add('active');
    setTimeout(() => {
        globalToggleBtn.classList.remove('active');
    }, 200);
    
    // Perform the toggle action
    toggleAllSmartTableGroups(shouldCollapse);
}

/**
 * Initializes the global smart table toggle functionality
 * Should be called when DOM is ready
 */
function initializeGlobalSmartTableToggle() {
    // Create the global toggle button if it doesn't exist
    let globalToggleBtn = document.querySelector('.global-smart-table-toggle');
    
    if (!globalToggleBtn) {
        // Create the button
        globalToggleBtn = document.createElement('button');
        globalToggleBtn.className = 'global-smart-table-toggle';
        globalToggleBtn.innerHTML = `
            <i class="fas fa-compress-alt"></i>
            <span class="button-text">Collapse All</span>
        `;
        globalToggleBtn.title = 'Collapse all smart groups';
        globalToggleBtn.dataset.action = 'collapse';
        globalToggleBtn.style.display = 'none'; // Hidden by default
        
        // Add click handler
        globalToggleBtn.addEventListener('click', handleGlobalToggleClick);
        
        // Insert the button into all tabs' filter containers
        const allTabs = document.querySelectorAll('.tab-content');
        allTabs.forEach((tab, index) => {
            const filterContainer = tab.querySelector('.filter-container');
            if (filterContainer) {
                // Create a separate button for each tab (except the first one which uses the original)
                const buttonToUse = index === 0 ? globalToggleBtn : globalToggleBtn.cloneNode(true);
                
                // Add event listener to cloned buttons
                if (index > 0) {
                    buttonToUse.addEventListener('click', handleGlobalToggleClick);
                }
                
                // Add the button after the refresh button
                const refreshButton = filterContainer.querySelector('.refresh-button');
                if (refreshButton) {
                    refreshButton.parentNode.insertBefore(buttonToUse, refreshButton.nextSibling);
                } else {
                    filterContainer.appendChild(buttonToUse);
                }
            }
        });
    }
    
    // Set up observer to update button state when content changes
    const targetNode = document.querySelector('.tab-content.active') || document.body;
    
    // Create a mutation observer to watch for smart table changes
    if (window.smartTableObserver) {
        window.smartTableObserver.disconnect();
    }
    
    window.smartTableObserver = new MutationObserver(() => {
        // Debounce the update to avoid excessive calls
        clearTimeout(window.smartTableUpdateTimeout);
        window.smartTableUpdateTimeout = setTimeout(updateGlobalToggleButton, 100);
    });
    
    window.smartTableObserver.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
    
    // Initial update
    updateGlobalToggleButton();
}

// Make functions globally available
window.toggleSmartTableGroup = toggleSmartTableGroup;
window.toggleAllSmartTableGroups = toggleAllSmartTableGroups;
window.handleGlobalToggleClick = handleGlobalToggleClick;
window.initializeGlobalSmartTableToggle = initializeGlobalSmartTableToggle;
window.updateGlobalToggleButton = updateGlobalToggleButton;