import { getReminders, getWhitelist, saveReminder, deleteReminder } from '../shared/storage.js';
import { createAlarm, deleteAlarm } from '../shared/alarms.js';

// --- CONSTANTS ---
const SCRIPT_INJECTION_TIMEOUT = 1000; // Wait 1 second before sending message
const TEST_REMINDER_OFFSET = 0; // Trigger test immediately instead of 10 mins
const SNOOZE_MINUTES_BEFORE = 2;
const MAX_INJECTION_RETRIES = 3;
const RETRY_DELAY = 500;

// --- ALARM LISTENER ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    try {
        console.log("Alarm fired:", alarm.name);
        
        // Alarms are named `reminder-${id}`
        if (!alarm.name || !alarm.name.startsWith('reminder-')) {
            console.warn('Invalid alarm name format:', alarm.name);
            return;
        }
        
        const reminderId = parseInt(alarm.name.split('-')[1]);
        if (isNaN(reminderId)) {
            console.warn('Invalid reminder ID from alarm:', alarm.name);
            return;
        }
        
        const reminders = await getReminders();
        const reminder = reminders.find(r => r.id === reminderId);
        
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
                const url = new URL(tab.url);
                
                // Only allow injection into http and https pages for security
                if (!['http:', 'https:'].includes(url.protocol)) {
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
                console.log(`Skipping invalid URL: ${tab.url}`);
                return false;
            }
        });
        
        console.log(`Injecting takeover into ${validTabs.length} valid tabs`);
        
        // Process tabs in batches to avoid overwhelming the system
        const batchSize = 5;
        for (let i = 0; i < validTabs.length; i += batchSize) {
            const batch = validTabs.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(tab => injectIntoTab(tab, reminder)));
        }
    } catch (error) {
        console.error('Error in injectTakeover:', error);
    }
}

async function injectIntoTab(tab, reminder, retryCount = 0) {
    try {
        // First inject CSS and script
        await Promise.all([
            chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['content/takeover.css'],
            }),
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/takeover_injector.js'],
            })
        ]);
        
        // Wait for script to initialize before sending message
        await new Promise(resolve => setTimeout(resolve, SCRIPT_INJECTION_TIMEOUT));
        
        // Send the reminder data to the injected script
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TAKEOVER', reminder });
        
        console.log(`Successfully injected takeover into tab ${tab.id}`);
    } catch (error) {
        console.error(`Failed to inject into tab ${tab.id}:`, error);
        
        // Retry injection for certain errors
        if (retryCount < MAX_INJECTION_RETRIES && 
            (error.message?.includes('receiving end does not exist') || 
             error.message?.includes('tab was closed'))) {
            
            console.log(`Retrying injection into tab ${tab.id} (attempt ${retryCount + 1})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
            return injectIntoTab(tab, reminder, retryCount + 1);
        }
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

