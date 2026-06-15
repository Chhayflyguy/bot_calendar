/**
 * Event parser — extracts structured event information from Telegram message text.
 *
 * Handles common patterns found in Telegram event posts:
 * - Unicode bold/italic styled titles (𝗕𝗼𝗹𝗱, 𝘐𝘵𝘢𝘭𝘪𝘤)
 * - Emoji-prefixed fields (🗓 Date:, 📍 Venue:, ⏰ Time:, 🎟 Tickets:)
 * - Various date formats (Month DD, YYYY / DD Month YYYY / DD/MM/YYYY)
 * - 12h and 24h time formats with ranges
 */

const { normalizeBoldUnicode, stripEmojis, parseMonth, parseTime, stripBreadcrumbs } = require('./utils');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Extract the event title from the message text.
 * Strategy: look for the first "bold styled" line or first substantial text line.
 */
function extractTitle(text, normalizedText) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Strategy 1: Find a line that contains Unicode bold characters (math bold range)
  for (const line of lines.slice(0, 5)) {
    // Check if the line has Unicode mathematical bold characters
    if (/[\u{1D400}-\u{1D7FF}]/u.test(line)) {
      // Normalize and clean it
      let title = normalizeBoldUnicode(line);
      title = stripEmojis(title).trim();
      // Remove leading/trailing formatting artifacts (keep ! and ? as they're valid title chars)
      title = title.replace(/^[\s*_~`]+|[\s*_~`]+$/g, '').trim();
      if (title.length > 3) return title;
    }
  }

  // Strategy 2: Look for Telegram markdown bold (**text** or *text*)
  const boldMatch = text.match(/\*\*(.+?)\*\*|\*(.+?)\*/);
  if (boldMatch) {
    const title = (boldMatch[1] || boldMatch[2]).trim();
    if (title.length > 3) return stripEmojis(title).trim();
  }

  // Strategy 3: Use the first non-empty, non-field line from normalized text
  const normalizedLines = normalizedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of normalizedLines.slice(0, 3)) {
    const cleaned = stripEmojis(line).trim();
    // Skip lines that look like field labels
    if (/^(date|venue|time|tickets?|location|register|contact|rsvp|join|connect)/i.test(cleaned)) continue;
    if (cleaned.length > 5) return cleaned;
  }

  return 'Untitled Event';
}

/**
 * Extract date information from the text.
 * Returns { year, month (0-indexed), day, dateStr (human-readable) }
 */
function extractDate(text) {
  // Pattern 1: "Month DD, YYYY" or "Month DD YYYY" (with optional day-of-week prefix)
  //   e.g., "Tuesday, June 30, 2026" or "June 30, 2026"
  const pattern1 = /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*)?(\w+)\s+(\d{1,2})\s*,?\s*(\d{4})/i;
  const m1 = text.match(pattern1);
  if (m1) {
    const month = parseMonth(m1[1]);
    if (month >= 0) {
      const day = parseInt(m1[2], 10);
      const year = parseInt(m1[3], 10);
      return {
        year, month, day,
        dateStr: `${m1[1]} ${day}, ${year}`,
      };
    }
  }

  // Pattern 2: "DD Month YYYY"
  //   e.g., "30 June 2026"
  const pattern2 = /(\d{1,2})\s+(\w+)\s+(\d{4})/i;
  const m2 = text.match(pattern2);
  if (m2) {
    const month = parseMonth(m2[2]);
    if (month >= 0) {
      const day = parseInt(m2[1], 10);
      const year = parseInt(m2[3], 10);
      return {
        year, month, day,
        dateStr: `${day} ${m2[2]} ${year}`,
      };
    }
  }

  // Pattern 3: "DD/MM/YYYY" or "DD-MM-YYYY"
  const pattern3 = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
  const m3 = text.match(pattern3);
  if (m3) {
    const day = parseInt(m3[1], 10);
    const month = parseInt(m3[2], 10) - 1; // Convert to 0-indexed
    const year = parseInt(m3[3], 10);
    return {
      year, month, day,
      dateStr: `${m3[1]}/${m3[2]}/${m3[3]}`,
    };
  }

  // Pattern 4: "Month DD" (without year, e.g., "June 16")
  const pattern4 = /(?:on\s+)?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const m4 = text.match(pattern4);
  if (m4) {
    const month = parseMonth(m4[1]);
    if (month >= 0) {
      const day = parseInt(m4[2], 10);
      const year = new Date().getFullYear();
      return {
        year, month, day,
        dateStr: `${m4[1]} ${day}, ${year}`,
      };
    }
  }

  // Pattern 5: "DD Month" (without year, e.g., "16 June")
  const pattern5 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
  const m5 = text.match(pattern5);
  if (m5) {
    const month = parseMonth(m5[2]);
    if (month >= 0) {
      const day = parseInt(m5[1], 10);
      const year = new Date().getFullYear();
      return {
        year, month, day,
        dateStr: `${day} ${m5[2]} ${year}`,
      };
    }
  }

  // Pattern 6: "DD/MM" (without year, e.g., "16/06")
  const pattern6 = /\b(\d{1,2})[\/\-](\d{1,2})\b/;
  const m6 = text.match(pattern6);
  if (m6) {
    const day = parseInt(m6[1], 10);
    const monthVal = parseInt(m6[2], 10);
    if (monthVal >= 1 && monthVal <= 12 && day >= 1 && day <= 31) {
      const month = monthVal - 1;
      const year = new Date().getFullYear();
      return {
        year, month, day,
        dateStr: `${m6[1]}/${m6[2]}/${year}`,
      };
    }
  }

  return null;
}

