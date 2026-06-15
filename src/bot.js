/**
 * Telegram Event Bot — Main entry point.
 *
 * This bot listens for messages (including forwarded ones), parses event info,
 * and either creates events directly in Microsoft Teams/Outlook calendar via
 * Graph API, or sends a downloadable .ics calendar file.
 *
 * Usage:
 *   1. Copy .env.example to .env and add your bot token + Microsoft Client ID
 *   2. npm install
 *   3. npm start
 *   4. Send /login to authenticate with Microsoft
 *   5. Forward an event message to the bot on Telegram
 *
 * Commands:
 *   /start  — Welcome message
 *   /help   — Help and usage info
 *   /login  — Sign in with Microsoft account (for Teams calendar)
 *   /logout — Sign out and clear saved tokens
 *   /status — Check login status
 */

require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { parseEvent, parseEventWithGemini } = require('./parser');
const { generateICS, generateFilename } = require('./calendar');
const { formatEventSummary } = require('./utils');
const { saveEvent } = require('./event-store');
const {
  startDeviceCodeAuth,
  getAccessToken,
  getLoggedInUser,
  isMicrosoftConfigured,
  isLoggedIn,
  logout,
} = require('./microsoft-auth');
const { createCalendarEvent, getUserProfile } = require('./teams-calendar');

// ─── Configuration ───────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Phnom_Penh';

if (!BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here') {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set.');
  console.error('   1. Copy .env.example to .env');
  console.error('   2. Get a token from @BotFather on Telegram');
  console.error('   3. Paste it in .env');
  process.exit(1);
}

// ─── Bot Setup ───────────────────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);

// Store pending events for confirmation (userId → event)
const pendingEvents = new Map();

// Track ongoing login flows to prevent duplicates
const loginInProgress = new Set();

// ─── /start Command ──────────────────────────────────────────────────────────

bot.start((ctx) => {
  const msConfigured = isMicrosoftConfigured();

  let loginInfo = '';
  if (msConfigured) {
    loginInfo =
      `\n\n🔐 *Microsoft Teams Calendar:*\n` +
      `Use /login to connect your Microsoft account and add events directly to your Teams calendar.`;
  }

  ctx.reply(
    `👋 *Welcome to Event Calendar Bot!*\n\n` +
    `I can extract event details from Telegram messages and create calendar events.\n\n` +
    `*How to use:*\n` +
    `1️⃣ Forward an event message to me, or paste the event text\n` +
    `2️⃣ I'll extract the event details (title, date, time, location)\n` +
    `3️⃣ Choose to add to Teams Calendar or download a .ics file\n` +
    `4️⃣ Done! The event is in your calendar 🎉` +
    loginInfo + `\n\n` +
    `Try it now — forward me an event post!`,
    { parse_mode: 'Markdown' }
  );
});

// ─── /help Command ───────────────────────────────────────────────────────────

bot.help((ctx) => {
  ctx.reply(
    `*📖 Event Calendar Bot Help*\n\n` +
    `*Commands:*\n` +
    `/start — Welcome message\n` +
    `/help — This help message\n` +
    `/login — Connect Microsoft account\n` +
    `/logout — Disconnect Microsoft account\n` +
    `/status — Check login status\n\n` +
    `*How it works:*\n` +
    `• Forward or paste any event message\n` +
    `• I'll detect: 📌 Title, 🗓 Date, ⏰ Time, 📍 Location, 🎟 Tickets\n` +
    `• Choose: Add to Teams Calendar or download .ics file\n\n` +
    `*Tips:*\n` +
    `• Works best with messages that have clear date/time info\n` +
    `• I understand formats like "June 30, 2026" and "6:00 PM – 8:30 PM"\n` +
    `• Works in groups too — just forward/paste event messages!`,
    { parse_mode: 'Markdown' }
  );
});

// ─── /login Command ──────────────────────────────────────────────────────────

