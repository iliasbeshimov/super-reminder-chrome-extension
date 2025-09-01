Super Reminder Chrome Extension
1. Project Summary
Super Reminder is a Chrome extension designed to combat notification fatigue by providing an unmissable alert system for critical reminders. Instead of a small, easily ignored pop-up, it creates a full-screen "takeover" overlay on all open tabs, forcing the user to acknowledge the event. The goal is to be effective and disruptive for truly important tasks without being annoying for daily use.

2. Core Problem Solved
In a world of constant digital noise, standard calendar and OS notifications are often overlooked. This extension solves that problem for high-priority events by creating a modal, attention-grabbing alert that cannot be missed, ensuring users never forget a critical meeting, deadline, or task.

3. Key Features
CRUD for Reminders: Users can Create, Read, Update, and Delete reminders.

Reminder Details: Each reminder includes a Title, an optional Note, a Date, and a Time.

Automatic Pre-Alert: The takeover is triggered automatically 10 minutes before the scheduled event time.

Full-Browser Takeover: The alert overlay appears on all open Chrome tabs simultaneously.

Synchronized Controls: Dismissing or snoozing the alert on any single tab will dismiss it across all tabs.

Smart Snooze: Provides a context-aware option to "Snooze until 2 minutes before" the event.

Website Whitelisting: Users can specify websites (e.g., meet.google.com, zoom.us) where the takeover alert should never appear, preventing interruptions during active calls or presentations.

Intuitive UI: A clean interface for managing reminders and settings.

Dev Mode: A dedicated button to trigger a test takeover for easy development and testing without waiting for a scheduled time.

4. Technical Workflow
The extension operates using a standard Chrome Extension architecture (Manifest V3).

User Interface (popup.html, popup.js): The user interacts with the extension via its toolbar icon, which opens a popup. This UI is responsible for handling user input to create, edit, and delete reminders and manage the whitelist.

Data Persistence (/shared/storage.js): All reminders and whitelist data are saved to chrome.storage.sync. A dedicated storage module handles all read/write operations, ensuring data consistency.

Scheduling (/shared/alarms.js): When a reminder is created or updated, the popup.js script communicates with a dedicated alarm management module. This module uses the chrome.alarms API to set a precise trigger for the alert time. Using chrome.alarms is energy-efficient as it does not require a persistent background script.

Background Listener (/background/service_worker.js): A service worker listens for the chrome.alarms.onAlarm event. When an alarm fires, it signifies that a reminder is due.

Content Injection (/background/service_worker.js -> /content/takeover_injector.js): Upon receiving an alarm, the service worker identifies all active tabs. It then programmatically injects the takeover_injector.js content script and takeover.css stylesheet into each tab.

The Takeover (/content/takeover_injector.js): Once injected into a webpage, this script dynamically creates the full-screen overlay div, populates it with the reminder's details (Title, Note, Time), and adds the "Snooze" and "Dismiss" buttons. It also listens for clicks on these buttons.

Synchronized Dismissal: When a dismiss/snooze button is clicked in any tab, the content script sends a message back to the service_worker.js. The service worker then broadcasts a message to the content scripts in all other tabs instructing them to remove the overlay, ensuring the action is synchronized. It also updates or deletes the reminder from storage and the corresponding alarm.