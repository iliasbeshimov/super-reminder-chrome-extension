// --- CONSTANTS ---
const STORAGE_KEYS = {
    REMINDERS: 'reminders',
    WHITELIST: 'whitelist'
};

const MAX_REMINDERS = 100; // Prevent storage bloat
const MAX_WHITELIST_SITES = 50;

// Default whitelist to provide a good out-of-the-box experience
const DEFAULT_WHITELIST = [
    'meet.google.com',
    'zoom.us',
    'slack.com',
    'teams.microsoft.com',
    'goodtime.io',
    'webex.com',
    'discord.com',
    'web.skype.com',
    'gotomeeting.com',
    'bluejeans.com',
    'whereby.com',
    'ringcentral.com',
    'hackerrank.com',
    'coderpad.io',
    'hirevue.com',
    'karat.com',
    'miro.com',
    'mural.co',
    'figma.com',
    'notion.so',
    'airtable.com',
];

// Simple in-memory cache to reduce storage calls
let reminderCache = null;
let whitelistCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// --- CACHE MANAGEMENT ---
function isCacheValid() {
    return Date.now() - cacheTimestamp < CACHE_DURATION;
}

function invalidateCache() {
    reminderCache = null;
    whitelistCache = null;
    cacheTimestamp = 0;
}

function updateCacheTimestamp() {
    cacheTimestamp = Date.now();
}

// --- REMINDER FUNCTIONS ---
export async function getReminders() {
    try {
        if (reminderCache && isCacheValid()) {
            return reminderCache;
        }

        const result = await chrome.storage.sync.get(STORAGE_KEYS.REMINDERS);
        reminderCache = result[STORAGE_KEYS.REMINDERS] || [];
        updateCacheTimestamp();
        
        // Clean up expired reminders
        const now = new Date();
        const activeReminders = reminderCache.filter(reminder => {
            try {
                const reminderTime = new Date(`${reminder.date}T${reminder.time}`);
                return reminderTime > now;
            } catch {
                return false; // Remove invalid reminders
            }
        });
        
        if (activeReminders.length !== reminderCache.length) {
            console.log(`Cleaned up ${reminderCache.length - activeReminders.length} expired reminders`);
            reminderCache = activeReminders;
            await chrome.storage.sync.set({ [STORAGE_KEYS.REMINDERS]: reminderCache });
        }
        
        return reminderCache;
    } catch (error) {
        console.error('Error getting reminders:', error);
        return [];
    }
}

export async function saveReminder(reminderData, id = null) {
    try {
        if (!reminderData || typeof reminderData !== 'object') {
            throw new Error('Invalid reminder data');
        }

        const reminders = await getReminders();
        
        if (id !== null) {
            // Update existing reminder
            const index = reminders.findIndex(r => r.id === id);
            if (index === -1) {
                throw new Error(`Reminder with ID ${id} not found`);
            }
            reminders[index] = { ...reminders[index], ...reminderData, id };
            reminderCache = reminders; // Update cache
        } else {
            // Add new reminder
            if (reminders.length >= MAX_REMINDERS) {
                throw new Error(`Cannot create more than ${MAX_REMINDERS} reminders`);
            }
            
            const newId = Date.now() + Math.random(); // More unique ID
            const newReminder = { ...reminderData, id: newId };
            reminders.push(newReminder);
            reminderCache = reminders; // Update cache
        }
        
        await chrome.storage.sync.set({ [STORAGE_KEYS.REMINDERS]: reminders });
        updateCacheTimestamp();
        
        // Return the saved reminder
        // Return the saved reminder
        // When creating a new reminder, it's always the last one in the array.
        const savedReminder = id !== null ? reminders.find(r => r.id === id) : reminders[reminders.length - 1];
        return savedReminder;
    } catch (error) {
        console.error('Error saving reminder:', error);
        throw error;
    }
}