bot.command('login', async (ctx) => {
  if (!isMicrosoftConfigured()) {
    return ctx.reply(
      `⚠️ Microsoft integration is not configured.\n\n` +
      `Add your \`MICROSOFT_CLIENT_ID\` to the .env file.\n` +
      `See the setup guide for details.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Check if already logged in
  const user = await getLoggedInUser();
  if (user) {
    return ctx.reply(
      `✅ You're already logged in as *${user.name}*\n` +
      `(${user.username})\n\n` +
      `Use /logout to sign out.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Prevent duplicate login flows
  const userId = ctx.from.id;
  if (loginInProgress.has(userId)) {
    return ctx.reply('⏳ A login is already in progress. Please complete it or wait for it to expire.');
  }

  loginInProgress.add(userId);

  try {
    await ctx.reply('🔐 Starting Microsoft sign-in...');

    const result = await startDeviceCodeAuth((deviceCode) => {
      // Show the device code to the user
      ctx.reply(
        `🔑 *Microsoft Sign-In*\n\n` +
        `1️⃣ Open this link on any device:\n` +
        `👉 https://microsoft.com/devicelogin\n\n` +
        `2️⃣ Enter this code:\n` +
        `\`${deviceCode.userCode}\`\n\n` +
        `3️⃣ Sign in with your Microsoft account\n\n` +
        `⏳ Waiting for you to complete sign-in...`,
        { parse_mode: 'Markdown' }
      );
    });

    // Login successful — get user profile
    let profileName = result.account?.name || result.account?.username || 'Unknown';

    try {
      const profile = await getUserProfile(result.accessToken);
      profileName = profile.displayName || profileName;
    } catch {
      // Use MSAL account name as fallback
    }

    await ctx.reply(
      `✅ *Successfully signed in!*\n\n` +
      `👤 Logged in as: *${profileName}*\n\n` +
      `You can now add events directly to your Microsoft Teams / Outlook calendar.\n` +
      `Forward me an event message to try it!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Login error:', err);
    await ctx.reply(`❌ Sign-in failed: ${err.message}\n\nPlease try /login again.`);
  } finally {
    loginInProgress.delete(userId);
  }
});

// ─── /logout Command ─────────────────────────────────────────────────────────

bot.command('logout', async (ctx) => {
  const user = await getLoggedInUser();
  if (!user) {
    return ctx.reply('ℹ️ You\'re not logged in. Use /login to connect your Microsoft account.');
  }

  await logout();
  ctx.reply(
    `👋 Signed out successfully.\n\n` +
    `Your Microsoft tokens have been cleared.\n` +
    `You can still use the .ics file download option.\n` +
    `Use /login to sign in again.`
  );
});

// ─── /status Command ─────────────────────────────────────────────────────────

bot.command('status', async (ctx) => {
  const msConfigured = isMicrosoftConfigured();
  const loggedIn = msConfigured ? await isLoggedIn() : false;
  const user = loggedIn ? await getLoggedInUser() : null;

  let status = `*🤖 Bot Status*\n\n`;
  status += `📡 Bot: Running\n`;
  status += `🌏 Timezone: ${TIMEZONE}\n\n`;

  if (!msConfigured) {
    status += `🔒 Microsoft: Not configured\n`;
    status += `   Add MICROSOFT_CLIENT_ID to .env`;
  } else if (!loggedIn) {
    status += `🔒 Microsoft: Not signed in\n`;
    status += `   Use /login to connect`;
  } else {
    status += `✅ Microsoft: Signed in\n`;
    status += `   👤 ${user?.name || 'Unknown'} (${user?.username || ''})`;
  }

  ctx.reply(status, { parse_mode: 'Markdown' });
});

// ─── Shared Message Handler ──────────────────────────────────────────────────

/**
 * Handle incoming messages — works for both plain text and media with captions.
 * When a Telegram post has an image/video, the text is in ctx.message.caption,
 * not ctx.message.text. This handler checks both.
 */
async function handleEventMessage(ctx) {
  // Get text from either message.text or message.caption (for photos/videos/docs)
  const messageText = ctx.message.text || ctx.message.caption;
  const hasPhoto = ctx.message.photo && ctx.message.photo.length > 0;

  if (!messageText && !hasPhoto) return;

  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  let cleanedText = messageText || '';
  let hasPrefix = false;

  // Check if message starts with '/' or '.'
  if (cleanedText) {
    const prefixMatch = cleanedText.match(/^[\/\.](.*)/s);
    if (prefixMatch) {
      hasPrefix = true;
      cleanedText = prefixMatch[1].trim();
    }
  }

  // In groups, we only process messages starting with '/' or '.'
  if (isGroup && !hasPrefix) {
    return; // Ignore regular group messages
  }

  // Skip standard commands (since we already handle them via specific commands)
  if (hasPrefix && /^(start|help|login|logout|status)\b/i.test(cleanedText)) {
    return;
  }

  try {
    let event = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        if (hasPhoto) {
          await ctx.reply('🔍 Processing image with Gemini AI...');
          const photo = ctx.message.photo[ctx.message.photo.length - 1]; // largest size
          const fileId = photo.file_id;
          const fileLink = await ctx.telegram.getFileLink(fileId);
          
          const response = await fetch(fileLink.href);
          const buffer = Buffer.from(await response.arrayBuffer());
          
          event = await parseEventWithGemini(cleanedText, buffer, 'image/jpeg');
        } else {
          event = await parseEventWithGemini(cleanedText);
        }
      } catch (geminiError) {
        console.error('Gemini parsing failed, falling back to local parsing:', geminiError.message);
        if (cleanedText) {
          await ctx.reply('⚠️ Gemini AI parsing failed. Falling back to local parsing...');
          event = parseEvent(cleanedText);
        } else {
          return ctx.reply('❌ Failed to process image with Gemini AI. Make sure your GEMINI_API_KEY is correct.');
        }
      }
    } else {
      if (hasPhoto) {
        if (cleanedText) {
          await ctx.reply('⚠️ Gemini API Key not configured. Image content could not be read, but trying to parse the caption text...');
          event = parseEvent(cleanedText);
        } else {
          return ctx.reply('⚠️ To extract events from images, a Gemini API Key is required. Please set GEMINI_API_KEY in the bot\'s .env file.');
        }
      } else {
        event = parseEvent(cleanedText);
      }
    }

    if (!event || (!event.date && !event.startTime)) {
      return ctx.reply(
        `🤔 I couldn't detect event information in that message.\n\n` +
        `Make sure the message includes at least a *date* or *time*.\n\n` +
        `Example formats I understand:\n` +
        `• 🗓 Date: Tuesday, June 30, 2026\n` +
        `• ⏰ Time: 6:00 PM – 8:30 PM\n` +
        `• 📍 Venue: Raintree, Phnom Penh`,
        { parse_mode: 'Markdown' }
      );
    }

    // Store the parsed event for this user
    pendingEvents.set(ctx.from.id, event);

    // Show extracted info and ask for confirmation
    const summary = formatEventSummary(event);

    // Build action buttons based on login status
    const loggedIn = isMicrosoftConfigured() ? await isLoggedIn() : false;
    const buttons = [];

    // Calendar UI button — always available
    buttons.push([
      Markup.button.callback('📅 Add to Calendar', 'add_to_calendar'),
    ]);

    if (loggedIn) {
      buttons.push([
        Markup.button.callback('📆 Add to Teams', 'add_to_teams'),
      ]);
    }

    buttons.push([
      Markup.button.callback('📄 Download .ics', 'download_ics'),
      Markup.button.callback('❌ Cancel', 'cancel_event'),
    ]);

    await ctx.reply(
      `✨ *Event Detected!*\n\n${summary}\n\n` +
      `${loggedIn ? 'Choose an action:' : 'Does this look correct?'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      }
    );
  } catch (err) {
    console.error('Error parsing message:', err);
    ctx.reply('⚠️ Sorry, something went wrong while parsing that message. Please try again.');
  }
}

// ─── Message Listeners (text, photo, video, document) ────────────────────────
// Telegram sends different message types depending on content:
//   - Plain text messages → 'text' (text in ctx.message.text)
//   - Photo with caption  → 'photo' (text in ctx.message.caption)
//   - Video with caption  → 'video' (text in ctx.message.caption)
//   - File with caption   → 'document' (text in ctx.message.caption)

bot.on('text', handleEventMessage);
bot.on('photo', handleEventMessage);
bot.on('video', handleEventMessage);
bot.on('document', handleEventMessage);

// ─── Callback: Add to Calendar UI ────────────────────────────────────────────

bot.action('add_to_calendar', async (ctx) => {
  await ctx.answerCbQuery();

  const event = pendingEvents.get(ctx.from.id);
  if (!event) {
    return ctx.editMessageText('⚠️ No pending event found. Please send a new event message.');
  }

  try {
    const saved = saveEvent(event);

    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_URL || `localhost:${process.env.CALENDAR_PORT || 3333}`;
    const calendarUrl = domain.includes('localhost') ? `http://${domain}` : `https://${domain}`;

    await ctx.editMessageText(
      `✅ *Event added to calendar!*\n\n` +
      `📌 *${saved.title}*\n` +
      `${saved.date ? `🗓 ${saved.date}\n` : ''}` +
      `${saved.startTime ? `⏰ ${saved.startTime}${saved.endTime ? ' – ' + saved.endTime : ''}\n` : ''}` +
      `${saved.location ? `📍 ${saved.location}\n` : ''}` +
      `\n🌐 View your calendar: ${calendarUrl}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );

    pendingEvents.delete(ctx.from.id);
  } catch (err) {
    console.error('Error saving event:', err);
    ctx.reply('⚠️ Failed to save event. Please try again.');
  }
});

// ─── Callback: Add to Teams Calendar ─────────────────────────────────────────

bot.action('add_to_teams', async (ctx) => {
  await ctx.answerCbQuery();

  const event = pendingEvents.get(ctx.from.id);
  if (!event) {
    return ctx.editMessageText('⚠️ No pending event found. Please send a new event message.');
  }

  try {
    // Update message to show progress
    await ctx.editMessageText(
      `⏳ Adding *${event.title}* to your Teams calendar...`,
      { parse_mode: 'Markdown' }
    );

    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return ctx.editMessageText(
        `🔒 Your Microsoft session has expired.\n\n` +
        `Please use /login to sign in again, then forward the event.`
      );
    }

    // Create the calendar event via Graph API
    const result = await createCalendarEvent(accessToken, event, TIMEZONE);

    // Build success confirmation message
    let confirmMsg =
      `✅ *Event successfully added to your calendar!*\n\n` +
      `📌 *${result.subject}*\n`;

    if (result.start?.dateTime) {
      const startDate = new Date(result.start.dateTime);
      const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
      confirmMsg += `🗓 ${startDate.toLocaleDateString('en-US', dateOptions)}\n`;
      confirmMsg += `⏰ ${startDate.toLocaleTimeString('en-US', timeOptions)}`;

      if (result.end?.dateTime) {
        const endDate = new Date(result.end.dateTime);
        confirmMsg += ` – ${endDate.toLocaleTimeString('en-US', timeOptions)}`;
      }
      confirmMsg += `\n`;
    }

    if (result.location) {
      confirmMsg += `📍 ${result.location}\n`;
    }

    confirmMsg += `\n🎉 Open Microsoft Teams → Calendar to see your event.`;

    // Add a link to open the event if available
    if (result.webLink) {
      confirmMsg += `\n\n🔗 [Open in Outlook](${result.webLink})`;
    }

    await ctx.editMessageText(confirmMsg, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    // Clean up
    pendingEvents.delete(ctx.from.id);
  } catch (err) {
    console.error('Error creating Teams calendar event:', err);

    let errorMsg = '⚠️ Failed to add event to Teams calendar.\n\n';
    if (err.statusCode === 401) {
      errorMsg += 'Your session has expired. Please use /login to sign in again.';
    } else if (err.graphError) {
      errorMsg += `Error: ${err.graphError.message}`;
    } else {
      errorMsg += `Error: ${err.message}`;
    }

    await ctx.editMessageText(errorMsg);
  }
});

// ─── Callback: Download .ics File ────────────────────────────────────────────

bot.action('download_ics', async (ctx) => {
  await ctx.answerCbQuery();

  const event = pendingEvents.get(ctx.from.id);
  if (!event) {
    return ctx.editMessageText('⚠️ No pending event found. Please send a new event message.');
  }

  try {
    // Generate the .ics file
    const icsBuffer = generateICS(event, TIMEZONE);
    const filename = generateFilename(event);

    // Send the .ics file
    await ctx.replyWithDocument(
      { source: icsBuffer, filename },
      {
        caption:
          `📅 *Calendar file ready!*\n\n` +
          `Open this file to add the event to:\n` +
          `• Microsoft Teams Calendar\n` +
          `• Outlook\n` +
          `• Google Calendar\n` +
          `• Apple Calendar`,
        parse_mode: 'Markdown',
      }
    );

    // Update the confirmation message
    await ctx.editMessageText(
      `✅ Calendar file sent! *${event.title}*\n\n` +
      `Open the .ics file above to add it to your calendar.`,
      { parse_mode: 'Markdown' }
    );

    // Clean up
    pendingEvents.delete(ctx.from.id);
  } catch (err) {
    console.error('Error generating calendar file:', err);
    ctx.reply('⚠️ Sorry, something went wrong while creating the calendar file. Please try again.');
  }
});

// ─── Callback: Cancel Event ──────────────────────────────────────────────────

bot.action('cancel_event', async (ctx) => {
  await ctx.answerCbQuery();
  pendingEvents.delete(ctx.from.id);
  await ctx.editMessageText('❌ Cancelled. Send me another event message anytime!');
});

// ─── Error Handler ───────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// ─── Launch ──────────────────────────────────────────────────────────────────

bot.launch()
  .then(async () => {
    const msConfigured = isMicrosoftConfigured();
    const loggedIn = msConfigured ? await isLoggedIn() : false;

    console.log('');
    console.log('🤖 ═══════════════════════════════════════════════');
    console.log('   Event Calendar Bot is running!');
    console.log(`   Timezone: ${TIMEZONE}`);
    console.log(`   Microsoft: ${msConfigured ? (loggedIn ? '✅ Signed in' : '🔒 Not signed in (use /login)') : '⚠️ Not configured'}`);
    console.log('   Forward an event message to your bot on Telegram');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
  })
  .catch((err) => {
    console.error('❌ Failed to start bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
