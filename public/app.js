/**
 * Event Calendar — Client-side Application
 *
 * Renders a clean calendar UI with Month, Week, and List views.
 * Loads event data from the API endpoint (/api/events).
 * Events are added via the Telegram bot.
 */

// ═══════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const now = new Date();
let currentDate = new Date();
let currentYear = currentDate.getFullYear();
let currentMonth = currentDate.getMonth();
let currentView = 'month';
let events = [];
let activeModalEvent = null;

// ═══════════════════════════════════════════════════
//  DOM References
// ═══════════════════════════════════════════════════

const $title = document.getElementById('cal-title');
const $grid = document.getElementById('calendar-grid');
const $weekdayHeaders = document.getElementById('weekday-headers');
const $monthView = document.getElementById('calendar-month');
const $weekView = document.getElementById('calendar-week');
const $weekHeader = document.getElementById('week-header');
const $weekBody = document.getElementById('week-body');
const $listView = document.getElementById('calendar-list');
const $listContainer = document.getElementById('list-container');
const $modalOverlay = document.getElementById('modal-overlay');
const $modalTitle = document.getElementById('modal-title');
const $modalMeta = document.getElementById('modal-meta');
const $modalDesc = document.getElementById('modal-description');
const $btnRsvpGoing = document.getElementById('btn-rsvp-going');
const $btnRsvpNotGoing = document.getElementById('btn-rsvp-notgoing');
const $btnDeleteEvent = document.getElementById('btn-delete-event');

// ═══════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getEventsForDate(dateStr) {
  return events.filter(e => e.date === dateStr);
}

function isToday(y, m, d) {
  return y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
}

function getDaysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function getFirstDayOfMonth(y, m) {
  return new Date(y, m, 1).getDay();
}

function getWeekStart(y, m, d) {
  const date = new Date(y, m, d);
  const dayOfWeek = date.getDay();
  const diff = date.getDate() - dayOfWeek;
  return new Date(y, m, diff);
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ═══════════════════════════════════════════════════
//  Render: Month View
// ═══════════════════════════════════════════════════

function renderWeekdayHeaders() {
  $weekdayHeaders.innerHTML = DAY_NAMES_SHORT
    .map(name => `<div class="calendar__weekday">${name}</div>`)
    .join('');
}

function renderMonthView() {
  $title.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  $grid.innerHTML = '';

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  // Previous month days
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const daysInPrev = getDaysInMonth(prevYear, prevMonth);

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    $grid.appendChild(createDayCell(prevYear, prevMonth, day, true));
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    $grid.appendChild(createDayCell(currentYear, currentMonth, d, false));
  }

  // Next month days to fill the grid
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

  for (let d = 1; d <= remaining; d++) {
    $grid.appendChild(createDayCell(nextYear, nextMonth, d, true));
  }
}

function createDayCell(y, m, d, isOtherMonth) {
  const cell = document.createElement('div');
  cell.className = 'day-cell';
  if (isOtherMonth) cell.classList.add('day-cell--other-month');
  if (isToday(y, m, d)) cell.classList.add('day-cell--today');

  const numEl = document.createElement('div');
  numEl.className = 'day-cell__number';
  numEl.textContent = d;
  cell.appendChild(numEl);

  const dk = dateKey(y, m, d);
  const dayEvents = getEventsForDate(dk);
  const maxVisible = 2;

  dayEvents.slice(0, maxVisible).forEach((ev) => {
    const chip = document.createElement('div');
    chip.className = `event-chip event-chip--${ev.color}`;
    if (ev.rsvpStatus === 'not_going') {
      chip.classList.add('event--not-going');
    }
    const displayTitle = ev.rsvpStatus === 'going' ? `✓ ${ev.title}` : ev.title;
    chip.textContent = displayTitle;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(ev);
    });
    cell.appendChild(chip);
  });

  if (dayEvents.length > maxVisible) {
    const more = document.createElement('div');
    more.className = 'day-cell__more';
    more.textContent = `+${dayEvents.length - maxVisible} more`;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(dayEvents[maxVisible]);
    });
    cell.appendChild(more);
  }

  return cell;
}

// ═══════════════════════════════════════════════════
//  Render: Week View
// ═══════════════════════════════════════════════════