export async function deleteReminder(id) {
    try {
        if (!id) {
            throw new Error('No reminder ID provided');
        }

        let reminders = await getReminders();
        const originalLength = reminders.length;
        reminders = reminders.filter(r => r.id !== id);
        
        if (reminders.length === originalLength) {
            console.warn(`Reminder with ID ${id} not found for deletion`);
            return false;
        }
        
        reminderCache = reminders; // Update cache
        await chrome.storage.sync.set({ [STORAGE_KEYS.REMINDERS]: reminders });
        updateCacheTimestamp();
        
        console.log(`Reminder ${id} deleted successfully`);
        return true;
    } catch (error) {
        console.error('Error deleting reminder:', error);
        throw error;
    }
}

export async function deleteAllReminders() {
    try {
        reminderCache = [];
        await chrome.storage.sync.set({ [STORAGE_KEYS.REMINDERS]: [] });
        updateCacheTimestamp();
        return true;
    } catch (error) {
        console.error('Error deleting all reminders:', error);
        throw error;
    }
}


// --- WHITELIST FUNCTIONS ---
export async function getWhitelist() {
    try {
        if (whitelistCache && isCacheValid()) {
            return whitelistCache;
        }

        const result = await chrome.storage.sync.get(STORAGE_KEYS.WHITELIST);
        
        if (result[STORAGE_KEYS.WHITELIST] === undefined) {
            // Initialize with default values
            whitelistCache = [...DEFAULT_WHITELIST];
            await chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelistCache });
        } else {
            whitelistCache = result[STORAGE_KEYS.WHITELIST];
        }
        
        updateCacheTimestamp();
        return whitelistCache;
    } catch (error) {
        console.error('Error getting whitelist:', error);
        return DEFAULT_WHITELIST;
    }
}

export async function addWhitelistSite(site) {
    try {
        if (!site || typeof site !== 'string') {
            throw new Error('Invalid site provided');
        }

        const whitelist = await getWhitelist();
        
        if (whitelist.length >= MAX_WHITELIST_SITES) {
            throw new Error(`Cannot add more than ${MAX_WHITELIST_SITES} whitelisted sites`);
        }
        
        const cleanSite = site.toLowerCase()
            .replace(/^(https?:\/\/)?(www\.)?/, '')
            .split('/')[0]
            .trim();
        
        if (!cleanSite) {
            throw new Error('Invalid site format');
        }
        
        if (!whitelist.includes(cleanSite)) {
            whitelist.push(cleanSite);
            whitelistCache = whitelist; // Update cache
            await chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
            updateCacheTimestamp();
            console.log(`Added ${cleanSite} to whitelist`);
            return true;
        }
        
        return false; // Site already exists
    } catch (error) {
        console.error('Error adding whitelist site:', error);
        throw error;
    }
}

export async function deleteWhitelistSite(site) {
    try {
        if (!site) {
            throw new Error('No site provided for deletion');
        }

        let whitelist = await getWhitelist();
        const originalLength = whitelist.length;
        whitelist = whitelist.filter(s => s !== site);
        
        if (whitelist.length === originalLength) {
            console.warn(`Site ${site} not found in whitelist`);
            return false;
        }
        
        whitelistCache = whitelist; // Update cache
        await chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
        updateCacheTimestamp();
        
        console.log(`Removed ${site} from whitelist`);
        return true;
    } catch (error) {
        console.error('Error deleting whitelist site:', error);
        throw error;
    }
}

// --- UTILITY FUNCTIONS ---
export function clearCache() {
    invalidateCache();
    console.log('Storage cache cleared');
}

export async function getStorageUsage() {
    try {
        const usage = await chrome.storage.sync.getBytesInUse();
        const quota = chrome.storage.sync.QUOTA_BYTES;
        return {
            used: usage,
            total: quota,
            percentage: Math.round((usage / quota) * 100)
        };
    } catch (error) {
        console.error('Error getting storage usage:', error);
        return { used: 0, total: 0, percentage: 0 };
    }
}

