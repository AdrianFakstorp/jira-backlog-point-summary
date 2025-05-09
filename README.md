# Jira Sprint Dev Type Summary

A Chrome extension that adds development type point summaries (FE, BE, Fullstack) to Jira sprint boards.

## Features

- Automatically displays point summaries for FE, BE, and Fullstack tickets in each sprint
- Updates dynamically as sprints and tickets load
- Works on any Jira project board

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the directory containing this extension
5. Navigate to any Jira board with sprints to see the extension in action

## How It Works

The extension scans each sprint for tickets with [FE], [BE], or [Fullstack] prefixes in their titles,
calculates the sum of story points for each type, and displays these sums next to the existing
sprint statistics.