/**
 * Utility helpers for text cleaning and date/time formatting.
 */

/**
 * Unicode math-bold mapping table.
 * Telegram event posts frequently use 𝗕𝗼𝗹𝗱 characters (U+1D5D4-range)
 * which are actually Unicode Mathematical Sans-Serif Bold letters.
 * We need to convert them back to plain ASCII for reliable parsing.
 */
function normalizeBoldUnicode(text) {
  // Mathematical Sans-Serif Bold Uppercase: U+1D5D4 – U+1D5ED  → A-Z
  // Mathematical Sans-Serif Bold Lowercase: U+1D5EE – U+1D607  → a-z
  // Mathematical Bold Uppercase:            U+1D400 – U+1D419  → A-Z
  // Mathematical Bold Lowercase:            U+1D41A – U+1D433  → a-z
  // Mathematical Sans-Serif Bold Italic UC: U+1D63C – U+1D655  → A-Z
  // Mathematical Sans-Serif Bold Italic LC: U+1D656 – U+1D66F  → a-z

  const ranges = [
    { start: 0x1D5D4, end: 0x1D5ED, base: 'A' },  // Sans-Serif Bold UC
    { start: 0x1D5EE, end: 0x1D607, base: 'a' },  // Sans-Serif Bold LC
    { start: 0x1D400, end: 0x1D419, base: 'A' },  // Bold UC
    { start: 0x1D41A, end: 0x1D433, base: 'a' },  // Bold LC
    { start: 0x1D63C, end: 0x1D655, base: 'A' },  // Sans-Serif Bold Italic UC
    { start: 0x1D656, end: 0x1D66F, base: 'a' },  // Sans-Serif Bold Italic LC
    { start: 0x1D468, end: 0x1D481, base: 'A' },  // Bold Italic UC
    { start: 0x1D482, end: 0x1D49B, base: 'a' },  // Bold Italic LC
  ];

  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    let replaced = false;

    for (const range of ranges) {
      if (code >= range.start && code <= range.end) {
        const offset = code - range.start;
        result += String.fromCharCode(range.base.charCodeAt(0) + offset);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      result += char;
    }
  }

  return result;
}

/**
 * Strip emoji characters from text for cleaner parsing.
 * Keeps the text content but removes emoji symbols.
 */
function stripEmojis(text) {
  return text.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2702}-\u{27B0}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu,
    ''
  ).trim();
}

/**
 * Month name to number mapping.
 */
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3,
  jun: 5, jul: 6, aug: 7, sep: 8, sept: 8,
  oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a month name string to a 0-indexed month number.
 */
function parseMonth(monthStr) {
  const key = monthStr.toLowerCase().trim();
  return MONTHS[key] ?? -1;
}

/**
 * Parse time string like "6:00 PM", "18:00", "5:30PM" into { hours, minutes } (24h).
 */
function parseTime(timeStr) {
  if (!timeStr) return null;

  const cleaned = timeStr.trim().replace(/\s+/g, ' ');

  // Try 12-hour format: "6:00 PM", "5:30PM"
  const match12 = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return { hours, minutes };
  }

  // Try 24-hour format: "18:00"
  const match24 = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    return {
      hours: parseInt(match24[1], 10),
      minutes: parseInt(match24[2], 10),
    };
  }

  return null;
}

/**
 * Format extracted event info into a clean summary string.
 */
function formatEventSummary(event) {
  const lines = [];

  lines.push(`📌 *${event.title}*`);
  lines.push('');

  if (event.date) {
    lines.push(`🗓 *Date:* ${event.date}`);
  }
  if (event.startTime) {
    let timeStr = event.startTime;
    if (event.endTime) timeStr += ` – ${event.endTime}`;
    lines.push(`⏰ *Time:* ${timeStr}`);
  }
  if (event.location) {
    lines.push(`📍 *Location:* ${event.location}`);
  }
  if (event.tickets) {
    lines.push(`🎟 *Tickets:* ${event.tickets}`);
  }

  return lines.join('\n');
}

/**
 * Strip breadcrumb prefixes from event titles (e.g. "Home - Digital - Event Title")
 */
function stripBreadcrumbs(text) {
  if (!text) return '';
  // Match patterns like "Home - Digital - Event Title" or "Home > News > Event Title"
  const breadcrumbPattern = /^(?:\s*[\w\s\(\)]+\s*[-/»>|]\s*){1,3}/;
  const match = text.match(breadcrumbPattern);
  if (match) {
    const cleaned = text.substring(match[0].length).trim();
    if (cleaned.length > 3) {
      return cleaned;
    }
  }
  return text.trim();
}

module.exports = {
  normalizeBoldUnicode,
  stripEmojis,
  parseMonth,
  parseTime,
  formatEventSummary,
  stripBreadcrumbs,
  MONTHS,
};
