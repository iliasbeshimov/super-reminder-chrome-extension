
# Gemini Self-Instruction Manual: Super Reminder Chrome Extension

This document outlines the architecture and functionality of the Super Reminder Chrome Extension to guide future development and maintenance.

## 1. Project Overview

Super Reminder is a Chrome extension that displays full-screen, unmissable alerts for important reminders. It is designed to be disruptive for critical events, ensuring users do not miss them.

**Core Features:**
- CRUD functionality for reminders (Title, Note, Date, Time).
- Full-screen "takeover" overlay on all open tabs.
- Synchronized controls (dismiss/snooze on one tab affects all).
- Smart snooze functionality.
- Website whitelisting to prevent takeovers on specific sites.
- A "Dev Mode" button to trigger a test takeover.

## 2. File Structure and Responsibilities

- **`manifest.json`**: Extension configuration, permissions (`storage`, `alarms`, `scripting`, `tabs`), and entry points.
- **`icons/`**: Extension icons.
- **`popup/`**: Contains the user-facing interface for managing reminders.
  - `popup.html`: The structure of the popup.
  - `popup.css`: Styles for the popup.
  - `popup.js`: Handles user input, interacts with the `storage` and `alarms` modules.
- **`background/`**: Core background logic.
  - `service_worker.js`: Listens for `chrome.alarms`, injects content scripts, and manages communication between different parts of the extension.
- **`content/`**: Files injected into web pages.
  - `takeover.css`: Styles for the full-screen overlay.
  - `takeover_injector.js`: Creates the overlay, displays reminder information, and sends user actions (dismiss/snooze) to the `service_worker`.
- **`shared/`**: Reusable modules.
  - `storage.js`: Manages all data persistence using `chrome.storage.sync`. Handles reminders and the whitelist, and includes a caching mechanism.
  - `alarms.js`: A module for creating and deleting alarms using the `chrome.alarms` API.

## 3. Technical Workflow

1.  **Reminder Creation**:
    - The user creates a reminder in `popup.js`.
    - `popup.js` calls `storage.js` to save the reminder.
    - `popup.js` calls `alarms.js` to create a `chrome.alarm`.

2.  **Alarm Trigger**:
    - The `chrome.alarms.onAlarm` event fires in `background/service_worker.js`.
    - The service worker retrieves the reminder details from storage.

3.  **Takeover Injection**:
    - The `service_worker.js` queries all open tabs.
    - It injects `content/takeover.css` and `content/takeover_injector.js` into each valid tab (respecting the whitelist).
    - The service worker then sends a message to the content script with the reminder data.

4.  **Takeover Display**:
    - `takeover_injector.js` receives the message and creates the full-screen overlay.
    - It displays the reminder title, note, and time, along with "Snooze" and "Dismiss" buttons.

5.  **User Interaction**:
    - When the user clicks "Snooze" or "Dismiss" in any tab, `takeover_injector.js` sends a message to the `service_worker.js`.
    - The `service_worker.js` then:
        - Deletes or updates the reminder in storage (via `storage.js`).
        - Deletes or updates the corresponding alarm (via `alarms.js`).
        - Broadcasts a "close" message to all other tabs to remove the overlay simultaneously.

## 4. Development Guidelines

- **Data Flow**: Always follow the established data flow: `popup` -> `storage`/`alarms` -> `service_worker` -> `content script`.
- **Modularity**: Keep the `shared` modules for generic, reusable logic. `popup`, `background`, and `content` scripts should handle their specific responsibilities.
- **State Management**: State (reminders, whitelist) is managed in `chrome.storage.sync` via the `storage.js` module. The popup UI is rendered based on this data.
- **Communication**: Use `chrome.runtime.sendMessage` for communication between different parts of the extension.
- **Error Handling**: Implement robust error handling, especially for asynchronous operations and Chrome API calls.
- **Permissions**: Be mindful of the permissions requested in `manifest.json`. Do not add new permissions without a strong justification.
