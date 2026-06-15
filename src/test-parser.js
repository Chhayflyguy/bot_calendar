/**
 * Test the event parser with sample Telegram event messages.
 * Run: node src/test-parser.js
 */

const { parseEvent } = require('./parser');
const { formatEventSummary } = require('./utils');

// ─── Test Messages ───────────────────────────────────────────────────────────

const testMessages = [
  {
    name: 'AmCham Tech Tuesday (Unicode Bold)',
    text: `🚀 𝗧𝗵𝗲 𝗥𝗲𝘁𝘂𝗿𝗻 𝗼𝗳 𝗔𝗺𝗖𝗵𝗮𝗺 𝗧𝗲𝗰𝗵 𝗧𝘂𝗲𝘀𝗱𝗮𝘆! 🚀

🌐 Join AmCham Cambodia's ICT & Digital Committee as we celebrate the return of our flagship networking series in its 10th year.

🤝 Connect with technology professionals, digital innovators, and business leaders over an evening of networking, food, and drinks.

🗓 Date: Tuesday, June 30, 2026
📍 Venue: Raintree, Canopy + Crown on 4th floor,Phnom Penh
⏰ Time: 6:00 PM – 8:30 PM (Doors Open at 5:30 PM)
🎟 Tickets: Member Rate USD 12 | Non-Member Rate USD 15

📧 ⭐️For sponsorship inquiries, please contact Mealia Sun, Partnership & Membership Manager, at mealia@amchamcambodia.net`,
    expected: {
      title: 'The Return of AmCham Tech Tuesday!',
      date: 'June 30, 2026',
      startTime: '6:00 PM',
      endTime: '8:30 PM',
      location: 'Raintree, Canopy + Crown on 4th floor,Phnom Penh',
    },
  },

  {
    name: 'Simple Event (DD Month YYYY)',
    text: `Tech Meetup Phnom Penh

Join us for a night of tech talks and networking!

Date: 15 July 2026
Time: 7:00 PM - 9:00 PM
Venue: Factory Phnom Penh, Phnom Penh
Tickets: Free`,
    expected: {
      title: 'Tech Meetup Phnom Penh',
      date: '15 July 2026',
      startTime: '7:00 PM',
      endTime: '9:00 PM',
      location: 'Factory Phnom Penh, Phnom Penh',
    },
  },

  {
    name: 'Event with DD/MM/YYYY format',
    text: `🎉 Startup Weekend Cambodia 2026

📅 Date: 25/07/2026
📍 Location: Impact Hub, Phnom Penh
⏰ Time: 9:00 AM – 6:00 PM
🎟 Tickets: USD 25

Register at https://example.com/register`,
    expected: {
      title: 'Startup Weekend Cambodia 2026',
      date: '25/07/2026',
      startTime: '9:00 AM',
      endTime: '6:00 PM',
      location: 'Impact Hub, Phnom Penh',
    },
  },

  {
    name: 'Inline event format (June 16)',
    text: `Apps, AI and Emerging Markets: A Tech Talk in Phnom Penh on June 16 at Aquation Theater`,
    expected: {
      title: 'Apps, AI and Emerging Markets: A Tech Talk',
      date: 'June 16, 2026',
      location: 'Aquation Theater, Phnom Penh',
    },
  },

  {
    name: 'Inline event format with breadcrumb (June 16)',
    text: `Home - Digital - Apps, AI and Emerging Markets: A Tech Talk in Phnom Penh on June 16 at Aquation Theater`,
    expected: {
      title: 'Apps, AI and Emerging Markets: A Tech Talk',
      date: 'June 16, 2026',
      location: 'Aquation Theater, Phnom Penh',
    },
  },

  {
    name: 'Non-event message (should return null)',
    text: `Hello everyone! How is the weather today?`,
    expected: null,
  },
];

// ─── Run Tests ───────────────────────────────────────────────────────────────

console.log('');
console.log('🧪 ═══════════════════════════════════════════════');
console.log('   Event Parser Test Suite');
console.log('═══════════════════════════════════════════════════');
console.log('');

let passed = 0;
let failed = 0;

for (const test of testMessages) {
  console.log(`\n── Test: ${test.name} ──`);

  const result = parseEvent(test.text);

  if (test.expected === null) {
    if (result === null) {
      console.log('  ✅ Correctly returned null (not an event)');
      passed++;
    } else {
      console.log('  ❌ Expected null but got:', result.title);
      failed++;
    }
    continue;
  }

  if (!result) {
    console.log('  ❌ Failed to parse event (returned null)');
    failed++;
    continue;
  }

  // Check each expected field
  let testPassed = true;
  const checks = [
    ['title', test.expected.title],
    ['date', test.expected.date],
    ['startTime', test.expected.startTime],
    ['endTime', test.expected.endTime],
    ['location', test.expected.location],
  ];

  for (const [field, expected] of checks) {
    if (expected === undefined) continue;

    const actual = result[field];
    if (actual === expected) {
      console.log(`  ✅ ${field}: "${actual}"`);
    } else {
      console.log(`  ❌ ${field}: expected "${expected}", got "${actual}"`);
      testPassed = false;
    }
  }

  if (testPassed) {
    passed++;
  } else {
    failed++;
  }

  // Show formatted summary
  console.log(`\n  📋 Formatted summary:`);
  const summary = formatEventSummary(result);
  summary.split('\n').forEach(line => console.log(`     ${line}`));
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n');
console.log('═══════════════════════════════════════════════════');
console.log(`   Results: ${passed} passed, ${failed} failed, ${testMessages.length} total`);
console.log('═══════════════════════════════════════════════════');
console.log('');

process.exit(failed > 0 ? 1 : 0);