function renderWeekView() {
  const weekStart = getWeekStart(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  // Header
  let headerHTML = '<div class="week-view__day-header"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const isTodayClass = isToday(d.getFullYear(), d.getMonth(), d.getDate()) ? ' week-view__day-header--today' : '';
    headerHTML += `
      <div class="week-view__day-header${isTodayClass}">
        <div class="week-view__day-name">${DAY_NAMES_SHORT[d.getDay()]}</div>
        <div class="week-view__day-num">${d.getDate()}</div>
      </div>`;
  }
  $weekHeader.innerHTML = headerHTML;

  // Title
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startMonth = MONTH_NAMES[weekStart.getMonth()];
  const endMonth = MONTH_NAMES[weekEnd.getMonth()];
  $title.textContent = startMonth === endMonth
    ? `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`
    : `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  // Body with time slots (6AM - 11PM)
  const startHourSlot = 6;
  const endHourSlot = 23;

  // Color maps (clean pastel)
  const colorBg = {
    green: '#e6f4ea', blue: '#e8f0fe', amber: '#fef7e0',
    rose: '#fce8e6', purple: '#f3e8fd', teal: '#e0f7f6',
  };
  const colorFg = {
    green: '#137333', blue: '#1a73e8', amber: '#b06000',
    rose: '#c5221f', purple: '#7627bb', teal: '#007b83',
  };

  let bodyHTML = '<div class="week-view__time-col">';
  for (let h = startHourSlot; h <= endHourSlot; h++) {
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    bodyHTML += `<div class="week-view__time-slot">${label}</div>`;
  }
  bodyHTML += '</div>';

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dk = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEvents = getEventsForDate(dk);

    bodyHTML += '<div class="week-view__day-col">';
    for (let h = startHourSlot; h <= endHourSlot; h++) {
      bodyHTML += '<div class="week-view__hour-line"></div>';
    }

    dayEvents.forEach((ev) => {
      const topOffset = (ev.startHour - startHourSlot) * 50;
      const height = (ev.endHour - ev.startHour) * 50;
      const notGoingClass = ev.rsvpStatus === 'not_going' ? ' event--not-going' : '';
      const displayTitle = ev.rsvpStatus === 'going' ? `✓ ${ev.title}` : ev.title;
      bodyHTML += `
        <div class="week-view__event-block${notGoingClass}" data-event-id="${ev.id}"
             style="top:${topOffset}px; height:${Math.max(height, 25)}px;
                    background:${colorBg[ev.color] || '#e8f0fe'};
                    border-left:3px solid ${colorFg[ev.color] || '#1a73e8'};
                    color:${colorFg[ev.color] || '#1a73e8'};">
          <div style="font-weight:600; font-size:0.72rem;">${displayTitle}</div>
          <div class="week-view__event-time">${ev.startTime || ''} ${ev.endTime ? '– ' + ev.endTime : ''}</div>
        </div>`;
    });

    bodyHTML += '</div>';
  }

  $weekBody.innerHTML = bodyHTML;

  // Click handlers
  $weekBody.querySelectorAll('.week-view__event-block').forEach(block => {
    block.addEventListener('click', () => {
      const id = parseInt(block.dataset.eventId);
      const ev = events.find(e => e.id === id);
      if (ev) openModal(ev);
    });
  });
}

// ═══════════════════════════════════════════════════
//  Render: List View
// ═══════════════════════════════════════════════════

function renderListView() {
  $title.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const monthEvents = events.filter(ev => {
    const d = new Date(ev.date + 'T00:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (monthEvents.length === 0) {
    $listContainer.innerHTML = `
      <div class="list-view__empty">
        <div class="list-view__empty-icon">📭</div>
        <div class="list-view__empty-text">No events this month</div>
        <div style="color:var(--text-muted); font-size:0.8rem; margin-top:0.5rem;">
          Send an event message to the Telegram bot to add events
        </div>
      </div>`;
    return;
  }

  // Color map for list color bars
  const colorFg = {
    green: '#137333', blue: '#1a73e8', amber: '#b06000',
    rose: '#c5221f', purple: '#7627bb', teal: '#007b83',
  };

  // Group by date
  const groups = {};
  monthEvents.forEach(ev => {
    if (!groups[ev.date]) groups[ev.date] = [];
    groups[ev.date].push(ev);
  });

  let html = '';
  let groupIdx = 0;
  for (const [date, evts] of Object.entries(groups)) {
    html += `<div class="list-view__date-group" style="animation-delay:${groupIdx * 60}ms">`;
    html += `<div class="list-view__date-label">${formatDateLong(date)}</div>`;

    evts.forEach(ev => {
      const notGoingClass = ev.rsvpStatus === 'not_going' ? ' event--not-going' : '';
      const displayTitle = ev.rsvpStatus === 'going' ? `✓ ${ev.title}` : ev.title;
      html += `
        <div class="list-view__event-card${notGoingClass}" data-event-id="${ev.id}">
          <div class="list-view__color-bar" style="background:${colorFg[ev.color] || '#1a73e8'}"></div>
          <div class="list-view__event-info">
            <div class="list-view__event-title">${displayTitle}</div>
            <div class="list-view__event-detail">
              <span class="list-view__event-detail-icon">⏰</span>
              ${ev.startTime || 'All day'}${ev.endTime ? ' – ' + ev.endTime : ''}
            </div>
            ${ev.location ? `
            <div class="list-view__event-detail">
              <span class="list-view__event-detail-icon">📍</span>
              ${ev.location}
            </div>` : ''}
            ${ev.tickets ? `
            <div class="list-view__event-detail">
              <span class="list-view__event-detail-icon">🎟</span>
              ${ev.tickets}
            </div>` : ''}
          </div>
        </div>`;
    });

    html += '</div>';
    groupIdx++;
  }

  $listContainer.innerHTML = html;

  // Click handlers
  $listContainer.querySelectorAll('.list-view__event-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.eventId);
      const ev = events.find(e => e.id === id);
      if (ev) openModal(ev);
    });
  });
}

// ═══════════════════════════════════════════════════
//  Modal
// ═══════════════════════════════════════════════════

function openModal(ev) {
  activeModalEvent = ev;
  $modalTitle.textContent = ev.title;

  let metaHTML = '';
  if (ev.date) {
    metaHTML += `
      <div class="modal__meta-row">
        <span class="modal__meta-icon">🗓</span>
        <span class="modal__meta-label">Date:</span> ${formatDateLong(ev.date)}
      </div>`;
  }
  if (ev.startTime) {
    metaHTML += `
      <div class="modal__meta-row">
        <span class="modal__meta-icon">⏰</span>
        <span class="modal__meta-label">Time:</span> ${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''}
      </div>`;
  }
  if (ev.location) {
    metaHTML += `
      <div class="modal__meta-row">
        <span class="modal__meta-icon">📍</span>
        <span class="modal__meta-label">Location:</span> ${ev.location}
      </div>`;
  }
  if (ev.tickets) {
    metaHTML += `
      <div class="modal__meta-row">
        <span class="modal__meta-icon">🎟</span>
        <span class="modal__meta-label">Tickets:</span> ${ev.tickets}
      </div>`;
  }

  $modalMeta.innerHTML = metaHTML;
  $modalDesc.textContent = ev.description || '';
  updateModalRsvpButtons();
  $modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  activeModalEvent = null;
  $modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function updateModalRsvpButtons() {
  if (!activeModalEvent) return;
  const status = activeModalEvent.rsvpStatus;
  
  $btnRsvpGoing.classList.toggle('modal__btn--active-going', status === 'going');
  $btnRsvpNotGoing.classList.toggle('modal__btn--active-notgoing', status === 'not_going');
}

// ═══════════════════════════════════════════════════
//  Navigation & View Switching
// ═══════════════════════════════════════════════════

function navigate(direction) {
  if (currentView === 'week') {
    currentDate.setDate(currentDate.getDate() + direction * 7);
    currentYear = currentDate.getFullYear();
    currentMonth = currentDate.getMonth();
  } else {
    currentMonth += direction;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    currentDate = new Date(currentYear, currentMonth, 1);
  }
  render();
}

function goToToday() {
  currentDate = new Date();
  currentYear = currentDate.getFullYear();
  currentMonth = currentDate.getMonth();
  render();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.topbar__view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  $monthView.classList.toggle('hidden', view !== 'month');
  $weekView.classList.toggle('hidden', view !== 'week');
  $listView.classList.toggle('hidden', view !== 'list');
  render();
}

function render() {
  if (currentView === 'month') renderMonthView();
  else if (currentView === 'week') renderWeekView();
  else if (currentView === 'list') renderListView();
}

// ═══════════════════════════════════════════════════
//  Event Listeners
// ═══════════════════════════════════════════════════

document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next').addEventListener('click', () => navigate(1));
document.getElementById('btn-today').addEventListener('click', goToToday);

document.querySelectorAll('.topbar__view-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('modal-close').addEventListener('click', closeModal);
$modalOverlay.addEventListener('click', (e) => {
  if (e.target === $modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

$btnRsvpGoing.addEventListener('click', () => toggleRsvp('going'));
$btnRsvpNotGoing.addEventListener('click', () => toggleRsvp('not_going'));
$btnDeleteEvent.addEventListener('click', deleteActiveEvent);

async function toggleRsvp(status) {
  if (!activeModalEvent) return;
  const currentStatus = activeModalEvent.rsvpStatus;
  const newStatus = currentStatus === status ? null : status;

  try {
    const res = await fetch(`/api/events/${activeModalEvent.id}/rsvp`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        // Update local events array and the active modal event reference
        activeModalEvent.rsvpStatus = newStatus;
        const index = events.findIndex(e => e.id === activeModalEvent.id);
        if (index !== -1) {
          events[index].rsvpStatus = newStatus;
        }
        
        updateModalRsvpButtons();
        render();
      }
    }
  } catch (err) {
    console.error('Error toggling RSVP:', err);
  }
}

async function deleteActiveEvent() {
  if (!activeModalEvent) return;
  if (!confirm(`Are you sure you want to delete "${activeModalEvent.title}"?`)) return;

  try {
    const res = await fetch(`/api/events/${activeModalEvent.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        // Remove from local array
        events = events.filter(e => e.id !== activeModalEvent.id);
        closeModal();
        render();
      }
    }
  } catch (err) {
    console.error('Error deleting event:', err);
  }
}

// ═══════════════════════════════════════════════════
//  Load events from API — auto-refresh every 10s
// ═══════════════════════════════════════════════════

async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        events = data;
      }
    }
  } catch {
    // API unavailable — keep current events
  }
  render();
}

// ═══════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════

renderWeekdayHeaders();
loadEvents();

// Auto-refresh every 10 seconds to pick up new events from the bot
setInterval(loadEvents, 10000);
