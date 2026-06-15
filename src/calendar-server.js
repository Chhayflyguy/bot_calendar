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
const { getAllEvents, deleteEvent, updateEventRsvp } = require('./event-store');

const PORT = process.env.PORT || process.env.CALENDAR_PORT || 3333;

const app = express();
app.use(express.json());

// ─── Serve static files ─────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API: Event data from shared store ───────────────────────────────────────

app.get('/api/events', (req, res) => {
  const events = getAllEvents();
  res.json(events);
});

// DELETE event
app.delete('/api/events/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const success = deleteEvent(id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Event not found' });
  }
});

// UPDATE RSVP status
app.patch('/api/events/:id/rsvp', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  
  if (status !== 'going' && status !== 'not_going' && status !== null) {
    return res.status(400).json({ error: 'Invalid RSVP status' });
  }
  
  const updated = updateEventRsvp(id, status);
  if (updated) {
    res.json({ success: true, event: updated });
  } else {
    res.status(404).json({ error: 'Event not found' });
  }
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
