# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Super Reminder is a Manifest V3 Chrome extension that creates unmissable, full-screen takeover alerts for critical reminders. The extension uses a distributed architecture with shared modules and triggers alarms 10 minutes before scheduled events.

## Development Commands

**Loading the extension:**
```bash
# Load extension in Chrome developer mode by pointing to the project root directory
# No build step required - this is a pure vanilla JS extension
```

**Testing:**
- Use the "Dev Trigger" button in the popup to test takeover functionality without waiting
- Test on various websites to verify whitelist behavior
- Check chrome://extensions/ for error logs in the service worker

## Architecture

**Key Design Patterns:**
- **Modular ES6 imports:** Shared business logic in `/shared/` modules prevents code duplication
- **Message-based communication:** Service worker coordinates between popup, alarms, and content scripts
- **Synchronized actions:** Dismissing on one tab removes overlay from all tabs simultaneously
- **Smart scheduling:** Alarms trigger 10 minutes before events, with snooze rescheduling to 2 minutes before

**Core Components:**
- `popup/popup.js` - Main UI logic, uses shared storage/alarms modules
- `background/service_worker.js` - Alarm listener, tab injection, message routing
- `content/takeover_injector.js` - Creates full-screen overlay, handles user actions
- `shared/storage.js` - Chrome storage abstraction with default whitelist
- `shared/alarms.js` - Chrome alarms API wrapper with 10-minute pre-alert logic

**Data Flow:**
1. User creates reminder → Storage + Alarm created
2. Alarm fires → Service worker injects content script into all non-whitelisted tabs
3. Content script shows overlay → User action sends message to service worker
4. Service worker broadcasts close message → All overlays removed simultaneously

**Important Implementation Details:**
- Alarms are named `reminder-${id}` for unique identification
- Whitelist matches against `url.hostname.includes(site)` for subdomain support
- Test reminders have `isTest: true` flag to prevent storage persistence
- Content script uses IIFE with `hasSuperReminderInjector` guard to prevent double injection
- Date/time handling preserves original values for snooze calculations

## File Structure Notes

The codebase uses a clean separation between `/popup/`, `/background/`, `/content/`, and `/shared/` directories. The manifest.json references files using the proper directory structure, but currently some files are in the root that should be moved to match the documented structure.