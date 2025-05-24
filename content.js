// Track which sprints we've already injected into
let injectedSprints = new Set();
// Store sprint data for summary calculations
let sprintData = new Map();
// Store board information
let boardInfo = {
  boardId: null,
  boardType: null,
  usesEstimations: false
};

/**
 * Main function to add dev type summaries to the Jira UI
 */
function addDevTypeSummaries() {
  console.log("[Sprint Summary] Starting summary process");
  
  // Only run on backlog pages
  if (!window.location.href.includes('backlog')) {
    console.log("[Sprint Summary] Not on backlog page, skipping");
    return;
  }
  
  // Check if this is a SCRUM board that uses estimations
  detectBoardTypeAndEstimations().then(({ isScrum, usesEstimations }) => {
    if (!isScrum) {
      console.log("[Sprint Summary] Not a SCRUM board, skipping");
      return;
    }
    
    if (!usesEstimations) {
      console.log("[Sprint Summary] Board doesn't use estimations, skipping");
      return;
    }
    
    console.log("[Sprint Summary] SCRUM board with estimations detected, proceeding");
    
    // If we already have sprint data, update the UI
    if (sprintData.size > 0) {
      updateUI();
    } else {
      // Otherwise, fetch the data first
      fetchSprintData().then(() => {
        updateUI();
      }).catch(error => {
        console.error("[Sprint Summary] Error fetching sprint data:", error);
        // Fallback to placeholder values if API fetch fails
        updateUI(true);
      });
    }
  });
}

/**
 * Detects the board type and whether it uses estimations
 */
async function detectBoardTypeAndEstimations() {
  // Extract board ID
  const boardId = extractBoardId();
  boardInfo.boardId = boardId;
  
  console.log(`[Sprint Summary] Checking board ${boardId} type via API`);
  
  // Use only the API method to detect board type
  try {
    const response = await fetch(`/rest/agile/1.0/board/${boardId}/configuration`);
    
    if (response.ok) {
      const data = await response.json();
      boardInfo.boardType = data.type ? data.type.toUpperCase() : null;
      console.log(`[Sprint Summary] Board type: ${boardInfo.boardType}`);
      
      // Check if the board has an estimation field configured
      boardInfo.usesEstimations = !!(data.estimation && data.estimation.field);
      
      if (boardInfo.usesEstimations) {
        console.log(`[Sprint Summary] Board uses estimations: ${data.estimation.field.name}`);
      } else {
        console.log('[Sprint Summary] No estimation field configured in board settings');
      }
      
      return {
        isScrum: boardInfo.boardType === 'SCRUM',
        usesEstimations: boardInfo.usesEstimations
      };
    } else {
      console.log(`[Sprint Summary] API request failed with status: ${response.status}`);
      return { isScrum: false, usesEstimations: false };
    }
  } catch (error) {
    console.log("[Sprint Summary] Could not fetch board configuration:", error);
    return { isScrum: false, usesEstimations: false };
  }
}

/**
 * Extracts the board ID from the current URL
 */
function extractBoardId() {
  // First try modern URL format: boards/XX
  let matches = window.location.href.match(/boards\/(\d+)/);
  
  if (matches && matches[1]) {
    return matches[1];
  }
  
  // Try legacy format: rapidView=XX
  matches = window.location.href.match(/rapidView=(\d+)/);
  
  if (matches && matches[1]) {
    return matches[1];
  }
  
  return '24'; // Default fallback value
}

/**
 * Fetches sprint and issue data from the Jira API
 */