/**
 * Extract time range from the text.
 * Returns { startTime: "6:00 PM", endTime: "8:30 PM", start: {hours,minutes}, end: {hours,minutes} }
 */
function extractTime(text) {
  // Look for time range: "6:00 PM – 8:30 PM" or "6:00PM - 8:30PM" or "18:00 - 20:30"
  const rangePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–—~to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i;
  const rangeMatch = text.match(rangePattern);

  if (rangeMatch) {
    const startParsed = parseTime(rangeMatch[1]);
    const endParsed = parseTime(rangeMatch[2]);

    return {
      startTime: rangeMatch[1].trim(),
      endTime: rangeMatch[2].trim(),
      start: startParsed,
      end: endParsed,
    };
  }

  // Look for single time mention near "Time:" or "⏰"
  const singlePattern = /(?:Time|⏰)\s*:?\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i;
  const singleMatch = text.match(singlePattern);

  if (singleMatch) {
    const parsed = parseTime(singleMatch[1]);
    return {
      startTime: singleMatch[1].trim(),
      endTime: null,
      start: parsed,
      end: null,
    };
  }

  return null;
}

/**
 * Extract venue/location from the text.
 */
function extractLocation(text) {
  // Pattern: "Venue: ...", "📍 Venue: ...", "📍 ...", "Location: ..."
  const patterns = [
    /(?:📍\s*)?(?:Venue|Location)\s*:\s*(.+)/i,
    /📍\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let location = match[1].trim();
      // Clean up — remove trailing emoji lines or field breaks
      location = location.split('\n')[0].trim();
      // Remove trailing emojis
      location = stripEmojis(location).trim();
      return location;
    }
  }

  return null;
}

/**
 * Extract ticket/pricing information from the text.
 */
function extractTickets(text) {
  const patterns = [
    /(?:🎟\s*)?(?:Tickets?|Price|Fee|Cost|Registration)\s*:\s*(.+)/i,
    /🎟\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let tickets = match[1].trim();
      tickets = tickets.split('\n')[0].trim();
      tickets = stripEmojis(tickets).trim();
      return tickets;
    }
  }

  return null;
}

/**
 * Extract contact/RSVP information from the text.
 */
function extractContact(text) {
  // Look for email addresses
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : null;

  // Look for registration/RSVP URLs
  const urlMatch = text.match(/(?:register|rsvp|sign\s*up|book)[:\s]*(?:at\s+)?(https?:\/\/\S+)/i);
  const url = urlMatch ? urlMatch[1] : null;

  if (email || url) {
    return { email, url };
  }
  return null;
}

/**
 * Main parsing function — takes raw message text and returns structured event data.
 *
 * @param {string} rawText - The raw Telegram message text
 * @returns {object|null} - Parsed event object, or null if no event detected
 */
/**
 * Parse single-line inline events (e.g. "Title in Phnom Penh on June 16 at Aquation Theater")
 */
