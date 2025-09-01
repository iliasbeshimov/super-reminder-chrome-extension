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
        eventListeners.forEach(({ element, event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
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

    function addEventListenerWithCleanup(element, event, handler) {
        element.addEventListener(event, handler);
        eventListeners.push({ element, event, handler });
    }

    // --- MESSAGE LISTENER ---
    messageListener = (message, sender, sendResponse) => {
        try {
            switch (message.type) {
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
            snoozeBtn.textContent = 'Snooze until 2m before';
            
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
            actions.appendChild(snoozeBtn);
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
            addEventListenerWithCleanup(snoozeBtn, 'click', snoozeHandler);
            addEventListenerWithCleanup(document, 'keydown', keyHandler);
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

    // --- PAGE UNLOAD CLEANUP ---
    addEventListenerWithCleanup(window, 'beforeunload', cleanup);
    addEventListenerWithCleanup(window, 'unload', cleanup);
    
    // Cleanup on extension context disconnect
    if (chrome.runtime?.onConnect) {
        chrome.runtime.onConnect.addListener((port) => {
            port.onDisconnect.addListener(cleanup);
        });
    }
    
    // Additional cleanup for SPA navigation
    if (window.addEventListener) {
        addEventListenerWithCleanup(window, 'popstate', cleanup);
        addEventListenerWithCleanup(window, 'pushstate', cleanup);
        addEventListenerWithCleanup(window, 'replacestate', cleanup);
    }

    // --- INITIALIZATION COMPLETE ---
    console.log('Super Reminder content script loaded successfully');
})();