async function fetchSprintData() {
  console.log("[Sprint Summary] Fetching sprint data from API");
  
  try {
    // Extract the board ID from the URL
    let boardId = extractBoardId();
    console.log(`[Sprint Summary] Using board ID: ${boardId}`);
    
    // Construct the API endpoint using the board ID
    const apiEndpoint = `https://pitchtech.atlassian.net/rest/greenhopper/1.0/xboard/plan/v2/backlog/data?forceConsistency=true&operation=fetchBacklogData&rapidViewId=${boardId}`;
    console.log(`[Sprint Summary] API endpoint: ${apiEndpoint}`);
    
    const response = await fetch(apiEndpoint);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process the data into our sprintData map
    processSprintData(data);
  } catch (error) {
    console.error("[Sprint Summary] Error fetching sprint data:", error);
    throw error;
  }
}

/**
 * Processes the raw API data into a structured format for our summaries
 */
function processSprintData(data) {
  console.log("[Sprint Summary] Processing API data");
  
  // Clear existing data
  sprintData.clear();
  
  const sprints = data.sprints || [];
  const issues = data.issues || [];
  
  console.log(`[Sprint Summary] Found ${sprints.length} sprints and ${issues.length} issues`);
  
  // Define done statuses
  const doneStatuses = ['Closed', 'Done', 'On Prod', 'On RC', "Won't Do"];
  
  // Initialize the map with sprint objects
  sprints.forEach(sprint => {
    sprintData.set(sprint.id, {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      summary: {
        BE: 0,
        FE: 0,
        Fullstack: 0
      },
      detailed: {
        BE: { inProgress: 0, done: 0 },
        FE: { inProgress: 0, done: 0 },
        Fullstack: { inProgress: 0, done: 0 }
      }
    });
  });
  
  // Process each issue
  issues.forEach(issue => {
    const sprintIds = issue.sprintIds || [];
    const storyPoints = issue.estimateStatistic?.statFieldValue?.value || 0;
    const summary = issue.summary || '';
    const status = issue.statusName || '';
    
    if (storyPoints === 0) {
      return; // Skip issues with no story points
    }
    
    const devType = getDevType(summary);
    const isDone = doneStatuses.includes(status);
    
    // Only count the issue in its most recent sprint to avoid double-counting
    // Issues can be in multiple sprints when moved between sprints
    if (sprintIds.length > 0 && devType !== 'Other') {
      // Get the most recent sprint ID (assume they're ordered chronologically)
      const mostRecentSprintId = sprintIds[sprintIds.length - 1];
      
      if (sprintData.has(mostRecentSprintId)) {
        const sprintInfo = sprintData.get(mostRecentSprintId);
        sprintInfo.summary[devType] += storyPoints;
        
        // Add to detailed breakdown
        if (isDone) {
          sprintInfo.detailed[devType].done += storyPoints;
        } else {
          sprintInfo.detailed[devType].inProgress += storyPoints;
        }
      }
    }
  });
  
  // Log the processed data
  console.log("[Sprint Summary] Processed sprint data:");
  sprintData.forEach((data, id) => {
    console.log(`  Sprint ${data.name} (${id}): BE=${data.summary.BE}, FE=${data.summary.FE}, FS=${data.summary.Fullstack}`);
    console.log(`    Detailed: BE(${data.detailed.BE.inProgress}/${data.detailed.BE.done}), FE(${data.detailed.FE.inProgress}/${data.detailed.FE.done}), FS(${data.detailed.Fullstack.inProgress}/${data.detailed.Fullstack.done})`);
  });
}

/**
 * Determines the development type based on the issue summary/title
 */
function getDevType(summary) {
  const lowerSummary = summary.toLowerCase();
  
  if (lowerSummary.includes('[fullstack]') || lowerSummary.includes('[fs]')) {
    return 'Fullstack';
  } else if (lowerSummary.includes('[fe]') || lowerSummary.includes('[frontend]')) {
    return 'FE';
  } else if (lowerSummary.includes('[be]') || lowerSummary.includes('[backend]')) {
    return 'BE';
  } else {
    // Default to 'Other' but don't count it in our summaries
    return 'Other';
  }
}

/**
 * Creates a detailed tooltip with breakdown by status
 */