function parseInlineEvent(text) {
  // Pattern A: Title in [City] on [Date] at [Venue]
  const inlinePatternA = /^(.*?)\s+in\s+([^,.\n]+?)\s+on\s+\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*,\s*\d{4})?)\b\s+at\s+(.+)$/i;

  // Pattern B: Title on [Date] at [Venue]
  const inlinePatternB = /^(.*?)\s+on\s+\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*,\s*\d{4})?)\b\s+at\s+(.+)$/i;

  // Pattern C: Title at [Venue] on [Date]
  const inlinePatternC = /^(.*?)\s+at\s+([^,.\n]+?)\s+on\s+\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*,\s*\d{4})?)\b$/i;

  let match = text.match(inlinePatternA);
  if (match) {
    const title = match[1].trim();
    const city = match[2].trim();
    const dateStr = match[3].trim();
    const venue = match[4].trim();
    return {
      title,
      location: `${venue}, ${city}`,
      rawDate: dateStr
    };
  }

  match = text.match(inlinePatternB);
  if (match) {
    const title = match[1].trim();
    const dateStr = match[2].trim();
    const venue = match[3].trim();
    return {
      title,
      location: venue,
      rawDate: dateStr
    };
  }

  match = text.match(inlinePatternC);
  if (match) {
    const title = match[1].trim();
    const venue = match[2].trim();
    const dateStr = match[3].trim();
    return {
      title,
      location: venue,
      rawDate: dateStr
    };
  }

  return null;
}

/**
 * Main parsing function — takes raw message text and returns structured event data.
 *
 * @param {string} rawText - The raw Telegram message text
 * @returns {object|null} - Parsed event object, or null if no event detected
 */
function parseEvent(rawText) {
  if (!rawText || rawText.trim().length < 20) return null;

  // Strip breadcrumbs
  const cleanText = stripBreadcrumbs(rawText);

  // Normalize unicode bold/italic text for reliable regex matching
  const normalizedText = normalizeBoldUnicode(cleanText);

  // Try parsing as inline event first
  const inlineResult = parseInlineEvent(normalizedText);

  let title, date, location;
  if (inlineResult) {
    title = inlineResult.title;
    location = inlineResult.location;
    date = extractDate(inlineResult.rawDate);
  } else {
    title = extractTitle(cleanText, normalizedText);
    date = extractDate(normalizedText);
    location = extractLocation(normalizedText);
  }

  const time = extractTime(normalizedText);
  const tickets = extractTickets(normalizedText);
  const contact = extractContact(normalizedText);

  // Require at least a date OR time to consider this an event message
  if (!date && !time) {
    return null;
  }

  const event = {
    title,
    date: date ? date.dateStr : null,
    year: date ? date.year : null,
    month: date ? date.month : null,
    day: date ? date.day : null,
    startTime: time ? time.startTime : null,
    endTime: time ? time.endTime : null,
    startParsed: time ? time.start : null,
    endParsed: time ? time.end : null,
    location: location || null,
    tickets: tickets || null,
    contact: contact || null,
    description: rawText,
  };

  return event;
}

/**
 * Call Gemini API to extract event details from text or image.
 */
async function parseEventWithGemini(text, imageBuffer = null, mimeType = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const responseSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      date: { type: "string", description: "Event date in YYYY-MM-DD format. Default the year to 2026 if not specified." },
      startTime: { type: "string" },
      endTime: { type: "string" },
      location: { type: "string" },
      tickets: { type: "string" },
      contact: {
        type: "object",
        properties: {
          email: { type: "string" },
          url: { type: "string" }
        }
      }
    },
    required: ["title"]
  };   

  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
  });

  const currentTimeStr = new Date().toISOString();
  let prompt = `Extract all details for the event. The current date/time is: ${currentTimeStr} (timezone: Asia/Phnom_Penh). Make sure to extract the event title, date (default year to 2026 if not specified or implied), times, and venue.`;

  const parts = [];
  if (text) {
    prompt += `\n\nText content:\n${text}`;
  }
  parts.push(prompt);

  if (imageBuffer && mimeType) {
    parts.push({
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType
      }
    });
  }

  const result = await model.generateContent(parts);
  const jsonText = result.response.text();
  const eventData = JSON.parse(jsonText);

  let year = null;
  let month = null;
  let day = null;
  let dateStr = eventData.date || null;

  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const dateParts = dateStr.split('-');
    year = parseInt(dateParts[0], 10);
    month = parseInt(dateParts[1], 10) - 1; // Convert to 0-indexed JS month
    day = parseInt(dateParts[2], 10);

    try {
      const dateObj = new Date(year, month, day);
      dateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      // Keep original string if date conversion fails
    }
  }

  // Map and clean up times to include startParsed and endParsed
  const startParsed = parseTime(eventData.startTime);
  const endParsed = parseTime(eventData.endTime);

  return {
    title: eventData.title || 'Untitled Event',
    date: dateStr,
    year,
    month,
    day,
    startTime: eventData.startTime || null,
    endTime: eventData.endTime || null,
    startParsed,
    endParsed,
    location: eventData.location || null,
    tickets: eventData.tickets || null,
    contact: eventData.contact || null,
    description: text || 'Extracted from flyer image',
  };
}

module.exports = { parseEvent, parseEventWithGemini };
