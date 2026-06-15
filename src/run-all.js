/**
 * Runner Script — Starts both the Calendar Web Server and the Telegram Bot concurrently.
 * Decouples the lifecycle of the Bot from the Server so that a bot conflict
 * does not take down the web calendar (prevents 502 Bad Gateway).
 */

const { spawn } = require('child_process');
const path = require('path');

// Start the server (exits the container if the server stops)
function startServer() {
  const serverPath = path.join(__dirname, 'calendar-server.js');
  console.log('🚀 Starting Calendar Server...');
  const proc = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: process.env
  });

  proc.on('close', (code) => {
    console.log(`❌ [Server] process exited with code ${code}. Terminating container...`);
    process.exit(code || 1);
  });
}

// Start the bot with auto-restart on crash
function startBot() {
  const botPath = path.join(__dirname, 'bot.js');
  console.log('🤖 Starting Telegram Bot...');
  const proc = spawn('node', [botPath], {
    stdio: 'inherit',
    env: process.env
  });

  proc.on('close', (code) => {
    console.log(`⚠️ [Bot] process exited with code ${code}. Restarting bot in 10 seconds...`);
    setTimeout(startBot, 10000);
  });
}

console.log('🚀 Starting Event Calendar Application on Railway...');
startServer();
startBot();
