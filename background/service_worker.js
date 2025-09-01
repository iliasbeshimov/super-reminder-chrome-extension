import { getReminders, getWhitelist, saveReminder, deleteReminder } from '../shared/storage.js';
import { createAlarm, deleteAlarm, ALARM_NAME_PREFIX } from '../shared/alarms.js';

// --- CONSTANTS ---
const TEST_REMINDER_OFFSET = 0; // Trigger test immediately instead of 10 mins
const SNOOZE_MINUTES_BEFORE = 2;
const MAX_INJECTION_RETRIES = 3;
const RETRY_DELAY = 500;

// --- ALARM LISTENER ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    try {
        console.log("Alarm fired:", alarm.name);
        
        // Alarms are named `${ALARM_NAME_PREFIX}${id}`
        if (!alarm.name || !alarm.name.startsWith(ALARM_NAME_PREFIX)) {
            console.warn('Invalid alarm name format:', alarm.name);
            return;
        }
        const idStr = alarm.name.slice(ALARM_NAME_PREFIX.length);
        const reminders = await getReminders();
        const reminder = reminders.find(r => String(r.id) === idStr);
        
        if (!reminder) {
            console.warn('Reminder not found for alarm:', reminderId);
            return;
        }
        
        await injectTakeover(reminder);
    } catch (error) {
        console.error('Error handling alarm:', error);
    }
});


// --- INJECTION LOGIC ---
async function injectTakeover(reminder) {
    try {
        const [whitelist, allTabs] = await Promise.all([
            getWhitelist(),
            chrome.tabs.query({})
        ]);
        
        // Filter tabs that are valid for injection
        const validTabs = allTabs.filter(tab => {
            try {
                // Skip tabs without valid URLs
                if (!tab.url || typeof tab.url !== 'string') {
                    return false;
                }
                
                const url = new URL(tab.url);
                
                // Only allow injection into http and https pages
                if (!['http:', 'https:'].includes(url.protocol)) {
                    return false;
                }
                
                // Skip system pages and extensions
                if (url.hostname === 'chrome.google.com' || 
                    url.hostname.includes('chromewebstore.google.com') ||
                    url.protocol === 'chrome-extension:') {
                    return false;
                }
                
                // Skip whitelisted sites
                if (whitelist.some(site => url.hostname.includes(site))) {
                    console.log(`Skipping whitelisted tab: ${tab.url}`);
                    return false;
                }
                
                return true;
            } catch (e) {
                // Invalid URL, skip it
                return false;
            }
        });
        
        if (validTabs.length === 0) {
            console.log('📭 No valid tabs found for takeover injection');
            return;
        }
        
        console.log(`🚀 Injecting takeover into ${validTabs.length} valid tabs`);
        
        // Process tabs in batches to avoid overwhelming the system
        const batchSize = 3; // Reduced batch size for better reliability
        let successCount = 0;
        
        for (let i = 0; i < validTabs.length; i += batchSize) {
            const batch = validTabs.slice(i, i + batchSize);
            const results = await Promise.allSettled(batch.map(tab => injectIntoTab(tab, reminder)));
            
            // Count successes (resolved promises)
            successCount += results.filter(result => result.status === 'fulfilled').length;
            
            // Small delay between batches
            if (i + batchSize < validTabs.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`📊 Injection complete: ${successCount}/${validTabs.length} tabs processed successfully`);
        
        // If no tabs were successfully injected, show a fallback notification
        if (successCount === 0 && validTabs.length > 0) {
            console.log('⚠️ No takeover could be displayed - all tabs failed injection. This may be due to CSP restrictions.');
            showFallbackNotification(reminder);
        }
    } catch (error) {
        console.error('Error in injectTakeover:', error);
    }
}

async function injectIntoTab(tab, reminder) {
    try {
        // First, inject the CSS and script
        await Promise.all([
            chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['content/takeover.css']
            }),
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/takeover_injector.js']
            })
        ]);
        
        // Wait a moment for script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try to send the takeover message
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { 
                type: 'SHOW_TAKEOVER', 
                reminder 
            });
            
            if (response?.success) {
                console.log(`✅ Takeover displayed in tab ${tab.id}`);
            } else {
                console.log(`⚠️  Takeover may not have displayed in tab ${tab.id}:`, response?.error || 'Unknown response');
            }
        } catch (messageError) {
            // Content script might not be ready yet, which is okay
            console.log(`📝 Message failed for tab ${tab.id}, but injection succeeded`);
        }
        
    } catch (injectionError) {
        // This is expected for protected pages (chrome://, extension pages, etc.)
        const errorMsg = injectionError.message || String(injectionError);
        
        if (errorMsg.includes('Cannot access') || 
            errorMsg.includes('The extensions API is not available') ||
            errorMsg.includes('Cannot access contents of') ||
            errorMsg.includes('The tab was closed') ||
            errorMsg.includes('Permissions policy')) {
            // These are normal for protected pages - don't log as errors
            console.log(`🚫 Skipped protected/restricted tab ${tab.id}: ${tab.url}`);
        } else {
            console.warn(`❌ Unexpected injection error for tab ${tab.id}:`, errorMsg);
        }
        
        // Don't throw - this allows other tabs to continue processing
    }
}


// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            switch (message.type) {
                case 'TRIGGER_TEST_TAKEOVER':
                    console.log("Received request for test takeover.");
                    const now = new Date();
                    const dueTime = new Date(now.getTime() + TEST_REMINDER_OFFSET);
                    const testReminder = {
                        id: Date.now(),
                        isTest: true,
                        title: 'Test Reminder',
                        note: 'This is a test of the takeover functionality.',
                        date: `${dueTime.getFullYear()}-${String(dueTime.getMonth() + 1).padStart(2, '0')}-${String(dueTime.getDate()).padStart(2, '0')}`,
                        time: `${String(dueTime.getHours()).padStart(2, '0')}:${String(dueTime.getMinutes()).padStart(2, '0')}`,
                        originalDate: `${dueTime.getFullYear()}-${String(dueTime.getMonth() + 1).padStart(2, '0')}-${String(dueTime.getDate()).padStart(2, '0')}`,
                        originalTime: `${String(dueTime.getHours()).padStart(2, '0')}:${String(dueTime.getMinutes()).padStart(2, '0')}`,
                    };
                    await injectTakeover(testReminder);
                    sendResponse({ success: true });
                    break;

                case 'DISMISS_TAKEOVER':
                    console.log("Dismissing reminder:", message.reminderId);
                    if (!message.isTest) {
                        await deleteReminder(message.reminderId);
                        await deleteAlarm(message.reminderId);
                    }
                    await broadcastMessage({ type: 'CLOSE_TAKEOVER' });
                    sendResponse({ success: true });
                    break;

                case 'SNOOZE_TAKEOVER':
                    console.log("Snoozing reminder:", message.reminderId);
                    if (!message.isTest) {
                        await handleSnooze(message.reminder);
                    }
                    await broadcastMessage({ type: 'CLOSE_TAKEOVER' });
                    sendResponse({ success: true });
                    break;

                case 'CONTENT_SCRIPT_READY':
                    // Content script is ready - acknowledge but no action needed
                    sendResponse({ success: true, message: 'Acknowledged' });
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    
    // Return true to indicate async response
    return true;
});


// --- HELPER FUNCTIONS ---
async function broadcastMessage(message) {
    try {
        const allTabs = await chrome.tabs.query({});
        const promises = allTabs.map(tab => {
            return new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, message, (response) => {
                    if (chrome.runtime.lastError) {
                        // Content script not present in tab, which is normal
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });
        });
        
        await Promise.allSettled(promises);
        console.log(`Broadcasted message to ${allTabs.length} tabs`);
    } catch (error) {
        console.error('Error broadcasting message:', error);
    }
}

async function handleSnooze(reminder) {
    try {
        if (!reminder.originalDate || !reminder.originalTime) {
            console.error('Missing originalDate or originalTime for snooze:', reminder);
            return;
        }
        
        const meetingTime = new Date(`${reminder.originalDate}T${reminder.originalTime}`);
        
        if (isNaN(meetingTime.getTime())) {
            console.error('Invalid original date/time for snooze:', reminder);
            return;
        }
        
        const newTime = new Date(meetingTime.getTime() - (SNOOZE_MINUTES_BEFORE * 60000));
        
        // Ensure snooze time is in the future
        if (newTime <= new Date()) {
            console.warn('Snooze time would be in the past, not rescheduling');
            return;
        }
        
        const snoozedReminder = {
            ...reminder,
            date: `${newTime.getFullYear()}-${String(newTime.getMonth() + 1).padStart(2, '0')}-${String(newTime.getDate()).padStart(2, '0')}`,
            time: `${String(newTime.getHours()).padStart(2, '0')}:${String(newTime.getMinutes()).padStart(2, '0')}`,
        };
        
        await Promise.all([
            deleteAlarm(snoozedReminder.id), // Clear old alarm first
            saveReminder(snoozedReminder, snoozedReminder.id)
        ]);
        
        await createAlarm(snoozedReminder);
        
        console.log(`Reminder ${snoozedReminder.id} snoozed to ${snoozedReminder.date} ${snoozedReminder.time}`);
    } catch (error) {
        console.error('Error handling snooze:', error);
    }
}

// --- SERVICE WORKER LIFECYCLE MANAGEMENT ---
// Keep service worker alive longer for better reliability
chrome.runtime.onStartup.addListener(() => {
    console.log('Service worker starting up');
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
});

// Handle service worker waking up
self.addEventListener('activate', () => {
    console.log('Service worker activated');
});

// --- FALLBACK NOTIFICATION ---
function showFallbackNotification(reminder) {
    try {
        if (chrome.notifications) {
            // Use Chrome's notification API as fallback
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Super Reminder Alert',
                message: `🔔 ${reminder.title}\n🕰️ ${reminder.originalTime || reminder.time}${reminder.note ? '\n📝 ' + reminder.note : ''}`
            });
            console.log('🔔 Fallback notification displayed');
        } else {
            console.log('🚫 No notification API available for fallback');
        }
    } catch (error) {
        console.error('Fallback notification failed:', error);
    }
}