function createTooltip(detailedData) {
  const tooltip = document.createElement('div');
  tooltip.className = 'dev-type-tooltip';
  
  // Create the table-like structure
  const table = document.createElement('div');
  table.style.display = 'grid';
  table.style.gridTemplateColumns = '1fr 1fr 1fr';
  table.style.gap = '16px';
  table.style.minWidth = '240px';
  
  // Create headers
  const headers = ['BE', 'FE', 'FS'];
  headers.forEach(header => {
    const headerElement = document.createElement('div');
    headerElement.textContent = header;
    headerElement.style.fontWeight = 'bold';
    headerElement.style.textAlign = 'center';
    headerElement.style.marginBottom = '8px';
    headerElement.style.color = '#fff';
    table.appendChild(headerElement);
  });
  
  // Create data rows
  const types = ['BE', 'FE', 'Fullstack'];
  types.forEach(type => {
    const column = document.createElement('div');
    column.style.textAlign = 'center';
    
    const inProgressValue = detailedData[type]?.inProgress || 0;
    const doneValue = detailedData[type]?.done || 0;
    
    // In Progress row
    const inProgressRow = document.createElement('div');
    inProgressRow.textContent = `In Progress: ${inProgressValue}`;
    inProgressRow.style.marginBottom = '4px';
    inProgressRow.style.color = '#ffcc99'; // Light orange for in progress
    column.appendChild(inProgressRow);
    
    // Done row
    const doneRow = document.createElement('div');
    doneRow.textContent = `Done: ${doneValue}`;
    doneRow.style.color = '#99ff99'; // Light green for done
    column.appendChild(doneRow);
    
    table.appendChild(column);
  });
  
  tooltip.appendChild(table);
  
  // Style the tooltip
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = '#333';
  tooltip.style.color = 'white';
  tooltip.style.padding = '12px 16px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.fontSize = '12px';
  tooltip.style.zIndex = '10000';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
  tooltip.style.opacity = '0';
  tooltip.style.transition = 'opacity 0.2s ease-in-out';
  
  document.body.appendChild(tooltip);
  
  return tooltip;
}

/**
 * Positions the tooltip relative to the target element
 */
function positionTooltip(tooltip, targetElement, event) {
  const rect = targetElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Position below the element by default
  let left = rect.left + (rect.width - tooltipRect.width) / 2;
  let top = rect.bottom + 8;
  
  // Keep tooltip within viewport bounds
  if (left < 8) left = 8;
  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }
  
  // If tooltip would be cut off at the bottom, position it above instead
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = rect.top - tooltipRect.height - 8;
  }
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

/**
 * Creates the summary element with dev type points and tooltip functionality
 */
