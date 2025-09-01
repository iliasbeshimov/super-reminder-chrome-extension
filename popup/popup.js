import {
    getReminders,
    saveReminder,
    deleteReminder,
    getWhitelist,
    addWhitelistSite,
    deleteWhitelistSite,
} from '../shared/storage.js';

import {
    createAlarm,
    deleteAlarm
} from '../shared/alarms.js';

// --- CONSTANTS ---
const MAX_TITLE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;
const DEBOUNCE_DELAY = 300;

// --- STATE MANAGEMENT ---
let editingReminderId = null;
let remindersCache = null;
let debounceTimeout = null;

// --- DOM ELEMENTS ---
const formTitle = document.getElementById('form-title');
const addReminderBtn = document.getElementById('addReminderBtn');
const devTriggerBtn = document.getElementById('devTriggerBtn');
const remindersList = document.getElementById('remindersList');
const reminderTitleInput = document.getElementById('reminderTitle');
const reminderNoteInput = document.getElementById('reminderNote');
const reminderDateInput = document.getElementById('reminderDate');
const reminderTimeInput = document.getElementById('reminderTime');
const whitelistInput = document.getElementById('whitelistInput');
const addWhitelistBtn = document.getElementById('addWhitelistBtn');
const whitelistEl = document.getElementById('whitelist');

// --- UTILITY FUNCTIONS ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function validateDateTime(date, time) {
    try {
        const dateTime = new Date(`${date}T${time}`);
        const now = new Date();
        
        if (isNaN(dateTime.getTime())) {
            return { valid: false, error: 'Invalid date or time format.' };
        }
        
        if (dateTime <= now) {
            return { valid: false, error: 'Reminder must be set for a future date and time.' };
        }
        
        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Invalid date or time format.' };
    }
}

function showError(message) {
    // Create a simple error display
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'color: #ef4444; background: #fef2f2; padding: 8px 12px; border-radius: 4px; margin: 8px 0; border: 1px solid #fecaca;';
    
    const formSection = document.querySelector('.form-section');
    formSection.appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}

