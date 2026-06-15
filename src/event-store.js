/**
 * Event Store — Simple JSON-file-based event storage.
 *
 * Shared between the Telegram bot and the Calendar web UI server.
 * Events are persisted to data/events.json so they survive restarts.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

// Color palette — assigned round-robin to new events
const COLORS = ['blue', 'green', 'amber', 'rose', 'purple', 'teal'];

/**
 * Ensure the data directory and events file exist.
 */
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(EVENTS_FILE)) {
    fs.writeFileSync(EVENTS_FILE, '[]', 'utf-8');
  }
}

/**
 * Read all events from the store.
 * @returns {Array} Array of event objects
 */
function getAllEvents() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save an event to the store.
 * Converts a parsed event (from parser.js) into the format the calendar UI expects.
 *
 * @param {object} parsedEvent - Event object from parser.js
 * @returns {object} The saved event with its assigned id and color
 */
function saveEvent(parsedEvent) {
  const events = getAllEvents();

  // Generate a unique id
  const maxId = events.reduce((max, e) => Math.max(max, e.id || 0), 0);
  const id = maxId + 1;

  // Build ISO date string (YYYY-MM-DD)
  let dateStr = null;
  if (parsedEvent.year && parsedEvent.month != null && parsedEvent.day) {
    const m = String(parsedEvent.month + 1).padStart(2, '0');
    const d = String(parsedEvent.day).padStart(2, '0');
    dateStr = `${parsedEvent.year}-${m}-${d}`;
  }

  // Parse start/end hours for week view positioning
  const startHour = parsedEvent.startParsed
    ? parsedEvent.startParsed.hours + parsedEvent.startParsed.minutes / 60
    : 9;
  const endHour = parsedEvent.endParsed
    ? parsedEvent.endParsed.hours + parsedEvent.endParsed.minutes / 60
    : startHour + 2;

  // Assign a color
  const color = COLORS[id % COLORS.length];

  const event = {
    id,
    title: parsedEvent.title || 'Untitled Event',
    date: dateStr,
    startTime: parsedEvent.startTime || null,
    endTime: parsedEvent.endTime || null,
    startHour,
    endHour,
    location: parsedEvent.location || null,
    tickets: parsedEvent.tickets || null,
    color,
    description: parsedEvent.description || '',
    addedAt: new Date().toISOString(),
  };

  events.push(event);
  ensureDataFile();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf-8');

  return event;
}

/**
 * Delete an event by id.
 * @param {number} id
 * @returns {boolean} true if deleted
 */
function deleteEvent(id) {
  const events = getAllEvents();
  const filtered = events.filter(e => e.id !== id);
  if (filtered.length === events.length) return false;
  ensureDataFile();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

/**
 * Update the RSVP status of an event.
 * @param {number} id
 * @param {string|null} status - 'going', 'not_going', or null
 * @returns {object|null} The updated event object, or null if not found
 */
function updateEventRsvp(id, status) {
  const events = getAllEvents();
  const event = events.find(e => e.id === id);
  if (!event) return null;

  event.rsvpStatus = status;
  ensureDataFile();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf-8');
  return event;
}

module.exports = { getAllEvents, saveEvent, deleteEvent, updateEventRsvp };