function createSummaryElement(summary, detailedData) {
  // Create container with new gray background
  const container = document.createElement('span');
  container.className = 'dev-type-summary';
  // Apply inline styles for background and spacing
  container.style.backgroundColor = '#dddee1';
  container.style.padding = '4px 8px';
  container.style.borderRadius = '3px';
  container.style.display = 'inline-flex';
  container.style.marginRight = '16px';
  container.style.fontSize = '12px';
  container.style.alignItems = 'center';
  container.style.gap = '8px';
  container.style.cursor = 'help'; // Show help cursor on hover
  
  // Create BE element with darker blue
  const beElement = document.createElement('span');
  beElement.className = 'dev-type-be';
  beElement.textContent = `BE: ${summary.BE}`;
  beElement.style.color = '#0747A6';  // Darker blue
  beElement.style.fontWeight = '500';
  container.appendChild(beElement);
  
  // Create FE element with darker green
  const feElement = document.createElement('span');
  feElement.className = 'dev-type-fe';
  feElement.textContent = `FE: ${summary.FE}`;
  feElement.style.color = '#006644';  // Darker green
  feElement.style.fontWeight = '500';
  container.appendChild(feElement);
  
  // Create Fullstack element with darker purple
  const fullstackElement = document.createElement('span');
  fullstackElement.className = 'dev-type-fullstack';
  fullstackElement.textContent = `FS: ${summary.Fullstack}`;
  fullstackElement.style.color = '#403294';  // Darker purple
  fullstackElement.style.fontWeight = '500';
  container.appendChild(fullstackElement);
  
  // Add tooltip functionality
  let tooltip = null;
  
  container.addEventListener('mouseenter', (event) => {
    tooltip = createTooltip(detailedData);
    
    // Position and show tooltip after a brief delay
    setTimeout(() => {
      if (tooltip && document.body.contains(tooltip)) {
        positionTooltip(tooltip, container, event);
        tooltip.style.opacity = '1';
      }
    }, 100);
  });
  
  container.addEventListener('mouseleave', () => {
    if (tooltip && document.body.contains(tooltip)) {
      tooltip.style.opacity = '0';
      setTimeout(() => {
        if (tooltip && document.body.contains(tooltip)) {
          document.body.removeChild(tooltip);
        }
        tooltip = null;
      }, 200);
    }
  });
  
  // Update tooltip position on mouse move (for better positioning)
  container.addEventListener('mousemove', (event) => {
    if (tooltip && document.body.contains(tooltip)) {
      positionTooltip(tooltip, container, event);
    }
  });
  
  return container;
}

/**
 * Updates the UI with dev type summaries
 */
function updateUI(usePlaceholders = false) {
  const estimationContainers = document.querySelectorAll('[data-testid*="estimations-and-actions-container"]');
  console.log("[Sprint Summary] Found estimation containers:", estimationContainers.length);
  
  estimationContainers.forEach((estimationContainer, index) => {
    const statsArea = estimationContainer.parentElement;
    
    if (!statsArea) {
      return;
    }
    
    const sprintContainer = estimationContainer.closest('[data-drop-target-for-element="true"]');
    
    if (!sprintContainer) {
      return;
    }
    
    const sprintName = sprintContainer.querySelector('h2')?.textContent || `sprint-${index}`;
    const containerId = sprintName.replace(/\s+/g, '-');
    
    // Check if we've already added a summary to this sprint
    if (injectedSprints.has(containerId)) {
      return;
    }
    
    // Find the matching sprint data
    let summary = { BE: 0, FE: 0, Fullstack: 0 };
    let detailedData = {
      BE: { inProgress: 0, done: 0 },
      FE: { inProgress: 0, done: 0 },
      Fullstack: { inProgress: 0, done: 0 }
    };
    
    if (!usePlaceholders) {
      // Look for matching sprint by name
      for (const [_, data] of sprintData.entries()) {
        if (data.name === sprintName) {
          summary = data.summary;
          detailedData = data.detailed;
          break;
        }
      }
    }
    
    console.log(`[Sprint Summary] ${sprintName}: Adding summary`, summary);
    
    const summaryElement = createSummaryElement(summary, detailedData);
    
    statsArea.insertBefore(summaryElement, statsArea.firstChild);
    
    console.log(`[Sprint Summary] ${sprintName}: Summary added successfully`);
    injectedSprints.add(containerId);
  });
}

// Run on page load
console.log("[Sprint Summary] Extension loaded");

// Wait for page to load before running
setTimeout(function() {
  // Run once on page load
  addDevTypeSummaries();
  
  // Only listen for URL changes to handle navigation in the SPA
  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      console.log("[Sprint Summary] URL changed, updating");
      lastUrl = url;
      // Reset injected sprints when the URL changes
      injectedSprints.clear();
      addDevTypeSummaries();
    }
  }).observe(document, {subtree: true, childList: true});
  
}, 1500); // Slightly longer timeout to ensure page is fully loaded

// Add manual trigger for debugging
window.triggerSprintSummary = function() {
  console.log("[Sprint Summary] Manual trigger");
  injectedSprints.clear();
  addDevTypeSummaries();
};