// --- RENDER FUNCTIONS ---
async function renderReminders(forceRefresh = false) {
    try {
        if (!remindersCache || forceRefresh) {
            remindersCache = await getReminders();
        }
        
        remindersList.innerHTML = '';
        
        if (remindersCache.length === 0) {
            remindersList.innerHTML = `<li class="empty-state">No reminders yet.</li>`;
            return;
        }
        
        // Sort reminders by datetime (only once, maintain sorted cache)
        if (forceRefresh) {
            remindersCache.sort((a, b) => {
                const aDateTime = new Date(`${a.date}T${a.time}`);
                const bDateTime = new Date(`${b.date}T${b.time}`);
                return aDateTime - bDateTime;
            });
        }
        
        const fragment = document.createDocumentFragment();
        
        remindersCache.forEach(reminder => {
            try {
                const displayDate = new Date(`${reminder.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
                
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="reminder-info">
                        <span class="title">${escapeHtml(reminder.title)}</span>
                        ${reminder.note ? `<span class="note" title="${escapeHtml(reminder.note)}">${escapeHtml(reminder.note)}</span>` : ''}
                        <span class="time">${displayDate} at ${reminder.time}</span>
                    </div>
                    <div class="reminder-actions">
                        <button data-id="${reminder.id}" class="edit-btn" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                        </button>
                        <button data-id="${reminder.id}" class="delete-btn" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                `;
                fragment.appendChild(li);
            } catch (error) {
                console.error('Error rendering reminder:', reminder, error);
            }
        });
        
        remindersList.appendChild(fragment);
    } catch (error) {
        console.error('Error rendering reminders:', error);
        showError('Failed to load reminders. Please try refreshing.');
    }
}

async function renderWhitelist() {
    try {
        whitelistEl.innerHTML = '';
        const whitelist = await getWhitelist();
        
        const fragment = document.createDocumentFragment();
        whitelist.forEach(site => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${escapeHtml(site)}</span>
                <button data-site="${escapeHtml(site)}" class="delete-whitelist-btn">&times;</button>
            `;
            fragment.appendChild(li);
        });
        
        whitelistEl.appendChild(fragment);
    } catch (error) {
        console.error('Error rendering whitelist:', error);
        showError('Failed to load whitelist. Please try refreshing.');
    }
}

// --- FORM & UI LOGIC ---
function clearForm() {
    editingReminderId = null;
    reminderTitleInput.value = '';
    reminderNoteInput.value = '';
    reminderTimeInput.value = '';
    setInitialDate();
    formTitle.textContent = 'Add New Reminder';
    addReminderBtn.textContent = 'Add Reminder';
    addReminderBtn.classList.remove('is-update');
}

async function populateFormForEdit(id) {
    try {
        // Use cached reminders if available
        const reminders = remindersCache || await getReminders();
        const reminder = reminders.find(r => r.id === id);
        
        if (!reminder) {
            showError('Reminder not found.');
            return;
        }
        
        editingReminderId = id;
        reminderTitleInput.value = reminder.title || '';
        reminderNoteInput.value = reminder.note || '';
        reminderDateInput.value = reminder.date || '';
        reminderTimeInput.value = reminder.time || '';
        
        formTitle.textContent = 'Edit Reminder';
        addReminderBtn.textContent = 'Update Reminder';
        addReminderBtn.classList.add('is-update');
    } catch (error) {
        console.error('Error populating form for edit:', error);
        showError('Failed to load reminder for editing.');
    }
}

function setInitialDate() {
    if (editingReminderId !== null) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    reminderDateInput.value = `${year}-${month}-${day}`;
}

// --- EVENT HANDLERS ---
async function handleFormSubmit() {
    try {
        const title = reminderTitleInput.value.trim();
        const note = reminderNoteInput.value.trim();
        const date = reminderDateInput.value;
        const time = reminderTimeInput.value;
        
        // Clear any existing error messages
        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        
        // Validate required fields
        if (!title || !date || !time) {
            showError('Please provide a title, date, and time.');
            return;
        }
        
        // Validate field lengths
        if (title.length > MAX_TITLE_LENGTH) {
            showError(`Title must be ${MAX_TITLE_LENGTH} characters or less.`);
            return;
        }
        
        if (note.length > MAX_NOTE_LENGTH) {
            showError(`Note must be ${MAX_NOTE_LENGTH} characters or less.`);
            return;
        }
        
        // Validate date and time
        const dateValidation = validateDateTime(date, time);
        if (!dateValidation.valid) {
            showError(dateValidation.error);
            return;
        }
        
        // Disable button to prevent double submission
        addReminderBtn.disabled = true;
        addReminderBtn.textContent = editingReminderId ? 'Updating...' : 'Adding...';
        
        const reminderData = {
            title,
            note,
            date,
            time,
            originalDate: date,
            originalTime: time
        };
        
        const savedReminder = await saveReminder(reminderData, editingReminderId);
        await createAlarm(savedReminder);
        
        // Invalidate cache and re-render
        remindersCache = null;
        await renderReminders(true);
        clearForm();
        
    } catch (error) {
        console.error('Error saving reminder:', error);
        showError('Failed to save reminder. Please try again.');
    } finally {
        // Re-enable button
        addReminderBtn.disabled = false;
        addReminderBtn.textContent = editingReminderId ? 'Update Reminder' : 'Add Reminder';
    }
}

async function handleDeleteReminder(id) {
    try {
        if (!confirm('Are you sure you want to delete this reminder?')) {
            return;
        }
        
        if (id === editingReminderId) {
            clearForm();
        }
        
        await deleteReminder(id);
        await deleteAlarm(id);
        
        // Update cache by removing the deleted reminder
        if (remindersCache) {
            remindersCache = remindersCache.filter(r => r.id !== id);
        }
        
        await renderReminders(true);
    } catch (error) {
        console.error('Error deleting reminder:', error);
        showError('Failed to delete reminder. Please try again.');
    }
}

async function handleAddWhitelist() {
    try {
        const site = whitelistInput.value.trim();
        
        if (!site) {
            showError('Please enter a website.');
            return;
        }
        
        // Basic URL validation
        const urlPattern = /^[a-zA-Z0-9][a-zA-Z0-9-._]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
        if (!urlPattern.test(site)) {
            showError('Please enter a valid website (e.g., example.com).');
            return;
        }
        
        await addWhitelistSite(site);
        await renderWhitelist();
        whitelistInput.value = '';
    } catch (error) {
        console.error('Error adding whitelist site:', error);
        showError('Failed to add website to whitelist. Please try again.');
    }
}

async function handleDeleteWhitelist(site) {
    try {
        await deleteWhitelistSite(site);
        await renderWhitelist();
    } catch (error) {
        console.error('Error deleting whitelist site:', error);
        showError('Failed to remove website from whitelist. Please try again.');
    }
}


// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Promise.all([
            renderReminders(true),
            renderWhitelist()
        ]);
        setInitialDate();
    } catch (error) {
        console.error('Error initializing popup:', error);
        showError('Failed to initialize extension. Please try refreshing.');
    }
});

addReminderBtn.addEventListener('click', handleFormSubmit);

remindersList.addEventListener('click', e => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');

    if (editBtn) {
        const id = parseInt(editBtn.getAttribute('data-id'), 10);
        populateFormForEdit(id);
    } else if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-id'), 10);
        handleDeleteReminder(id);
    }
});

addWhitelistBtn.addEventListener('click', handleAddWhitelist);
whitelistEl.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.delete-whitelist-btn');
    if (deleteBtn) {
        const site = deleteBtn.getAttribute('data-site');
        handleDeleteWhitelist(site);
    }
});

devTriggerBtn.addEventListener('click', () => {
    try {
        chrome.runtime.sendMessage({
            type: 'TRIGGER_TEST_TAKEOVER'
        });
    } catch (error) {
        console.error('Error triggering test takeover:', error);
        showError('Failed to trigger test takeover.');
    }
});

// Add input validation for title and note fields
reminderTitleInput.addEventListener('input', () => {
    if (reminderTitleInput.value.length > MAX_TITLE_LENGTH) {
        reminderTitleInput.value = reminderTitleInput.value.substring(0, MAX_TITLE_LENGTH);
    }
});

reminderNoteInput.addEventListener('input', () => {
    if (reminderNoteInput.value.length > MAX_NOTE_LENGTH) {
        reminderNoteInput.value = reminderNoteInput.value.substring(0, MAX_NOTE_LENGTH);
    }
});

