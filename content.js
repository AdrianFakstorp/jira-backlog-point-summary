// Main function that runs on page load and whenever DOM changes
function addDevTypeSummaries() {
    // Only run on backlog pages
    if (window.location.href.includes('backlog')) {
      // Find all sprint sections
      const sprintSections = document.querySelectorAll('[data-test-id="software-backlog.backlog-content.scrollable"]');
      
      if (sprintSections.length > 0) {
        processSprints(sprintSections);
      } else {
        // Fallback to other possible sprint selectors
        const altSprintSections = document.querySelectorAll('[class*="backlog-content"]');
        if (altSprintSections.length > 0) {
          processSprints(altSprintSections);
        }
      }
    }
  }
  
  function processSprints(sprintSections) {
    sprintSections.forEach(section => {
      // Find all sprints within this section
      const sprints = section.querySelectorAll('[data-test-id*="sprint-container"], [class*="sprint-container"]');
      
      sprints.forEach(sprint => {
        // Check if we've already added summaries to this sprint
        if (sprint.querySelector('.dev-type-summary')) {
          return;
        }
        
        // Get all issues in this sprint
        const issues = sprint.querySelectorAll('[data-test-id*="card"], [class*="ghx-issue"], [class*="js-issue"]');
        
        // Calculate points
        const summary = calculateDevTypeSummary(issues);
        
        // Find the location to insert our summary
        // Looking for the sprint header or the stats area
        const statsContainer = sprint.querySelector('[data-test-id*="sprint-header"], [class*="ghx-sprint-header"], [class*="ghx-stat-fields"]');
        
        if (statsContainer) {
          // Create and insert the summary elements
          insertDevTypeSummary(statsContainer, summary);
        }
      });
    });
  }
  
  function calculateDevTypeSummary(issues) {
    // Initialize counters
    const summary = {
      BE: 0,
      FE: 0,
      Fullstack: 0
    };
    
    issues.forEach(issue => {
      // Get the story points
      let storyPoints = 0;
      const pointsElement = issue.querySelector('[data-test-id*="estimation"], [class*="ghx-estimate"], [class*="aui-badge"]');
      
      if (pointsElement) {
        const pointsText = pointsElement.textContent.trim();
        storyPoints = parseInt(pointsText) || 0;
      }
      
      // If no story points, no need to categorize
      if (storyPoints === 0) {
        return;
      }
      
      // Get the issue summary
      const summaryElement = issue.querySelector('[data-test-id*="summary"], [class*="ghx-summary"], [class*="js-issue-title"]');
      if (!summaryElement) {
        return;
      }
      
      const summaryText = summaryElement.textContent.trim();
      const devType = getDevType(summaryText);
      
      // Add to the appropriate counter
      summary[devType] += storyPoints;
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
  
  function insertDevTypeSummary(container, summary) {
    // Create container for our custom summary
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'dev-type-summary';
    
    // Create BE element
    const beElement = document.createElement('span');
    beElement.className = 'dev-type-be';
    beElement.textContent = `BE: ${summary.BE}`;
    summaryContainer.appendChild(beElement);
    
    // Create FE element
    const feElement = document.createElement('span');
    feElement.className = 'dev-type-fe';
    feElement.textContent = `FE: ${summary.FE}`;
    summaryContainer.appendChild(feElement);
    
    // Create Fullstack element
    const fullstackElement = document.createElement('span');
    fullstackElement.className = 'dev-type-fullstack';
    fullstackElement.textContent = `Fullstack: ${summary.Fullstack}`;
    summaryContainer.appendChild(fullstackElement);
    
    // Find the best place to insert - looking at the specific classes from your screenshot
    const targetLocation = container.querySelector('[class*="css-np5xyz"], [class*="css-1c4j6bn"], [class*="estimation-badge-container"]');
    
    if (targetLocation) {
      // Insert before the target location
      targetLocation.parentNode.insertBefore(summaryContainer, targetLocation);
    } else {
      // Fallback: append to the container
      container.appendChild(summaryContainer);
    }
  }
  
  // Run on page load
  addDevTypeSummaries();
  
  // Set up a MutationObserver to handle dynamic content loading
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        // Check if any of the added nodes might contain sprints
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            // If it's an element, check if it's a sprint or contains sprints
            if (node.querySelector('[data-test-id*="sprint-container"], [class*="sprint-container"]')) {
              addDevTypeSummaries();
              break;
            }
          }
        }
      }
    });
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also add event listener for URL changes since Jira is a SPA
  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      addDevTypeSummaries();
    }
  }).observe(document, {subtree: true, childList: true});