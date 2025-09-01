(() => {
    // Prevent the script from running multiple times on the same page
    if (window.hasSuperReminderInjector) {
        return;
    }
    window.hasSuperReminderInjector = true;

    // --- CONSTANTS ---
    const OVERLAY_ID = 'super-reminder-takeover-overlay';
    const ANIMATION_DURATION = 300;

    // --- STATE MANAGEMENT ---
    let currentOverlay = null;
    let eventListeners = [];
    let messageListener = null;

    // --- CLEANUP UTILITIES ---
    function cleanup() {
        // Remove event listeners
        eventListeners.forEach(({ element, event, handler, options }) => {
            if (element && element.removeEventListener) {
                try {
                    element.removeEventListener(event, handler, options);
                } catch (_) {
                    // Ignore remove failures
                }
            }
        });
        eventListeners = [];

        // Remove message listener
        if (messageListener && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.removeListener(messageListener);
            messageListener = null;
        }

        // Remove overlay
        if (currentOverlay) {
            currentOverlay.remove();
            currentOverlay = null;
        }
    }

    function addEventListenerWithCleanup(element, event, handler, options) {
        // Skip adding listeners that are commonly blocked by CSP
        if (isRestrictedEvent(event)) {
            return;
        }
        
        try {
            element.addEventListener(event, handler, options);
            eventListeners.push({ element, event, handler, options });
        } catch (err) {
            // Some pages disallow certain events due to permission policies. Fail gracefully.
            // Don't log to avoid console noise
        }
    }
    
    function isRestrictedEvent(event) {
        // Events commonly blocked by CSP or permission policies
        const restrictedEvents = ['unload', 'beforeunload', 'pagehide', 'visibilitychange'];
        return restrictedEvents.includes(event);
    }

    // --- MESSAGE LISTENER ---
        // --- MESSAGE LISTENER ---
    messageListener = (message, sender, sendResponse) => {
        try {
            switch (message.type) {
                case 'PING':
                    sendResponse({ ready: true });
                    break;
                case 'SHOW_TAKEOVER':
                    if (message.reminder) {
                        createTakeover(message.reminder);
                        sendResponse({ success: true });
                    } else {
                        console.error('No reminder data provided');
                        sendResponse({ success: false, error: 'No reminder data' });
                    }
                    break;
                case 'CLOSE_TAKEOVER':
                    removeTakeover();
                    sendResponse({ success: true });
                    break;
                default:
                    // Silently ignore unknown message types
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message in content script:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Keep message channel open for async response
    };

    if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(messageListener);
    }

    // --- INITIALIZATION & HANDSHAKE ---
    // Signal to the service worker that the script is injected and ready.
    // This is crucial for solving the race condition.
    try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
        }
    } catch (e) {
        // Extension context may be invalidated or CSP may block messaging
        // This is not critical for functionality, so fail silently
    }

    // --- DOM MANIPULATION ---
    function createTakeover(reminder) {
        try {
            // If an overlay already exists, remove it first
            if (currentOverlay) {
                removeTakeover();
            }

            // Validate reminder data
            if (!reminder || typeof reminder !== 'object') {
                console.error('Invalid reminder data:', reminder);
                return;
            }

            const overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            currentOverlay = overlay;
            
            // Create DOM structure safely
            const modal = document.createElement('div');
            modal.className = 'sr-modal';
            
            const iconContainer = document.createElement('div');
            iconContainer.className = 'sr-icon-container';
            iconContainer.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            `;
            
            const title = document.createElement('h2');
            title.className = 'sr-title';
            title.textContent = sanitizeText(reminder.title) || 'Reminder';
            
            const dueTime = document.createElement('p');
            dueTime.className = 'sr-due-time';
            dueTime.textContent = sanitizeText(reminder.originalTime) || reminder.time || '';
            
            const actions = document.createElement('div');
            actions.className = 'sr-actions';
            
            const snoozeBtn = document.createElement('button');
            snoozeBtn.id = 'sr-smart-snooze-btn';
            snoozeBtn.className = 'sr-btn sr-btn-snooze';
            snoozeBtn.textContent = 'Snooze until 2 min before';
            
            const dismissBtn = document.createElement('button');
            dismissBtn.id = 'sr-dismiss-btn';
            dismissBtn.className = 'sr-btn sr-btn-dismiss';
            dismissBtn.textContent = 'Dismiss';
            
            // Assemble the modal
            modal.appendChild(iconContainer);
            modal.appendChild(title);
            
            // Add note if present
            if (reminder.note && reminder.note.trim()) {
                const note = document.createElement('p');
                note.className = 'sr-note';
                note.textContent = sanitizeText(reminder.note);
                modal.appendChild(note);
            }
            
            modal.appendChild(dueTime);
            // Hide snooze if already 2 minutes before original time
            if (!isTwoMinutesBefore(reminder)) {
                actions.appendChild(snoozeBtn);
            }
            actions.appendChild(dismissBtn);
            modal.appendChild(actions);
            overlay.appendChild(modal);
            
            // Add event handlers with cleanup tracking
            const dismissHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDismiss(reminder);
            };
            
            const snoozeHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSnooze(reminder);
            };
            
            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleDismiss(reminder);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleDismiss(reminder);
                }
            };
            
            // Prevent clicks on modal from bubbling to overlay
            const modalClickHandler = (e) => {
                e.stopPropagation();
            };
            
            // Close on overlay click (background)
            const overlayClickHandler = (e) => {
                if (e.target === overlay) {
                    handleDismiss(reminder);
                }
            };
            
            addEventListenerWithCleanup(dismissBtn, 'click', dismissHandler);
            if (!isTwoMinutesBefore(reminder)) {
                addEventListenerWithCleanup(snoozeBtn, 'click', snoozeHandler);
            }
            // Add keydown listener with extra safety
            try {
                document.addEventListener('keydown', keyHandler);
                eventListeners.push({ element: document, event: 'keydown', handler: keyHandler });
            } catch (e) {
                // If keydown is blocked, the modal can still be dismissed via buttons
            }
            addEventListenerWithCleanup(modal, 'click', modalClickHandler);
            addEventListenerWithCleanup(overlay, 'click', overlayClickHandler);
            
            // Add overlay to DOM
            document.body.appendChild(overlay);
            
            // Focus management for accessibility
            setTimeout(() => {
                if (dismissBtn && dismissBtn.focus) {
                    dismissBtn.focus();
                }
            }, 100);
            
        } catch (error) {
            console.error('Error creating takeover:', error);
        }
    }
    
    function handleDismiss(reminder) {
        try {
            if (chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ 
                    type: 'DISMISS_TAKEOVER', 
                    reminderId: reminder.id, 
                    isTest: reminder.isTest || false 
                });
            }
        } catch (error) {
            console.error('Error sending dismiss message:', error);
            // Still remove the overlay even if message fails
            removeTakeover();
        }
    }
    
    function handleSnooze(reminder) {
        try {
            if (chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ 
                    type: 'SNOOZE_TAKEOVER', 
                    reminderId: reminder.id, 
                    reminder, 
                    isTest: reminder.isTest || false 
                });
            }
        } catch (error) {
            console.error('Error sending snooze message:', error);
            // Still remove the overlay even if message fails
            removeTakeover();
        }
    }

    function removeTakeover() {
        try {
            if (currentOverlay) {
                // Animate out
                currentOverlay.style.opacity = '0';
                currentOverlay.style.transform = 'scale(0.95)';
                
                setTimeout(() => {
                    if (currentOverlay && currentOverlay.parentNode) {
                        currentOverlay.remove();
                    }
                    currentOverlay = null;
                    
                    // Clean up event listeners
                    eventListeners.forEach(({ element, event, handler }) => {
                        if (element && element.removeEventListener) {
                            element.removeEventListener(event, handler);
                        }
                    });
                    eventListeners = [];
                }, ANIMATION_DURATION);
            } else {
                // Fallback: remove any overlay that might exist
                const overlay = document.getElementById(OVERLAY_ID);
                if (overlay) {
                    overlay.remove();
                }
            }
        } catch (error) {
            console.error('Error removing takeover:', error);
        }
    }

    // --- SECURITY & UTILITY ---
    function sanitizeText(str) {
        if (typeof str !== 'string') {
            return '';
        }
        // Basic sanitization - remove potential HTML/script content
        return str.replace(/<[^>]*>/g, '').trim().substring(0, 1000);
    }

    function isTwoMinutesBefore(reminder) {
        try {
            if (!reminder?.originalDate || !reminder?.originalTime) return false;
            const original = new Date(`${reminder.originalDate}T${reminder.originalTime}`).getTime();
            const expected = original - 2 * 60 * 1000; // T-2 minutes
            const current = new Date(`${reminder.date}T${reminder.time}`).getTime();
            // Allow small drift of up to 30s
            return Math.abs(current - expected) <= 30 * 1000;
        } catch {
            return false;
        }
    }

    // --- PAGE LIFECYCLE CLEANUP (CSP-safe) ---
    // Try to add cleanup listeners, but don't fail if CSP blocks them
    // Most modern browsers support these without issues
    try {
        // Only add essential cleanup listeners that are less likely to be blocked
        if (window.addEventListener && !isRestrictedByCSP()) {
            window.addEventListener('popstate', cleanup, { passive: true });
            eventListeners.push({ element: window, event: 'popstate', handler: cleanup, options: { passive: true } });
        }
    } catch (e) {
        // CSP blocked the listener, but that's okay
    }
    
    // Fallback cleanup timer as a safety net
    const cleanupTimer = setTimeout(() => {
        if (currentOverlay && !document.body.contains(currentOverlay)) {
            cleanup();
        }
    }, 30000); // 30 seconds
    
    // Clear timer when overlay is actually removed
    const originalCleanup = cleanup;
    cleanup = () => {
        clearTimeout(cleanupTimer);
        originalCleanup();
    };
    
    function isRestrictedByCSP() {
        try {
            // Simple test to check if we can add event listeners
            const testHandler = () => {};
            window.addEventListener('test', testHandler);
            window.removeEventListener('test', testHandler);
            return false;
        } catch (e) {
            return true;
        }
    }

    // --- INITIALIZATION COMPLETE ---
    console.log('Super Reminder content script loaded successfully');
})();
