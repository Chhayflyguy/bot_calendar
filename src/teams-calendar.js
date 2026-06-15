/**
 * Microsoft Teams/Outlook Calendar Integration via Graph API.
 *
 * Creates calendar events in the user's Microsoft 365 calendar
 * using the Microsoft Graph REST API.
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/user-post-events
 */

const https = require('https');

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Create a calendar event in the user's Microsoft Teams/Outlook calendar.
 *
 * @param {string} accessToken - Valid Microsoft Graph access token
 * @param {object} event - Parsed event object from parser.js
 * @param {string} timezone - IANA timezone string (default: Asia/Phnom_Penh)
 * @returns {Promise<object>} - Created event data from Graph API
 */
async function createCalendarEvent(accessToken, event, timezone = 'Asia/Phnom_Penh') {
  // Build the Graph API event payload
  const graphEvent = buildGraphEvent(event, timezone);

  // POST to /me/events
  const result = await graphRequest(
    accessToken,
    'POST',
    '/me/events',
    graphEvent
  );

  return {
    id: result.id,
    subject: result.subject,
    webLink: result.webLink,
    start: result.start,
    end: result.end,
    location: result.location?.displayName,
    createdAt: result.createdDateTime,
  };
}

/**
 * Build a Microsoft Graph API event object from our parsed event data.
 *
 * Graph API Event format:
 * https://learn.microsoft.com/en-us/graph/api/resources/event
 */
function buildGraphEvent(event, timezone) {
  // Build start/end datetime strings (without timezone offset — Graph uses timeZone field)
  const startDateTime = buildDateTimeString(event, 'start');
  const endDateTime = buildDateTimeString(event, 'end') || addHoursToString(startDateTime, 2);

  const graphEvent = {
    subject: event.title || 'Untitled Event',
    start: {
      dateTime: startDateTime,
      timeZone: timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone,
    },
    body: {
      contentType: 'HTML',
      content: buildHtmlDescription(event),
    },
    reminderMinutesBeforeStart: 30,
    isReminderOn: true,
  };

  // Add location if available
  if (event.location) {
    graphEvent.location = {
      displayName: event.location,
    };
  }

  // Add organizer contact info to attendees if available
  // (optional — only if the event had contact info)

  return graphEvent;
}

/**
 * Build a datetime string in the format Graph API expects: "2026-06-30T18:00:00"
 */
function buildDateTimeString(event, which) {
  if (!event.year || event.month == null || !event.day) return null;

  const timeParsed = which === 'start' ? event.startParsed : event.endParsed;

  // Default to 9am start, 5pm end if no time specified
  const hours = timeParsed?.hours ?? (which === 'start' ? 9 : 17);
  const minutes = timeParsed?.minutes ?? 0;

  const month = String(event.month + 1).padStart(2, '0');
  const day = String(event.day).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');

  return `${event.year}-${month}-${day}T${h}:${m}:00`;
}

/**
 * Add hours to a datetime string.
 */
function addHoursToString(dateTimeStr, hours) {
  if (!dateTimeStr) return null;
  const date = new Date(dateTimeStr);
  date.setHours(date.getHours() + hours);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${y}-${m}-${d}T${h}:${min}:00`;
}

/**
 * Build an HTML description for the calendar event body.
 */
function buildHtmlDescription(event) {
  const parts = [];

  if (event.tickets) {
    parts.push(`<b>🎟 Tickets:</b> ${escapeHtml(event.tickets)}`);
  }
  if (event.contact?.email) {
    parts.push(`<b>📧 Contact:</b> <a href="mailto:${escapeHtml(event.contact.email)}">${escapeHtml(event.contact.email)}</a>`);
  }
  if (event.contact?.url) {
    parts.push(`<b>🔗 Registration:</b> <a href="${escapeHtml(event.contact.url)}">${escapeHtml(event.contact.url)}</a>`);
  }

  parts.push('');
  parts.push('<hr/>');
  parts.push('<b>Original Message:</b>');
  parts.push(`<pre>${escapeHtml(event.description || '')}</pre>`);

  return parts.join('<br/>');
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Make a request to the Microsoft Graph API.
 *
 * @param {string} accessToken - Bearer token
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} endpoint - API endpoint (e.g., /me/events)
 * @param {object} body - Request body (for POST/PATCH)
 * @returns {Promise<object>} - Parsed JSON response
 */
function graphRequest(accessToken, method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(GRAPH_API_BASE + endpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const errorMsg = parsed.error?.message || `HTTP ${res.statusCode}`;
            const err = new Error(`Graph API error: ${errorMsg}`);
            err.statusCode = res.statusCode;
            err.graphError = parsed.error;
            reject(err);
          }
        } catch (parseErr) {
          reject(new Error(`Failed to parse Graph API response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Get the currently logged-in user's profile from Graph API.
 *
 * @param {string} accessToken
 * @returns {Promise<object>} - { displayName, mail, userPrincipalName }
 */
async function getUserProfile(accessToken) {
  return graphRequest(accessToken, 'GET', '/me?$select=displayName,mail,userPrincipalName');
}

module.exports = {
  createCalendarEvent,
  getUserProfile,
};
