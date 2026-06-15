/**
 * Runner Script — Starts both the Calendar Web Server and the Telegram Bot concurrently.
 * Used for deployment (e.g., on Railway) to run both processes in a single container.
 */

const { spawn } = require('child_process');
const path = require('path');

function startProcess(scriptPath, name) {
  const proc = spawn('node', [scriptPath], {
    stdio: 'inherit',
    env: process.env // Pass down parent environment variables
  });

  proc.on('close', (code) => {
    console.log(`❌ [${name}] process exited with code ${code}. Terminating all processes...`);
    process.exit(code || 1); // Exit main runner if any child exits
  });

  return proc;
}

console.log('🚀 Starting Event Calendar Application on Railway...');
startProcess(path.join(__dirname, 'calendar-server.js'), 'Server');
startProcess(path.join(__dirname, 'bot.js'), 'Bot');
