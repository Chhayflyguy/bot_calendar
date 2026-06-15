/**
 * Calendar file generator — creates .ics files from parsed event data.
 *
 * Uses the ical-generator library to produce standards-compliant iCalendar
 * files that can be opened in Microsoft Teams, Outlook, Google Calendar, etc.
 */

const ical = require('ical-generator');

/**
 * Generate an .ics calendar file buffer from parsed event data.
 *
 * @param {object} event - Parsed event object from parser.js
 * @param {string} timezone - IANA timezone string (default: Asia/Phnom_Penh)
 * @returns {Buffer} - .ics file content as a buffer
 */
function generateICS(event, timezone = 'Asia/Phnom_Penh') {
  // Build start and end Date objects
  const startDate = buildDate(event, 'start', timezone);
  const endDate = buildDate(event, 'end', timezone) || addHours(startDate, 2); // Default 2h duration

  // Create the calendar
  const calendar = ical.default({
    name: 'Telegram Event',
    timezone,
    prodId: { company: 'TelegramEventBot', product: 'event-bot' },
  });

  // Add the event
  const calEvent = calendar.createEvent({
    start: startDate,
    end: endDate,
    timezone,
    summary: event.title || 'Untitled Event',
    location: event.location || '',
    description: buildDescription(event),
    url: event.contact?.url || undefined,
    organizer: event.contact?.email
      ? { name: 'Event Organizer', email: event.contact.email }
      : undefined,
  });

  // Set an alarm/reminder 30 minutes before
  calEvent.createAlarm({
    type: 'display',
    trigger: 30 * 60, // 30 minutes in seconds
    description: `Reminder: ${event.title}`,
  });

  return Buffer.from(calendar.toString(), 'utf-8');
}

/**
 * Build a Date object from event data.
 *
 * @param {object} event - Parsed event
 * @param {'start'|'end'} which - Which time to build
 * @param {string} timezone - Timezone string
 * @returns {Date|null}
 */
function buildDate(event, which, timezone) {
  if (!event.year || event.month == null || !event.day) return null;

  const timeParsed = which === 'start' ? event.startParsed : event.endParsed;

  const hours = timeParsed?.hours ?? (which === 'start' ? 9 : 17); // Default 9am-5pm
  const minutes = timeParsed?.minutes ?? 0;

  // Create date string in ISO format and let the calendar library handle timezone
  // We construct the date directly with the local time components
  const dateStr = `${event.year}-${String(event.month + 1).padStart(2, '0')}-${String(event.day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

  // For Asia/Phnom_Penh (UTC+7), we need to adjust
  // ical-generator handles timezone properly when we pass timezone parameter
  // We create the date as if it's in the target timezone
  const offsetHours = getTimezoneOffset(timezone);
  const utcDate = new Date(dateStr + 'Z');
  // Adjust back from local to UTC by subtracting the offset
  utcDate.setHours(utcDate.getHours() - offsetHours);

  return utcDate;
}

/**
 * Get a simplified timezone offset in hours.
 * For production, you'd use a full tz database. This covers common cases.
 */
function getTimezoneOffset(timezone) {
  const offsets = {
    'Asia/Phnom_Penh': 7,
    'Asia/Bangkok': 7,
    'Asia/Ho_Chi_Minh': 7,
    'Asia/Singapore': 8,
    'Asia/Hong_Kong': 8,
    'Asia/Shanghai': 8,
    'Asia/Tokyo': 9,
    'Asia/Seoul': 9,
    'Asia/Kolkata': 5.5,
    'America/New_York': -5,
    'America/Los_Angeles': -8,
    'Europe/London': 0,
    'Europe/Paris': 1,
    'UTC': 0,
  };
  return offsets[timezone] ?? 7; // Default to UTC+7
}

/**
 * Add hours to a date.
 */
function addHours(date, hours) {
  if (!date) return null;
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Build a description string for the calendar event.
 */
function buildDescription(event) {
  const parts = [];

  if (event.tickets) {
    parts.push(`Tickets: ${event.tickets}`);
  }
  if (event.contact?.email) {
    parts.push(`Contact: ${event.contact.email}`);
  }
  if (event.contact?.url) {
    parts.push(`Registration: ${event.contact.url}`);
  }

  parts.push('');
  parts.push('--- Original Message ---');
  parts.push(event.description || '');

  return parts.join('\n');
}

/**
 * Generate a filename for the .ics file based on the event title.
 */
function generateFilename(event) {
  const slug = (event.title || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);

  return `${slug}.ics`;
}

module.exports = { generateICS, generateFilename };
