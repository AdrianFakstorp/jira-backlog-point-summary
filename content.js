// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 3000; // 3 seconds
let attemptCount = 0;
let injectedSprints = new Set(); // Track which sprints we've already injected into

// Main function that runs on page load and whenever DOM changes
function addDevTypeSummaries() {
  console.log("[Sprint Summary] Extension running, attempt:", attemptCount + 1);
  
  // Safety check - don't try too many times
  if (attemptCount >= MAX_RETRY_ATTEMPTS) {
    console.log("[Sprint Summary] Max retry attempts reached, stopping");
    return;
  }
  
  attemptCount++;
  
  // Only run on backlog pages
  if (!window.location.href.includes('backlog')) {
    console.log("[Sprint Summary] Not on backlog page, skipping");
    return;
  }
  
  // Get the sprint container
  const sprintContainers = document.querySelectorAll('[data-test-id*="sprint-container"], [class*="sprint-container"], [role="row"]');
  console.log("[Sprint Summary] Found sprint containers:", sprintContainers.length);
  
  if (sprintContainers.length === 0) {
    // No sprint containers found, retry after delay
    console.log("[Sprint Summary] No sprint containers found, will retry later");
    scheduleRetry();
    return;
  }
  
  let processedAny = false;
  
  // Process each sprint container
  sprintContainers.forEach((container, index) => {
    // Create a unique ID for this container to avoid duplicate processing
    const containerId = container.getAttribute('data-test-id') || 
                        container.getAttribute('id') || 
                        `sprint-container-${index}`;
    
    // Skip if we've already processed this sprint
    if (injectedSprints.has(containerId)) {
      return;
    }
    
    // Look for sprint header or title
    const sprintHeader = container.querySelector('[data-test-id*="sprint-header"], [class*="sprint-header"], [role="rowheader"]');
    if (!sprintHeader) {
      return; // Not a sprint container
    }
    
    // Get all issues in this sprint
    const issues = container.querySelectorAll('[data-test-id*="card"], [class*="ghx-issue"], [class*="js-issue"], [role="row"]:not([role="rowheader"])');
    console.log(`[Sprint Summary] Sprint ${index}: Found ${issues.length} issues`);
    
    if (issues.length === 0) {
      return; // No issues to process
    }
    
    // Calculate points
    const summary = calculateDevTypeSummary(issues);
    console.log(`[Sprint Summary] Sprint ${index}: Summary calculated:`, summary);
    
    // Look for the stats area (with numbers 31 46 0)
    const statsArea = container.querySelector('.css-np5xyz, [class*="complete-sprint"]');
    
    if (statsArea) {
      // Create a new element to add before the stats
      const summaryElement = createSummaryElement(summary);
      
      // Insert the summary before the stats
      const parentElement = statsArea.parentElement;
      if (parentElement) {
        parentElement.insertBefore(summaryElement, statsArea);
        console.log(`[Sprint Summary] Sprint ${index}: Summary added successfully`);
        processedAny = true;
        injectedSprints.add(containerId); // Mark as processed
      }
    }
  });
  
  // If we didn't process any sprints, schedule a retry
  if (!processedAny && attemptCount < MAX_RETRY_ATTEMPTS) {
    console.log("[Sprint Summary] No sprints were processed, will retry later");
    scheduleRetry();
  }
}

function createSummaryElement(summary) {
  // Create container
  const container = document.createElement('span');
  container.className = 'dev-type-summary';
  container.style.marginRight = '16px';
  container.style.display = 'inline-block';
  container.style.fontSize = '12px';
  
  // Create BE element
  const beElement = document.createElement('span');
  beElement.className = 'dev-type-be';
  beElement.textContent = `BE: ${summary.BE}`;
  beElement.style.color = '#0052cc';
  beElement.style.marginRight = '8px';
  container.appendChild(beElement);
  
  // Create FE element
  const feElement = document.createElement('span');
  feElement.className = 'dev-type-fe';
  feElement.textContent = `FE: ${summary.FE}`;
  feElement.style.color = '#00875a';
  feElement.style.marginRight = '8px';
  container.appendChild(feElement);
  
  // Create Fullstack element
  const fullstackElement = document.createElement('span');
  fullstackElement.className = 'dev-type-fullstack';
  fullstackElement.textContent = `FS: ${summary.Fullstack}`;
  fullstackElement.style.color = '#6554c0';
  container.appendChild(fullstackElement);
  
  return container;
}

