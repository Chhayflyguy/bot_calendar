/**
 * Test the Gemini API event parsing integration.
 * Run: node src/test-gemini.js
 */

require('dotenv').config();
const { parseEventWithGemini } = require('./parser');

async function runTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('\n⚠️  GEMINI_API_KEY is not set in your .env file.');
    console.log('To test Gemini extraction, please:');
    console.log('  1. Get a key from https://aistudio.google.com/');
    console.log('  2. Add it to your .env file: GEMINI_API_KEY=your_key');
    console.log('  3. Re-run: node src/test-gemini.js\n');
    return;
  }

  console.log('🔌 Connecting to Gemini API...');
  
  const testText = "Home - Digital - Apps, AI and Emerging Markets: A Tech Talk in Phnom Penh on June 16 at Aquation Theater";
  console.log(`\n📄 Sending text: "${testText}"`);

  try {
    const result = await parseEventWithGemini(testText);
    console.log('\n✅ Extraction Successful!');
    console.log('--------------------------------------------------');
    console.log(JSON.stringify(result, null, 2));
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('\n❌ Gemini extraction failed:', error.message);
  }
}

runTest();
