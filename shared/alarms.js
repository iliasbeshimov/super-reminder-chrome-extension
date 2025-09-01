// --- CONSTANTS ---
export const ALERT_MINUTES_BEFORE = 10; // Default alert lead time for new reminders
export const MILLISECONDS_PER_MINUTE = 60 * 1000;
export const ALARM_NAME_PREFIX = 'reminder-';

// --- ALARM MANAGEMENT ---
export function createAlarm(reminder, offsetMinutes = 0) {
    try {
        if (!reminder || !reminder.id || !reminder.date || !reminder.time) {
            console.error('Invalid reminder data for alarm creation:', reminder);
            return false;
        }

        const reminderTime = new Date(`${reminder.date}T${reminder.time}`);
        
        if (isNaN(reminderTime.getTime())) {
            console.error('Invalid date/time format for reminder:', reminder);
            return false;
        }

        const triggerTime = reminderTime.getTime() - (offsetMinutes * MILLISECONDS_PER_MINUTE);
        const now = Date.now();

        if (triggerTime <= now) {
            console.log(`Alarm for reminder ${reminder.id} would trigger in the past. Not setting.`);
            // Clean up any existing alarm for this ID
            deleteAlarm(reminder.id);
            return false;
        }

        const alarmName = `${ALARM_NAME_PREFIX}${reminder.id}`;
        
        chrome.alarms.create(alarmName, {
            when: triggerTime,
        });
        
        console.log(`Alarm created for reminder ${reminder.id} at ${new Date(triggerTime).toLocaleString()}`);
        return true;
        
    } catch (error) {
        console.error('Error creating alarm:', error);
        return false;
    }
}

export async function deleteAlarm(reminderId) {
    try {
        if (!reminderId) {
            console.warn('No reminder ID provided for alarm deletion');
            return false;
        }

        const alarmName = `${ALARM_NAME_PREFIX}${reminderId}`;
        const result = await chrome.alarms.clear(alarmName);
        
        if (result) {
            console.log(`Alarm deleted for reminder ${reminderId}`);
        } else {
            console.log(`No alarm found to delete for reminder ${reminderId}`);
        }
        
        return result;
    } catch (error) {
        console.error('Error deleting alarm:', error);
        return false;
    }
}

// --- UTILITY FUNCTIONS ---
export async function getAllAlarms() {
    try {
        const alarms = await chrome.alarms.getAll();
        return alarms.filter(alarm => alarm.name.startsWith(ALARM_NAME_PREFIX));
    } catch (error) {
        console.error('Error getting all alarms:', error);
        return [];
    }
}

export async function clearAllReminders() {
    try {
        const reminderAlarms = await getAllAlarms();
        const deletePromises = reminderAlarms.map(alarm => {
            const reminderId = alarm.name.replace(ALARM_NAME_PREFIX, '');
            return deleteAlarm(reminderId);
        });
        
        await Promise.all(deletePromises);
        console.log(`Cleared ${reminderAlarms.length} reminder alarms`);
        return true;
    } catch (error) {
        console.error('Error clearing all reminder alarms:', error);
        return false;
    }
}