function calculateDevTypeSummary(issues) {
  // Initialize counters
  const summary = {
    BE: 0,
    FE: 0,
    Fullstack: 0
  };
  
  issues.forEach(issue => {
    // Skip if this isn't really an issue
    if (issue.querySelector('[role="rowheader"]')) {
      return;
    }
    
    // Get the story points
    let storyPoints = 0;
    const pointsElement = issue.querySelector('[data-test-id*="estimation"], [class*="ghx-estimate"], [class*="aui-badge"]');
    
    if (pointsElement) {
      const pointsText = pointsElement.textContent.trim();
      storyPoints = parseInt(pointsText) || 0;
    } else {
      // Try to find points in the last cell of the row
      const cells = issue.querySelectorAll('[role="cell"]');
      if (cells.length > 0) {
        const lastCell = cells[cells.length - 1];
        const text = lastCell.textContent.trim();
        if (/^\d+$/.test(text)) {
          storyPoints = parseInt(text) || 0;
        }
      }
    }
    
    // If no story points, no need to categorize
    if (storyPoints === 0) {
      return;
    }
    
    // Get the issue summary
    let summaryText = '';
    const summaryElement = issue.querySelector('[data-test-id*="summary"], [class*="ghx-summary"], [class*="js-issue-title"]');
    
    if (summaryElement) {
      summaryText = summaryElement.textContent.trim();
    } else {
      // Try to find the summary in any cell
      const cells = issue.querySelectorAll('[role="cell"]');
      for (const cell of cells) {
        const text = cell.textContent.trim();
        if (text.includes('[BE]') || text.includes('[FE]') || text.includes('[Fullstack]')) {
          summaryText = text;
          break;
        }
      }
      
      // If still no summary, use the entire issue text
      if (!summaryText) {
        summaryText = issue.textContent.trim();
      }
    }
    
    if (!summaryText) {
      return;
    }
    
    const devType = getDevType(summaryText);
    
    // Add to the appropriate counter
    if (devType !== 'Other') {
      summary[devType] += storyPoints;
    }
  });
  
  return summary;
}

function getDevType(summary) {
  const lowerSummary = summary.toLowerCase();
  
  if (lowerSummary.includes('[fullstack]')) {
    return 'Fullstack';
  } else if (lowerSummary.includes('[fe]')) {
    return 'FE';
  } else if (lowerSummary.includes('[be]')) {
    return 'BE';
  } else {
    // Default to 'Other' but don't count it in our summaries
    return 'Other';
  }
}

function scheduleRetry() {
  // Only schedule a retry if we haven't reached the maximum attempts
  if (attemptCount < MAX_RETRY_ATTEMPTS) {
    console.log(`[Sprint Summary] Scheduling retry ${attemptCount}/${MAX_RETRY_ATTEMPTS} in ${RETRY_DELAY}ms`);
    setTimeout(addDevTypeSummaries, RETRY_DELAY);
  }
}

// Run on page load
console.log("[Sprint Summary] Extension loaded");

// Wait for page to load before first attempt
setTimeout(function() {
  // Reset attempt count for initial run
  attemptCount = 0;
  addDevTypeSummaries();
  
  // Set up a MutationObserver to handle dynamic content loading
  const observer = new MutationObserver(function(mutations) {
    // Check if any mutation adds a relevant node
    let shouldUpdate = false;
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Only trigger if a meaningful element is added
            if (node.querySelector('[data-test-id*="sprint-container"], [class*="sprint-container"], [role="row"]')) {
              shouldUpdate = true;
              break;
            }
          }
        }
      }
    });
    
    if (shouldUpdate) {
      console.log("[Sprint Summary] DOM changes detected, updating");
      // Reset attempt count for observer-triggered runs
      attemptCount = 0;
      addDevTypeSummaries();
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also add event listener for URL changes since Jira is a SPA
  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      console.log("[Sprint Summary] URL changed, updating");
      lastUrl = url;
      // Reset attempt count for URL-change-triggered runs
      attemptCount = 0;
      addDevTypeSummaries();
    }
  }).observe(document, {subtree: true, childList: true});
  
}, 1000);

// Add manual trigger for debugging
window.triggerSprintSummary = function() {
  console.log("[Sprint Summary] Manual trigger");
  // Reset attempt count for manual triggers
  attemptCount = 0;
  addDevTypeSummaries();
};