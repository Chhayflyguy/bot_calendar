/**
 * Calendar Web Server — serves the calendar UI and event API.
 *
 * Reads events from the shared event store (data/events.json)
 * which is populated by the Telegram bot.
 *
 * Usage:
 *   npm run calendar     — Start the calendar web UI
 *   Open http://localhost:3333 in your browser
 */

const express = require('express');
const path = require('path');
const { getAllEvents } = require('./event-store');

const PORT = process.env.CALENDAR_PORT || 3333;

const app = express();

// ─── Serve static files ─────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API: Event data from shared store ───────────────────────────────────────

app.get('/api/events', (req, res) => {
  const events = getAllEvents();
  res.json(events);
});

// ─── Fallback for SPA ────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const events = getAllEvents();
  console.log('');
  console.log('📅 ═══════════════════════════════════════════════');
  console.log('   Event Calendar UI is running!');
  console.log(`   🌐 http://localhost:${PORT}`);
  console.log(`   📋 ${events.length} event(s) loaded`);
  console.log('   Events are synced from the Telegram bot');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});
