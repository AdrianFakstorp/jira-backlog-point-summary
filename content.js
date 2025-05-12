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

// Remove the now unused detectBoardTypeFromDOM function

// Remove the checkEstimationsFromDOM function since we're not using it anymore

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
 * Extracts the board ID from the current URL
 */
function extractBoardId() {
  // First try modern URL format: boards/XX/backlog
  let matches = window.location.href.match(/boards\/(\d+)/);
  let boardId = '24'; // Default fallback value
  
  if (matches && matches[1]) {
    boardId = matches[1];
  } else {
    // Fallback to legacy URL format: rapidView=XX
    matches = window.location.href.match(/rapidView=(\d+)/);
    if (matches && matches[1]) {
      boardId = matches[1];
    }
  }
  
  return boardId;
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
      }
    });
  });
  
  // Process each issue
  issues.forEach(issue => {
    const sprintIds = issue.sprintIds || [];
    const storyPoints = issue.estimateStatistic?.statFieldValue?.value || 0;
    const summary = issue.summary || '';
    
    if (storyPoints === 0) {
      return; // Skip issues with no story points
    }
    
    const devType = getDevType(summary);
    
    // Add points to appropriate sprints
    sprintIds.forEach(sprintId => {
      if (sprintData.has(sprintId) && devType !== 'Other') {
        sprintData.get(sprintId).summary[devType] += storyPoints;
      }
    });
  });
  
  // Log the processed data
  console.log("[Sprint Summary] Processed sprint data:");
  sprintData.forEach((data, id) => {
    console.log(`  Sprint ${data.name} (${id}): BE=${data.summary.BE}, FE=${data.summary.FE}, FS=${data.summary.Fullstack}`);
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
 * Creates the summary element with dev type points
 */
function createSummaryElement(summary) {
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
  container.appendChild(fullstackElement);
  
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
    
    if (!usePlaceholders) {
      // Look for matching sprint by name
      for (const [_, data] of sprintData.entries()) {
        if (data.name === sprintName) {
          summary = data.summary;
          break;
        }
      }
    }
    
    console.log(`[Sprint Summary] ${sprintName}: Adding summary`, summary);
    
    const summaryElement = createSummaryElement(summary);
    
    statsArea.insertBefore(summaryElement, statsArea.firstChild);
    
    console.log(`[Sprint Summary] ${sprintName}: Summary added successfully`);
    injectedSprints.add(containerId);
  });
}

// We're removing the API interception since we only need to update on page load

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